import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import useSWR from "swr";
import { useQuery } from "./useQuery";
import { registerQuery, deregisterQuery } from "./store";

vi.mock("./context", () => ({
  useEdgePod: () => ({ url: "https://api.edgepod.dev", apiKey: "key", sessionId: "sid" }),
}));

vi.mock("./rpc", () => ({
  rpcFetcher: vi.fn(),
}));

vi.mock("./store", () => ({
  registerQuery: vi.fn(),
  deregisterQuery: vi.fn(),
}));

vi.mock("swr", () => ({
  __esModule: true,
  default: vi.fn(),
}));

const mockedRpcFetcher = vi.fn();
const mockedUseSWR = vi.fn();

// Replace the auto-mocked modules with our manual mocks
import { rpcFetcher } from "./rpc";

beforeEach(() => {
  vi.mocked(rpcFetcher).mockImplementation(mockedRpcFetcher);
  (useSWR as any).mockImplementation(mockedUseSWR);
  vi.mocked(registerQuery).mockClear();
  vi.mocked(deregisterQuery).mockClear();
});

describe("useQuery", () => {
  it("skips fetch when args is null", () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    const { result } = renderHook(() => useQuery("getUsers", null));

    expect(mockedUseSWR).toHaveBeenCalledWith(null, null, undefined);
    expect(result.current.data).toBeUndefined();
  });

  it("calls rpcFetcher and registers tables after success", async () => {
    const mutateFn = vi.fn();
    const swrData = {
      data: [{ id: 1 }],
      _meta: { t: ["a1b2", "c3d4"] },
    };

    mockedUseSWR.mockReturnValue({
      data: swrData,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: mutateFn,
    });

    renderHook(() => useQuery("getUsers", {}));

    // Wait for useEffect to run
    await waitFor(() => {
      expect(registerQuery).toHaveBeenCalledWith(["a1b2", "c3d4"], ["edgepod", "getUsers", {}]);
    });
  });

  it("deregisters on unmount", async () => {
    const swrData = {
      data: [{ id: 1 }],
      _meta: { t: ["a1b2"] },
    };

    mockedUseSWR.mockReturnValue({
      data: swrData,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    const { unmount } = renderHook(() => useQuery("getUsers", {}));

    await waitFor(() => {
      expect(registerQuery).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(deregisterQuery).toHaveBeenCalledWith(["a1b2"], ["edgepod", "getUsers", {}]);
    });
  });

  it("passes correct swr key format", () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderHook(() => useQuery("getUsers", { limit: 10 }));

    const matchingCall = mockedUseSWR.mock.calls.find(
      ([key]) =>
        Array.isArray(key) && key[0] === "edgepod" && key[1] === "getUsers" && key[2]?.limit === 10,
    );

    expect(matchingCall).toBeDefined();
    expect(typeof matchingCall![1]).toBe("function");
  });
});
