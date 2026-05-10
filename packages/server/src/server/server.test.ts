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
      isErr: () => true,
      match: (_ok: unknown, err: (msg: string) => Response) => err("NOT_FOUND: Function not found"),
    });

    const response = await edgePodFetch(makeRequest("/rpc/missing"), mockEnv as any, ["missing"]);
    expect(response.status).toBe(404);
  });

  it("returns 401 for UNAUTHORIZED: errors", async () => {
    mockStub.executeRpc.mockResolvedValue({
      isErr: () => true,
      match: (_ok: unknown, err: (msg: string) => Response) =>
        err("UNAUTHORIZED: Bearer token required"),
    });

    const response = await edgePodFetch(makeRequest("/rpc/protected"), mockEnv as any, [
      "protected",
    ]);
    expect(response.status).toBe(401);
  });

  it("returns 500 for generic errors", async () => {
    mockStub.executeRpc.mockResolvedValue({
      isErr: () => true,
      match: (_ok: unknown, err: (msg: string) => Response) => err("Something went wrong"),
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
      isErr: () => false,
      match: (ok: (v: any) => Response) =>
        ok({ data: { id: 1 }, meta: { read: [] }, warnings: [] }),
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
