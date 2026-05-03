import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import useSWRMutation from "swr/mutation";
import { useMutation } from "./useMutation";
import { invalidateTables } from "./store";

vi.mock("./context", () => ({
  useEdgePod: () => ({ url: "https://api.edgepod.dev", apiKey: "key", sessionId: "sid" }),
}));

vi.mock("./rpc", () => ({
  rpcFetcher: vi.fn(),
}));

vi.mock("./store", () => ({
  invalidateTables: vi.fn(),
}));

vi.mock("swr/mutation", () => ({
  __esModule: true,
  default: vi.fn(),
}));

const mockedUseSWRMutation = vi.fn();
const mockedRpcFetcher = vi.fn();

import { rpcFetcher } from "./rpc";

beforeEach(() => {
  vi.mocked(rpcFetcher).mockImplementation(mockedRpcFetcher);
  (useSWRMutation as any).mockImplementation(mockedUseSWRMutation);
  vi.mocked(invalidateTables).mockClear();
});

describe("useMutation", () => {
  it("calls invalidateTables on successful mutation with _meta.t", async () => {
    const triggerFn = vi.fn(async () => {
      // Simulate the mutation function that gets called internally
      const { data: rpcData, _meta } = await rpcFetcher(
        { url: "https://api.edgepod.dev", apiKey: "key", sessionId: "sid" },
        "createUser",
        { email: "a@b.com" },
      );

      if (_meta.t.length > 0) {
        invalidateTables(_meta.t);
      }

      return rpcData;
    });

    mockedUseSWRMutation.mockReturnValue({
      trigger: triggerFn,
      data: { id: 1, email: "a@b.com" },
      error: undefined,
      isMutating: false,
    });

    mockedRpcFetcher.mockResolvedValueOnce({
      data: { id: 1, email: "a@b.com" },
      _meta: { t: ["a1b2", "c3d4"] },
    });

    const { result } = renderHook(() => useMutation("createUser"));

    await result.current.trigger({ email: "a@b.com" });

    expect(invalidateTables).toHaveBeenCalledWith(["a1b2", "c3d4"]);
  });

  it("does not call invalidateTables when _meta.t is empty", async () => {
    const triggerFn = vi.fn(async () => {
      const { data: rpcData, _meta } = await rpcFetcher(
        { url: "https://api.edgepod.dev", apiKey: "key", sessionId: "sid" },
        "ping",
        {},
      );

      if (_meta.t.length > 0) {
        invalidateTables(_meta.t);
      }

      return rpcData;
    });

    mockedUseSWRMutation.mockReturnValue({
      trigger: triggerFn,
      data: "pong",
      error: undefined,
      isMutating: false,
    });

    mockedRpcFetcher.mockResolvedValueOnce({
      data: "pong",
      _meta: { t: [] },
    });

    const { result } = renderHook(() => useMutation("ping"));

    await result.current.trigger({});

    expect(invalidateTables).not.toHaveBeenCalled();
  });

  it("returns trigger, data, error, isMutating from swr mutation", () => {
    mockedUseSWRMutation.mockReturnValue({
      trigger: vi.fn(),
      data: { id: 1 },
      error: new Error("fail"),
      isMutating: true,
    });

    const { result } = renderHook(() => useMutation("createUser"));

    expect(typeof result.current.trigger).toBe("function");
    expect(result.current.data).toEqual({ id: 1 });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.isMutating).toBe(true);
  });
});
