import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import useSWRMutation from "swr/mutation";
import useSWR from "swr";
import { createEdgePodClient } from "./client";

vi.mock("./provider/context", () => ({
  useEdgePod: () => ({
    url: "https://api.edgepod.dev",
    apiKey: "key",
    sessionId: "sid",
  }),
}));

vi.mock("./rpc/fetcher", () => ({
  rpcFetcher: vi.fn(),
}));

vi.mock("swr", () => ({
  __esModule: true,
  default: vi.fn(),
}));

vi.mock("swr/mutation", () => ({
  __esModule: true,
  default: vi.fn(),
}));

const mockedUseSWR = vi.fn();
const mockedUseSWRMutation = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (useSWR as any).mockImplementation(mockedUseSWR);
  (useSWRMutation as any).mockImplementation(mockedUseSWRMutation);
});

describe("createEdgePodClient", () => {
  // Mock function signatures that simulate a real backend router
  const mockFunctions = {
    getUsers: async (_ctx: any) => [{ id: 1, name: "Alice" }],
    getUserById: async (_ctx: any, _args: { id: number }) => ({
      id: 1,
      name: "Alice",
    }),
    createUser: async (_ctx: any, _args: { email: string; name: string }) => ({
      id: 1,
      email: "alice@example.com",
      name: "Alice",
    }),
    ping: async (_ctx: any) => "pong",
  };

  it("returns useQuery and useMutation hooks", () => {
    const { useQuery, useMutation } = createEdgePodClient<typeof mockFunctions>();

    expect(typeof useQuery).toBe("function");
    expect(typeof useMutation).toBe("function");
  });

  it("useQuery calls underlying SWR with correct key for no-args query", () => {
    mockedUseSWR.mockReturnValue({
      data: { data: [{ id: 1, name: "Alice" }], _meta: { t: [] } },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    const { useQuery } = createEdgePodClient<typeof mockFunctions>();

    renderHook(() => useQuery("getUsers"));

    expect(mockedUseSWR).toHaveBeenCalledTimes(1);
    const [key] = mockedUseSWR.mock.calls[0];
    expect(key).toEqual(["edgepod", "getUsers", undefined]);
  });

  it("useQuery calls underlying SWR with correct key and args for query with args", () => {
    mockedUseSWR.mockReturnValue({
      data: { data: { id: 42, name: "Bob" }, _meta: { t: [] } },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    const { useQuery } = createEdgePodClient<typeof mockFunctions>();

    renderHook(() => useQuery("getUserById", { id: 42 }));

    expect(mockedUseSWR).toHaveBeenCalledTimes(1);
    const [key] = mockedUseSWR.mock.calls[0];
    expect(key).toEqual(["edgepod", "getUserById", { id: 42 }]);
  });

  it("useQuery supports null args for conditional fetching", () => {
    mockedUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    const { useQuery } = createEdgePodClient<typeof mockFunctions>();

    renderHook(() => useQuery("getUserById", null));

    expect(mockedUseSWR).toHaveBeenCalledTimes(1);
    const [key] = mockedUseSWR.mock.calls[0];
    expect(key).toBeNull();
  });

  it("useMutation calls underlying SWR mutation with correct function name", () => {
    const triggerFn = vi.fn();
    mockedUseSWRMutation.mockReturnValue({
      trigger: triggerFn,
      data: { id: 1, email: "alice@example.com", name: "Alice" },
      error: undefined,
      isMutating: false,
    });

    const { useMutation } = createEdgePodClient<typeof mockFunctions>();

    renderHook(() => useMutation("createUser"));

    expect(mockedUseSWRMutation).toHaveBeenCalledTimes(1);
    const [key] = mockedUseSWRMutation.mock.calls[0];
    expect(key).toBe("createUser");
  });

  it("useMutation trigger accepts typed args", async () => {
    const triggerFn = vi.fn(async (args: { email: string; name: string }) => ({
      id: 1,
      ...args,
    }));

    mockedUseSWRMutation.mockReturnValue({
      trigger: triggerFn,
      data: undefined,
      error: undefined,
      isMutating: false,
    });

    const { useMutation } = createEdgePodClient<typeof mockFunctions>();

    const { result } = renderHook(() => useMutation("createUser"));

    await result.current.trigger({ email: "test@example.com", name: "Test" });

    expect(triggerFn).toHaveBeenCalledWith({
      email: "test@example.com",
      name: "Test",
    });
  });

  it("functionName is constrained to keys of the router", () => {
    const { useQuery } = createEdgePodClient<typeof mockFunctions>();

    // These should compile (verified by TypeScript, not runtime)
    expect(typeof useQuery).toBe("function");

    // Type-level: "getUsers" and "getUserById" are valid, "unknown" is not.
    // We verify this indirectly by checking the factory works with known keys.
    expect(() => {
      renderHook(() => useQuery("getUsers"));
    }).not.toThrow();
  });
});
