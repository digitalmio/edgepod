import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { createTrackedDb } from "../tools/createTrackedDb";
import { buildCascadeGraph } from "../tools/buildCascadeGraph";
import { initJwtSigner, getJwtSigner } from "./auth";
import { initLogger, createLogger } from "./logger";
import type {
  EdgePodSessionMap,
  EdgePodContext,
  CronDefinition,
  RpcRequest,
  RpcMeta,
  JsonValue,
} from "../types";
import { hashMetaTableNames, hashTableName } from "../tools/hashTableName";
import { scheduleNextAlarm, handleCronAlarm } from "./cron";

// neverthrow discriminated unions (Result<T, E>) are not serializable across
// Cloudflare Durable Object RPC boundaries because they carry prototype
// methods. We use a plain object union that survives RPC marshalling.
export type ExecuteRpcResult =
  | { success: true; data: unknown; meta: RpcMeta; warnings: string[] }
  | { success: false; error: string };

export class BaseEdgePodEngine extends DurableObject {
  private rawDb: ReturnType<typeof drizzle>;
  private activeSessions: EdgePodSessionMap = new Map();
  private cascadeGraph: Map<string, Set<string>> = new Map();
  protected userFunctions: Record<string, (...args: any[]) => Promise<JsonValue> | JsonValue> = {};
  protected cronFunctions: Record<string, CronDefinition<any, any, any>> = {};
  protected schema: Record<string, unknown> = {};
  protected migrations: {
    journal: unknown;
    migrations: Record<string, string>;
  } | null = null;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);

    this.rawDb = drizzle(ctx.storage, { logger: false });

    // Handle application-level ping/keepalive messages without waking the DO from hibernation.
    // Protocol-level WebSocket ping frames (RFC 6455) are handled by the runtime automatically
    // and do not interrupt hibernation. This covers application-level pings (e.g. from PartySocket).
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));

    // The Boot Sequence, aka run on every cold start (initialization or after hibernation)
    // Not awaited — blockConcurrencyWhile owns the promise internally.
    // Any throw inside will terminate the DO before accepting requests.
    this.ctx.blockConcurrencyWhile(async () => {
      this.restoreActiveSessions();

      this.cascadeGraph = buildCascadeGraph(this.schema);

      await initLogger();
      await initJwtSigner(this.env as any).match(
        () => {},
        (e) => console.warn("[EdgePod] JWT signer init failed:", e),
      );

      if (this.migrations) {
        await migrate(this.rawDb, this.migrations as any);
      }

      // Schedule the first alarm on cold start. This replaces any existing alarm,
      // which is safe — when the DO wakes from hibernation for an RPC request (not
      // alarm), the recomputed soonest-next-fire will be ≤ the previously pending
      // alarm time, so no cron run is lost. When the DO wakes because an alarm fired,
      // the alarm has already been consumed and alarm() will fire regardless.
      if (Object.keys(this.cronFunctions).length > 0) {
        await scheduleNextAlarm(this.cronFunctions, (ms) => this.ctx.storage.setAlarm(ms));
      }
    });
  }

  // WebSocket Connection Management
  override async fetch(request: Request) {
    const url = new URL(request.url);

    // Handle WebSocket Upgrades
    if (request.headers.get("Upgrade") === "websocket") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) return new Response("Missing sessionId", { status: 400 });

      // Close any existing session with this id to prevent orphaned entries
      // and subscription hijacking. Last-writer-wins handles legitimate
      // PartySocket reconnects where webSocketClose hasn't fired yet (race),
      // as well as accidental/malicious sessionId collisions.
      this.closeExistingSession(sessionId);

      const { 0: client, 1: server } = new WebSocketPair();

      this.ctx.acceptWebSocket(server);

      // Serialize the sessionId as a hibernation-safe attachment so it can be restored on wake
      server.serializeAttachment({
        sessionId,
        listeningToTables: [] as string[],
      });

      // Register the new session in RAM
      this.activeSessions.set(sessionId, {
        socket: server,
        listeningToTables: new Set(),
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  // EdgePod WebSockets are one-directional (server → client invalidations).
  // Incoming messages are not expected; application-level pings are handled
  // by setWebSocketAutoResponse so they do not wake the DO from hibernation.
  // Any message that reaches this handler is a protocol violation.
  override webSocketMessage(ws: WebSocket, _message: string | ArrayBuffer) {
    try {
      ws.close(1008, "Policy Violation: This endpoint is send-only.");
    } catch {
      // Socket already closing; ignore.
    }
  }

  // Handle WebSocket disconnects to prevent memory leaks
  override webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.socket === ws) {
        this.activeSessions.delete(sessionId);
        break;
      }
    }
  }

  // Close and remove an existing session with the given sessionId, if any.
  // Called before accepting a new WebSocket upgrade to prevent orphaned
  // sockets and subscription hijacking from duplicate sessionIds.
  private closeExistingSession(sessionId: string): void {
    const existing = this.activeSessions.get(sessionId);
    if (!existing) return;

    try {
      existing.socket.close(1001, "Replaced");
    } catch {
      // Socket already closing; ignore.
    }
    this.activeSessions.delete(sessionId);
  }

  // Cron
  override async alarm(): Promise<void> {
    await handleCronAlarm(
      this.cronFunctions,
      (ms) => this.ctx.storage.setAlarm(ms),
      this.rawDb,
      this.env,
      this.activeSessions,
      this.cascadeGraph,
      (tables) => this.broadcastInvalidations(tables),
    );
  }

  // RPC Execution Engine
  // aka this is where we are running user code
  async executeRpc(functionName: string, args: any, rpcCtx: RpcRequest): Promise<ExecuteRpcResult> {
    const { headers, user, traceId, reactive, sessionId } = rpcCtx;

    const handler = this.userFunctions[functionName];
    if (!handler)
      return { success: false, error: `NOT_FOUND: Function "${functionName}" not found.` };

    // session variable store
    const variableStore = new Map();

    // Prepare the read/write trackers for this specific run
    const tablesRead = new Set<string>();
    const tablesWritten = new Set<string>();
    const warnings: string[] = [];

    // When reactive is false, pass an empty session map so no table subscriptions are registered
    const sessionMap = reactive ? this.activeSessions : new Map();

    // Instantiate the Proxy
    const dbProxy = createTrackedDb(
      this.rawDb,
      sessionId,
      sessionMap,
      tablesRead,
      tablesWritten,
      this.cascadeGraph,
      warnings,
    );

    // Build the Context
    const edgepodCtx: EdgePodContext<any, any, Record<string, any>> = {
      db: dbProxy as any,
      unsafeRawDb: this.rawDb,
      user,
      env: this.env,
      headers,
      log: createLogger(traceId),
      signJwt:
        getJwtSigner() ??
        (() => {
          throw new Error(
            "[EdgePod] JWT signing is not configured. Set EDGEPOD_JWT_PRIVATE_KEY and use local auth mode.",
          );
        }),
      subscribeTo: (tables: string[]) => {
        const session = this.activeSessions.get(sessionId);
        if (session) {
          tables.forEach((t) => session.listeningToTables.add(hashTableName(t)));
          // Keep the attachment in sync so subscriptions survive hibernation
          session.socket.serializeAttachment({
            sessionId,
            listeningToTables: Array.from(session.listeningToTables),
          });
        }
      },
      invalidate: (tables: string[]) => tables.forEach((t: string) => tablesWritten.add(t)),
      set: (key: string, value: any) => variableStore.set(key, value),
      get: (key: string) => variableStore.get(key) as any,
    };

    // Execute the user's code
    try {
      const data = await handler(edgepodCtx, args);

      if (tablesWritten.size > 0) {
        const hashedTableNames = hashMetaTableNames(Array.from(tablesWritten));
        this.broadcastInvalidations(hashedTableNames);
      }

      return {
        success: true,
        data,
        meta: { read: [...tablesRead], changed: [...tablesWritten] },
        warnings,
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private restoreActiveSessions() {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as {
        sessionId: string;
        listeningToTables: string[];
      } | null;
      if (attachment) {
        this.activeSessions.set(attachment.sessionId, {
          socket: ws,
          listeningToTables: new Set(attachment.listeningToTables),
        });
      }
    }
  }

  private broadcastInvalidations(tables: string[]) {
    const payload = JSON.stringify({ action: "invalidate", tables });

    for (const [sessionId, session] of this.activeSessions.entries()) {
      const isListening = tables.some((t) => session.listeningToTables.has(t));

      if (isListening) {
        try {
          session.socket.send(payload);
        } catch {
          // Close and delete sessions with broken sockets as they might be dead
          try {
            session.socket.close(1011, "Connection error");
          } catch {
            // Socket already closing; ignore.
          }
          this.activeSessions.delete(sessionId);
        }
      }
    }
  }
}
