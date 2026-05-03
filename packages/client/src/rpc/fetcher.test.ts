import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rpcFetcher } from "./fetcher";

describe("rpcFetcher", () => {
  const ctx = {
    url: "https://api.edgepod.dev",
    apiKey: "test-key",
    sessionId: "test-session",
    wsStatus: "connected" as const,
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns data and _meta on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: { id: 1, name: "Alice" },
          _meta: { t: ["a1b2", "c3d4"] },
          warnings: [],
        }),
    } as Response);

    const result = await rpcFetcher<{ id: number; name: string }>(ctx, "getUser", { id: 1 });

    expect(result.data).toEqual({ id: 1, name: "Alice" });
    expect(result._meta.t).toEqual(["a1b2", "c3d4"]);
  });

  it("sends correct headers and POST body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: null,
          _meta: { t: [] },
        }),
    } as Response);

    await rpcFetcher(ctx, "createUser", { email: "a@b.com" });

    expect(fetch).toHaveBeenCalledWith("https://api.edgepod.dev/rpc/createUser", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Edgepod-Key": "test-key",
        "X-Edgepod-Session-Id": "test-session",
      },
      body: JSON.stringify({ email: "a@b.com" }),
    });
  });

  it("throws on non-ok HTTP response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    await expect(rpcFetcher(ctx, "getUser")).rejects.toThrow(
      "RPC failed: 500 Internal Server Error",
    );
  });

  it("throws on RPC error payload", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: false,
          error: "User not found",
        }),
    } as Response);

    await expect(rpcFetcher(ctx, "getUser")).rejects.toThrow("User not found");
  });

  it("defaults _meta.t to empty array when missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: null,
        }),
    } as Response);

    const result = await rpcFetcher(ctx, "getUser");
    expect(result._meta.t).toEqual([]);
  });
});
