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
