import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BaseEdgePodEngine } from "./do";
import type { RpcRequest } from "../types";

vi.mock("cloudflare:workers", () => ({
  DurableObject: vi.fn(function (this: { ctx: unknown; env: unknown }, ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }),
}));

vi.mock("./auth", () => ({
  verifyJwt: vi.fn(async () => ({ isErr: () => false, value: { sub: "user-123" } })),
  initJwtSigner: vi.fn(async () => ({ match: vi.fn() })),
  getJwtSigner: vi.fn(() => null),
}));

vi.mock("../tools/hashTableName", () => ({
  hashMetaTableNames: vi.fn((names: string[]) => names),
}));

type EdgePodStub = {
  executeRpc(
    functionName: string,
    args: unknown,
    rpcCtx: RpcRequest,
  ): ReturnType<BaseEdgePodEngine["executeRpc"]>;
  fetch(request: Request): Promise<Response>;
};

const makeRequest = (path: string, body = {}) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "X-Edgepod-Key": "test-api-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("edgePodFetch RPC error status codes", () => {
  let edgePodFetch: (typeof import("./index"))["edgePodFetch"];
  let mockStub: EdgePodStub;
  let mockEnv: { EDGEPOD_DO: any; EDGEPOD_API_KEY: string };

  beforeEach(async () => {
    vi.resetModules();

    const { edgePodFetch: fetch } = await import("./index");
    edgePodFetch = fetch;

    mockStub = {
      executeRpc: vi.fn(),
      fetch: vi.fn(),
    };

    const mockNamespace = {
      idFromName: vi.fn(() => "test-id"),
      get: vi.fn(() => mockStub),
    };

    mockEnv = {
      EDGEPOD_DO: mockNamespace,
      EDGEPOD_API_KEY: "test-api-key",
    };
  });

  it("returns 404 for NOT_FOUND: errors", async () => {
    mockStub.executeRpc.mockResolvedValue({
      success: false,
      error: "NOT_FOUND: Function not found",
    });

    const response = await edgePodFetch(makeRequest("/rpc/missing"), mockEnv as any, ["missing"]);
    expect(response.status).toBe(404);
  });

  it("returns 401 for UNAUTHORIZED: errors", async () => {
    mockStub.executeRpc.mockResolvedValue({
      success: false,
      error: "UNAUTHORIZED: Bearer token required",
    });

    const response = await edgePodFetch(makeRequest("/rpc/protected"), mockEnv as any, [
      "protected",
    ]);
    expect(response.status).toBe(401);
  });

  it("returns 500 for generic errors", async () => {
    mockStub.executeRpc.mockResolvedValue({
      success: false,
      error: "Something went wrong",
    });

    const response = await edgePodFetch(makeRequest("/rpc/broken"), mockEnv as any, ["broken"]);
    expect(response.status).toBe(500);
  });

  it("returns 404 without waking DO for unknown function", async () => {
    const response = await edgePodFetch(makeRequest("/rpc/nonExistent"), mockEnv as any, [
      "knownFn",
    ]);
    expect(response.status).toBe(404);
    expect(mockStub.executeRpc).not.toHaveBeenCalled();
  });
});

describe("edgePodFetch CORS", () => {
  let edgePodFetch: (typeof import("./index"))["edgePodFetch"];
  let mockStub: EdgePodStub;
  let mockEnv: { EDGEPOD_DO: any; EDGEPOD_API_KEY: string };

  beforeEach(async () => {
    vi.resetModules();

    const { edgePodFetch: fetch } = await import("./index");
    edgePodFetch = fetch;

    mockStub = {
      executeRpc: vi.fn(),
      fetch: vi.fn(),
    };

    const mockNamespace = {
      idFromName: vi.fn(() => "test-id"),
      get: vi.fn(() => mockStub),
    };

    mockEnv = {
      EDGEPOD_DO: mockNamespace,
      EDGEPOD_API_KEY: "test-api-key",
    };
  });

  it("returns 204 for OPTIONS preflight with CORS headers", async () => {
    const response = await edgePodFetch(
      new Request("http://localhost/rpc/test", { method: "OPTIONS" }),
      mockEnv as any,
      ["test"],
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
    expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
  });

  it("includes CORS headers on successful RPC response", async () => {
    mockStub.executeRpc.mockResolvedValue({
      success: true,
      data: { id: 1 },
      meta: { read: [], changed: [] },
      warnings: [],
    });

    const response = await edgePodFetch(makeRequest("/rpc/getUser"), mockEnv as any, ["getUser"]);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("includes CORS headers on 401 error response", async () => {
    const response = await edgePodFetch(
      new Request("http://localhost/rpc/test", {
        method: "POST",
        headers: { "X-Edgepod-Key": "wrong-key" },
      }),
      mockEnv as any,
      ["test"],
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("includes CORS headers on 404 error response", async () => {
    const response = await edgePodFetch(makeRequest("/rpc/unknown"), mockEnv as any, ["known"]);

    expect(response.status).toBe(404);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("edgePodFetch GET and ?key= restrictions", () => {
  let edgePodFetch: (typeof import("./index"))["edgePodFetch"];
  let mockStub: EdgePodStub;
  let mockEnv: { EDGEPOD_DO: any; EDGEPOD_API_KEY: string };

  beforeEach(async () => {
    vi.resetModules();

    const { edgePodFetch: fetch } = await import("./index");
    edgePodFetch = fetch;

    mockStub = { executeRpc: vi.fn(), fetch: vi.fn() };

    const mockNamespace = {
      idFromName: vi.fn(() => "test-id"),
      get: vi.fn(() => mockStub),
    };

    mockEnv = { EDGEPOD_DO: mockNamespace, EDGEPOD_API_KEY: "test-api-key" };
  });

  it("rejects GET /rpc/ with 405", async () => {
    const response = await edgePodFetch(
      new Request("http://localhost/rpc/getUser", {
        method: "GET",
        headers: { "X-Edgepod-Key": "test-api-key" },
      }),
      mockEnv as any,
      ["getUser"],
    );

    expect(response.status).toBe(405);
    expect(mockStub.executeRpc).not.toHaveBeenCalled();
  });

  it("rejects ?key= on /rpc/ (header required)", async () => {
    const response = await edgePodFetch(
      new Request("http://localhost/rpc/getUser?key=test-api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      mockEnv as any,
      ["getUser"],
    );

    expect(response.status).toBe(401);
  });

  it("allows ?key= on WS upgrade", async () => {
    const response = await edgePodFetch(
      new Request("http://localhost/ws?key=test-api-key", {
        headers: { Upgrade: "websocket" },
      }),
      mockEnv as any,
      [],
    );

    // WS upgrade is forwarded to the DO stub; 101 means it went through
    expect(mockStub.fetch).toHaveBeenCalled();
  });
});

describe("edgePodFetch body-size limit", () => {
  let edgePodFetch: (typeof import("./index"))["edgePodFetch"];
  let mockStub: EdgePodStub;
  let mockEnv: { EDGEPOD_DO: any; EDGEPOD_API_KEY: string };

  beforeEach(async () => {
    vi.resetModules();

    const { edgePodFetch: fetch } = await import("./index");
    edgePodFetch = fetch;

    mockStub = { executeRpc: vi.fn(), fetch: vi.fn() };

    const mockNamespace = {
      idFromName: vi.fn(() => "test-id"),
      get: vi.fn(() => mockStub),
    };

    mockEnv = { EDGEPOD_DO: mockNamespace, EDGEPOD_API_KEY: "test-api-key" };
  });

  it("returns 413 when Content-Length exceeds default limit", async () => {
    const largePayload = "x".repeat(11 * 1024 * 1024);
    const response = await edgePodFetch(
      new Request("http://localhost/rpc/test", {
        method: "POST",
        headers: {
          "X-Edgepod-Key": "test-api-key",
          "Content-Type": "application/json",
          "Content-Length": String(11 * 1024 * 1024),
        },
        body: largePayload,
      }),
      mockEnv as any,
      ["test"],
    );

    expect(response.status).toBe(413);
    expect(mockStub.executeRpc).not.toHaveBeenCalled();
  });

  it("returns 413 when body exceeds limit without Content-Length", async () => {
    const largePayload = "x".repeat(11 * 1024 * 1024);
    const response = await edgePodFetch(
      new Request("http://localhost/rpc/test", {
        method: "POST",
        headers: {
          "X-Edgepod-Key": "test-api-key",
          "Content-Type": "application/json",
        },
        body: largePayload,
      }),
      mockEnv as any,
      ["test"],
    );

    expect(response.status).toBe(413);
    expect(mockStub.executeRpc).not.toHaveBeenCalled();
  });

  it("accepts body under the limit", async () => {
    mockStub.executeRpc.mockResolvedValue({
      success: true,
      data: { ok: true },
      meta: { read: [], changed: [] },
      warnings: [],
    });

    const response = await edgePodFetch(
      new Request("http://localhost/rpc/test", {
        method: "POST",
        headers: {
          "X-Edgepod-Key": "test-api-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ foo: "bar" }),
      }),
      mockEnv as any,
      ["test"],
    );

    expect(response.status).toBe(200);
    expect(mockStub.executeRpc).toHaveBeenCalledTimes(1);
  });

  it("rejects body larger than configured EDGEPOD_MAX_BODY_BYTES", async () => {
    const envWithLimit = { ...mockEnv, EDGEPOD_MAX_BODY_BYTES: "100" };
    const response = await edgePodFetch(
      new Request("http://localhost/rpc/test", {
        method: "POST",
        headers: {
          "X-Edgepod-Key": "test-api-key",
          "Content-Type": "application/json",
        },
        body: "x".repeat(200),
      }),
      envWithLimit as any,
      ["test"],
    );

    expect(response.status).toBe(413);
    expect(mockStub.executeRpc).not.toHaveBeenCalled();
  });
});

describe("edgePodFetch header filtering", () => {
  let edgePodFetch: (typeof import("./index"))["edgePodFetch"];
  let mockStub: EdgePodStub;
  let mockEnv: { EDGEPOD_DO: any; EDGEPOD_API_KEY: string };

  beforeEach(async () => {
    vi.resetModules();

    const { edgePodFetch: fetch } = await import("./index");
    edgePodFetch = fetch;

    mockStub = { executeRpc: vi.fn(), fetch: vi.fn() };

    const mockNamespace = {
      idFromName: vi.fn(() => "test-id"),
      get: vi.fn(() => mockStub),
    };

    mockEnv = { EDGEPOD_DO: mockNamespace, EDGEPOD_API_KEY: "test-api-key" };
  });

  it("strips Authorization and X-Edgepod-Key from ctx.headers", async () => {
    mockStub.executeRpc.mockResolvedValue({
      success: true,
      data: {},
      meta: { read: [], changed: [] },
      warnings: [],
    });

    await edgePodFetch(
      new Request("http://localhost/rpc/test", {
        method: "POST",
        headers: {
          "X-Edgepod-Key": "test-api-key",
          "Content-Type": "application/json",
          Authorization: "Bearer some-jwt-token",
          "X-Custom-Header": "keep-me",
        },
        body: "{}",
      }),
      mockEnv as any,
      ["test"],
    );

    const rpcCtx = mockStub.executeRpc.mock.calls[0][2] as RpcRequest;
    expect(rpcCtx.headers["authorization"]).toBeUndefined();
    expect(rpcCtx.headers["x-edgepod-key"]).toBeUndefined();
    expect(rpcCtx.headers["x-custom-header"]).toBe("keep-me");
  });

  it("passes sessionId explicitly in RpcRequest", async () => {
    mockStub.executeRpc.mockResolvedValue({
      success: true,
      data: {},
      meta: { read: [], changed: [] },
      warnings: [],
    });

    await edgePodFetch(
      new Request("http://localhost/rpc/test", {
        method: "POST",
        headers: {
          "X-Edgepod-Key": "test-api-key",
          "Content-Type": "application/json",
          "X-Edgepod-Session-Id": "my-session-123",
        },
        body: "{}",
      }),
      mockEnv as any,
      ["test"],
    );

    const rpcCtx = mockStub.executeRpc.mock.calls[0][2] as RpcRequest;
    expect(rpcCtx.sessionId).toBe("my-session-123");
    expect(rpcCtx.headers["x-edgepod-session-id"]).toBeUndefined();
    expect(rpcCtx.headers["X-Edgepod-Session-Id"]).toBeUndefined();
  });

  it("defaults sessionId to 'anonymous' when header is absent", async () => {
    mockStub.executeRpc.mockResolvedValue({
      success: true,
      data: {},
      meta: { read: [], changed: [] },
      warnings: [],
    });

    await edgePodFetch(
      new Request("http://localhost/rpc/test", {
        method: "POST",
        headers: {
          "X-Edgepod-Key": "test-api-key",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      mockEnv as any,
      ["test"],
    );

    const rpcCtx = mockStub.executeRpc.mock.calls[0][2] as RpcRequest;
    expect(rpcCtx.sessionId).toBe("anonymous");
  });
});
