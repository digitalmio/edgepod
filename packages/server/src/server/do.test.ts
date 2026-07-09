import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: vi.fn(function (this: { ctx: unknown; env: unknown }, ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }),
}));

class MockWebSocketRequestResponsePair {
  constructor(
    public request: string,
    public response: string,
  ) {}
}

vi.stubGlobal("WebSocketRequestResponsePair", MockWebSocketRequestResponsePair);

vi.mock("drizzle-orm/durable-sqlite", () => ({
  drizzle: vi.fn(() => ({})),
}));

vi.mock("drizzle-orm/durable-sqlite/migrator", () => ({
  migrate: vi.fn(),
}));

vi.mock("../tools/createTrackedDb", () => ({
  createTrackedDb: vi.fn(),
}));

vi.mock("../tools/buildCascadeGraph", () => ({
  buildCascadeGraph: vi.fn(() => new Map()),
}));

vi.mock("./auth", () => ({
  initJwtSigner: vi.fn(async () => ({ match: vi.fn() })),
  getJwtSigner: vi.fn(() => null),
}));

vi.mock("./logger", () => ({
  initLogger: vi.fn(),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

vi.mock("../tools/hashTableName", () => ({
  hashMetaTableNames: vi.fn((names: string[]) => names),
}));

describe("BaseEdgePodEngine.webSocketMessage", () => {
  let mockWs: WebSocket;
  let engine: InstanceType<(typeof import("./do"))["BaseEdgePodEngine"]>;

  beforeEach(async () => {
    vi.resetModules();

    const { BaseEdgePodEngine } = await import("./do");

    mockWs = {
      close: vi.fn(),
      serializeAttachment: vi.fn(),
    } as unknown as WebSocket;

    const mockCtx = {
      storage: {},
      setWebSocketAutoResponse: vi.fn(),
      blockConcurrencyWhile: vi.fn(async (fn) => {
        await fn();
      }),
      getWebSockets: vi.fn(() => []),
    } as unknown as DurableObjectState;

    engine = new BaseEdgePodEngine(mockCtx, {} as Cloudflare.Env);
  });

  it("closes the websocket with 1008 on string message", () => {
    engine.webSocketMessage(mockWs, "unexpected data");

    expect(mockWs.close).toHaveBeenCalledWith(
      1008,
      "Policy Violation: This endpoint is send-only.",
    );
  });

  it("closes the websocket with 1008 on ArrayBuffer message", () => {
    engine.webSocketMessage(mockWs, new ArrayBuffer(8));

    expect(mockWs.close).toHaveBeenCalledWith(
      1008,
      "Policy Violation: This endpoint is send-only.",
    );
  });

  it("does not throw when socket is already closing", () => {
    vi.mocked(mockWs.close).mockImplementation(() => {
      throw new Error("socket already closing");
    });

    expect(() => engine.webSocketMessage(mockWs, "unexpected data")).not.toThrow();
  });
});

describe("BaseEdgePodEngine session lifecycle", () => {
  let mockWs1: WebSocket;
  let mockWs2: WebSocket;
  let engine: InstanceType<(typeof import("./do"))["BaseEdgePodEngine"]>;

  beforeEach(async () => {
    vi.resetModules();

    const { BaseEdgePodEngine } = await import("./do");

    mockWs1 = { close: vi.fn(), serializeAttachment: vi.fn() } as unknown as WebSocket;
    mockWs2 = { close: vi.fn(), serializeAttachment: vi.fn() } as unknown as WebSocket;

    const mockCtx = {
      storage: {},
      acceptWebSocket: vi.fn(),
      setWebSocketAutoResponse: vi.fn(),
      blockConcurrencyWhile: vi.fn(async (fn: () => Promise<void>) => {
        await fn();
      }),
      getWebSockets: vi.fn(() => []),
    } as unknown as DurableObjectState;

    engine = new BaseEdgePodEngine(mockCtx, {} as Cloudflare.Env);
  });

  it("cleans up sessions on webSocketClose", () => {
    const sessions = (engine as unknown as Record<string, unknown>).activeSessions as Map<
      string,
      { socket: WebSocket; listeningToTables: Set<string> }
    >;
    sessions.set("s1", { socket: mockWs1, listeningToTables: new Set() });
    sessions.set("s2", { socket: mockWs2, listeningToTables: new Set() });

    engine.webSocketClose(mockWs1, 1000, "", true);

    expect(sessions.has("s1")).toBe(false);
    expect(sessions.get("s2")?.socket).toBe(mockWs2);
    expect(sessions.size).toBe(1);
  });

  it("handles webSocketClose for socket not in the map gracefully", () => {
    const sessions = (engine as unknown as Record<string, unknown>).activeSessions as Map<
      string,
      { socket: WebSocket; listeningToTables: Set<string> }
    >;
    sessions.set("s1", { socket: mockWs1, listeningToTables: new Set() });

    // This socket is not in the map — should not throw
    expect(() => engine.webSocketClose(mockWs2, 1000, "", true)).not.toThrow();
    expect(sessions.size).toBe(1);
  });

  it("closeExistingSession closes old socket and removes the entry", () => {
    const sessions = (engine as unknown as Record<string, unknown>).activeSessions as Map<
      string,
      { socket: WebSocket; listeningToTables: Set<string> }
    >;

    sessions.set("dup", { socket: mockWs1, listeningToTables: new Set(["users"]) });

    (engine as unknown as { closeExistingSession: (id: string) => void }).closeExistingSession(
      "dup",
    );

    expect(mockWs1.close).toHaveBeenCalledWith(1001, "Replaced");
    expect(sessions.has("dup")).toBe(false);
  });

  it("closeExistingSession is a no-op when sessionId is not in the map", () => {
    const sessions = (engine as unknown as Record<string, unknown>).activeSessions as Map<
      string,
      { socket: WebSocket; listeningToTables: Set<string> }
    >;
    sessions.set("s1", { socket: mockWs1, listeningToTables: new Set() });

    (engine as unknown as { closeExistingSession: (id: string) => void }).closeExistingSession(
      "nonexistent",
    );

    expect(mockWs1.close).not.toHaveBeenCalled();
    expect(sessions.size).toBe(1);
  });

  it("closeExistingSession handles close() throwing gracefully", () => {
    const sessions = (engine as unknown as Record<string, unknown>).activeSessions as Map<
      string,
      { socket: WebSocket; listeningToTables: Set<string> }
    >;

    vi.mocked(mockWs1.close).mockImplementation(() => {
      throw new Error("socket already closing");
    });
    sessions.set("dup", { socket: mockWs1, listeningToTables: new Set() });

    expect(() =>
      (engine as unknown as { closeExistingSession: (id: string) => void }).closeExistingSession(
        "dup",
      ),
    ).not.toThrow();
    expect(sessions.has("dup")).toBe(false);
  });
});

describe("BaseEdgePodEngine.broadcastInvalidations", () => {
  let mockWs: WebSocket;
  let engine: InstanceType<(typeof import("./do"))["BaseEdgePodEngine"]>;

  beforeEach(async () => {
    vi.resetModules();

    const { BaseEdgePodEngine } = await import("./do");

    mockWs = {
      close: vi.fn(),
      send: vi.fn(),
      serializeAttachment: vi.fn(),
    } as unknown as WebSocket;

    const mockCtx = {
      storage: {},
      acceptWebSocket: vi.fn(),
      setWebSocketAutoResponse: vi.fn(),
      blockConcurrencyWhile: vi.fn(async (fn: () => Promise<void>) => {
        await fn();
      }),
      getWebSockets: vi.fn(() => []),
    } as unknown as DurableObjectState;

    engine = new BaseEdgePodEngine(mockCtx, {} as Cloudflare.Env);
  });

  it("closes and deletes sessions with broken sockets", () => {
    const sessions = (engine as unknown as Record<string, unknown>).activeSessions as Map<
      string,
      { socket: WebSocket; listeningToTables: Set<string> }
    >;

    // Set up a session listening to "users" table with a broken send
    vi.mocked(mockWs.send).mockImplementation(() => {
      throw new Error("socket is closed");
    });
    sessions.set("broken", {
      socket: mockWs,
      listeningToTables: new Set(["users"]),
    });

    (
      engine as unknown as { broadcastInvalidations: (tables: string[]) => void }
    ).broadcastInvalidations(["users"]);

    expect(mockWs.close).toHaveBeenCalledWith(1011, "Connection error");
    expect(sessions.has("broken")).toBe(false);
  });

  it("does not close sessions that are not listening to the invalidated table", () => {
    const sessions = (engine as unknown as Record<string, unknown>).activeSessions as Map<
      string,
      { socket: WebSocket; listeningToTables: Set<string> }
    >;

    sessions.set("unrelated", {
      socket: mockWs,
      listeningToTables: new Set(["posts"]),
    });

    (
      engine as unknown as { broadcastInvalidations: (tables: string[]) => void }
    ).broadcastInvalidations(["users"]);

    expect(mockWs.close).not.toHaveBeenCalled();
    expect(sessions.size).toBe(1);
  });
});

describe("BaseEdgePodEngine.executeRpc signJwt guard", () => {
  let engine: InstanceType<(typeof import("./do"))["BaseEdgePodEngine"]>;

  beforeEach(async () => {
    vi.resetModules();

    const { BaseEdgePodEngine } = await import("./do");

    const mockCtx = {
      storage: {},
      acceptWebSocket: vi.fn(),
      setWebSocketAutoResponse: vi.fn(),
      blockConcurrencyWhile: vi.fn(async (fn: () => Promise<void>) => {
        await fn();
      }),
      getWebSockets: vi.fn(() => []),
    } as unknown as DurableObjectState;

    engine = new BaseEdgePodEngine(mockCtx, {} as Cloudflare.Env);
  });

  it("throws a helpful error when signJwt is called but not configured", async () => {
    // getJwtSigner is mocked to return null, so the fallback guard is used
    (engine as unknown as Record<string, unknown>).userFunctions = {
      testSignJwt: async (ctx: {
        signJwt: (claims: Record<string, unknown>) => Promise<string>;
      }) => {
        await ctx.signJwt({ sub: "test" });
        return null;
      },
    };

    const result = await engine.executeRpc(
      "testSignJwt",
      {},
      { headers: {}, user: null, traceId: "test", reactive: false, sessionId: "test" },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("JWT signing is not configured");
      expect(result.error).toContain("EDGEPOD_JWT_PRIVATE_KEY");
    }
  });
});
