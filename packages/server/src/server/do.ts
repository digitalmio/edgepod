import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import { createTrackedDb } from "../tools/createTrackedDb";
import { buildCascadeGraph } from "../tools/buildCascadeGraph";
import { initJwtSigner, getJwtSigner } from "./auth";
import { initLogger, createLogger } from "./logger";
import type { EdgePodSessionMap, EdgePodContext, RpcRequest, JsonValue } from "../types";

export class BaseEdgePodEngine extends DurableObject {
  private rawDb: ReturnType<typeof drizzle>;
  private activeSessions: EdgePodSessionMap = new Map();
  private cascadeGraph: Map<string, Set<string>> = new Map();
  protected userFunctions: Record<string, (...args: any[]) => Promise<JsonValue> | JsonValue> = {};
  protected schema: Record<string, unknown> = {};
  protected migrations: { journal: unknown; migrations: Record<string, string> } | null = null;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);

    this.rawDb = drizzle(ctx.storage, { logger: true });

    // The Boot Sequence, aka run on every cold start (initialization or after hibernation)
    // Not awaited — blockConcurrencyWhile owns the promise internally.
    // Any throw inside will terminate the DO before accepting requests.
    this.ctx.blockConcurrencyWhile(async () => {
      this.restoreActiveSessions();

      this.cascadeGraph = buildCascadeGraph(this.schema);

      await initLogger();
      await initJwtSigner(this.env as any);

      if (this.migrations) {
        await migrate(this.rawDb, this.migrations as any);
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

      const { 0: client, 1: server } = new WebSocketPair();

      this.ctx.acceptWebSocket(server);

      // Serialize the sessionId as a hibernation-safe attachment so it can be restored on wake
      server.serializeAttachment({ sessionId, listeningToTables: [] as string[] });

      // Register the new session in RAM
      this.activeSessions.set(sessionId, {
        socket: server,
        listeningToTables: new Set(),
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
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

  // The RPC Execution Engine
  // aka this is where we are running user code
  async executeRpc(functionName: string, args: any, rpcCtx: RpcRequest) {
    const { headers, user, traceId, reactive } = rpcCtx;
    const sessionId = headers["x-edgepod-session-id"] || "anonymous";

    const handler = this.userFunctions[functionName];
    if (!handler) throw new Error(`NOT_FOUND: Function "${functionName}" not found.`);

    // session variable store
    const variableStore = new Map();

    // Prepare the mutation tracker for this specific run
    const tablesWritten = new Set<string>();
    const warnings: string[] = [];

    // When reactive is false, pass an empty session map so no table subscriptions are registered
    const sessionMap = reactive ? this.activeSessions : new Map();

    // Instantiate the Proxy
    const dbProxy = createTrackedDb(
      this.rawDb,
      sessionId,
      sessionMap,
      tablesWritten,
      this.cascadeGraph,
      warnings
    );

    // Build the Context
    const edgepodCtx: EdgePodContext<any, any, Record<string, any>> = {
      db: dbProxy as any,
      unsafeRawDb: this.rawDb,
      user,
      env: this.env,
      headers,
      log: createLogger(traceId),
      signJwt: getJwtSigner(),
      subscribeTo: (tables: string[]) => {
        const session = this.activeSessions.get(sessionId);
        if (session) {
          tables.forEach((t) => session.listeningToTables.add(t));
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
    let data: Awaited<ReturnType<typeof handler>>;
    try {
      data = await handler(edgepodCtx, args);
    } catch (e) {
      // Re-throw as a plain Error so the DO runtime doesn't swallow the message
      throw new Error(e instanceof Error ? e.message : String(e), { cause: e });
    }

    if (tablesWritten.size > 0) {
      this.broadcastInvalidations(Array.from(tablesWritten));
    }

    return { data, warnings };
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
          // delete sessions with broken sockets as they might be dead
          this.activeSessions.delete(sessionId);
        }
      }
    }
  }
}
