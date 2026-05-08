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
  beforeEach(() => {
    vi.resetModules();
  });

  it("closes the websocket with 1008 on any incoming message", async () => {
    const { BaseEdgePodEngine } = await import("./do");

    const mockWs = {
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

    const mockEnv = {} as Cloudflare.Env;

    const engine = new BaseEdgePodEngine(mockCtx, mockEnv);

    engine.webSocketMessage(mockWs, "unexpected data");

    expect(mockWs.close).toHaveBeenCalledWith(
      1008,
      "Policy Violation: This endpoint is send-only.",
    );
  });

  it("closes the websocket even for ArrayBuffer messages", async () => {
    const { BaseEdgePodEngine } = await import("./do");

    const mockWs = {
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

    const mockEnv = {} as Cloudflare.Env;

    const engine = new BaseEdgePodEngine(mockCtx, mockEnv);

    const buffer = new ArrayBuffer(8);
    engine.webSocketMessage(mockWs, buffer);

    expect(mockWs.close).toHaveBeenCalledWith(
      1008,
      "Policy Violation: This endpoint is send-only.",
    );
  });
});
