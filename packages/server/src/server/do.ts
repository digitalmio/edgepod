// @edgepod/server/do.ts
import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";

export class BaseEdgePodEngine extends DurableObject {
  userFunctions: Record<string, Function> = {};
  storage: DurableObjectStorage;
  db: ReturnType<typeof drizzle>;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.storage = ctx.storage;
    this.db = drizzle(this.storage);

    // auto-respond to WebSocket pings (keep-alive) without waking from the hibernation
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));

    // todo: implement blockConcurrencyWhile
  }

  // ==========================================
  // NATIVE RPC HANDLER (Called by the Worker)
  // ==========================================
  async executeRpc(functionName: string, args: any) {
    const rpcHandler = this.userFunctions[functionName];

    if (!rpcHandler) {
      throw new Error(`Function ${functionName} not found`);
    }

    // Build the Request Context
    const variableStore = new Map();
    const ctx = {
      db: this.db,
      env: this.env,
      set: (key: string, value: unknown) => variableStore.set(key, value),
      get: (key: string) => variableStore.get(key),
      var: Object.fromEntries(variableStore),
    };

    // Execute the user's code and return the raw JS object
    // Cloudflare natively sends this back to the Worker!
    return await rpcHandler(ctx, args);
  }

  // ==========================================
  // WEBSOCKET HANDLER (Called by stub.fetch)
  // ==========================================
  override async fetch(_request: Request): Promise<Response> {
    // We accept the WebSocket connection and store it in memory
    const webSocketPair = new WebSocketPair();
    const client = webSocketPair[0];
    const server = webSocketPair[1];

    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}
