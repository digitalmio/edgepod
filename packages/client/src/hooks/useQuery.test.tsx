import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import useSWR from "swr";
import { EdgePodProvider } from "../provider/provider";
import { useInternalQuery } from "./useQuery";
import { registerQuery, deregisterQuery } from "../store/registry";
import { $wsStatus } from "../socket/socket";

vi.mock("../rpc/fetcher", () => ({
  rpcFetcher: vi.fn(),
}));

vi.mock("../store/registry", () => ({
  registerQuery: vi.fn(),
  deregisterQuery: vi.fn(),
}));

vi.mock("swr", () => ({
  __esModule: true,
  default: vi.fn(),
}));

const mockedRpcFetcher = vi.fn();
const mockedUseSWR = vi.fn();

import { rpcFetcher } from "../rpc/fetcher";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EdgePodProvider url="https://api.edgepod.dev" apiKey="key">
    {children}
  </EdgePodProvider>
);

beforeEach(() => {
  vi.mocked(rpcFetcher).mockImplementation(mockedRpcFetcher);
  (useSWR as any).mockImplementation(mockedUseSWR);
  vi.mocked(registerQuery).mockClear();
  vi.mocked(deregisterQuery).mockClear();
  $wsStatus.set("disconnected");
});

describe("useInternalQuery", () => {
  it("skips fetch when args is null", () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    const { result } = renderHook(() => useInternalQuery("getUsers", null), { wrapper });

    expect(mockedUseSWR).toHaveBeenCalledWith(null, null, expect.any(Object));
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

    renderHook(() => useInternalQuery("getUsers", {}), { wrapper });

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

    const { unmount } = renderHook(() => useInternalQuery("getUsers", {}), { wrapper });

    await waitFor(() => {
      expect(registerQuery).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(deregisterQuery).toHaveBeenCalledWith(["a1b2"], ["edgepod", "getUsers", {}]);
    });
  });

  it("revalidates when websocket connects", async () => {
    const mutateFn = vi.fn();
    const swrData = {
      data: [{ id: 1 }],
      _meta: { t: ["a1b2"] },
    };

    mockedUseSWR.mockReturnValue({
      data: swrData,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: mutateFn,
    });

    renderHook(() => useInternalQuery("getUsers", {}), { wrapper });

    act(() => {
      $wsStatus.set("connected");
    });

    await waitFor(() => {
      expect(mutateFn).toHaveBeenCalledTimes(1);
    });
  });

  it("normalizes undefined args to null in swr key", () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderHook(() => useInternalQuery("getUsers"), { wrapper });

    const matchingCall = mockedUseSWR.mock.calls.find(
      ([key]) =>
        Array.isArray(key) && key[0] === "edgepod" && key[1] === "getUsers" && key[2] === null,
    );

    expect(matchingCall).toBeDefined();
  });

  it("passes correct swr key format", () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderHook(() => useInternalQuery("getUsers", { limit: 10 }), { wrapper });

    const matchingCall = mockedUseSWR.mock.calls.find(
      ([key]) =>
        Array.isArray(key) && key[0] === "edgepod" && key[1] === "getUsers" && key[2]?.limit === 10,
    );

    expect(matchingCall).toBeDefined();
    expect(typeof matchingCall![1]).toBe("function");
  });
});
