import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerQuery, deregisterQuery, invalidateTables, resetRegistry } from "./registry";

vi.mock("swr", () => ({
  mutate: vi.fn(),
}));

import { mutate } from "swr";

describe("store registry", () => {
  beforeEach(() => {
    resetRegistry();
    vi.mocked(mutate).mockClear();
  });

  it("registers an SWR key for multiple tables", () => {
    const key = ["edgepod", "getUsers", {}];
    registerQuery(["a1b2", "c3d4"], key);

    invalidateTables(["a1b2"]);

    expect(mutate).toHaveBeenCalledWith(key);
  });

  it("deregisters a key without affecting others", () => {
    const key1 = ["edgepod", "getUsers", {}];
    const key2 = ["edgepod", "getPosts", {}];

    registerQuery(["a1b2"], key1);
    registerQuery(["a1b2"], key2);

    deregisterQuery(["a1b2"], key1);

    vi.mocked(mutate).mockClear();
    invalidateTables(["a1b2"]);

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(key2);
  });

  it("invalidates multiple keys for the same table", () => {
    const key1 = ["edgepod", "getUsers", {}];
    const key2 = ["edgepod", "getUserById", { id: 1 }];

    registerQuery(["a1b2"], key1);
    registerQuery(["a1b2"], key2);

    invalidateTables(["a1b2"]);

    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenCalledWith(key1);
    expect(mutate).toHaveBeenCalledWith(key2);
  });

  it("does not call mutate for unrelated tables", () => {
    const key = ["edgepod", "getUsers", {}];
    registerQuery(["a1b2"], key);

    vi.mocked(mutate).mockClear();
    invalidateTables(["z9z9"]);

    expect(mutate).not.toHaveBeenCalled();
  });

  it("cleans up empty table entries on deregister", () => {
    const key = ["edgepod", "getUsers", {}];
    registerQuery(["a1b2"], key);
    deregisterQuery(["a1b2"], key);

    vi.mocked(mutate).mockClear();
    invalidateTables(["a1b2"]);

    expect(mutate).not.toHaveBeenCalled();
  });

  it("handles multiple tables in a single invalidation", () => {
    const key1 = ["edgepod", "getUsers", {}];
    const key2 = ["edgepod", "getPosts", {}];

    registerQuery(["a1b2"], key1);
    registerQuery(["c3d4"], key2);

    invalidateTables(["a1b2", "c3d4"]);

    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenCalledWith(key1);
    expect(mutate).toHaveBeenCalledWith(key2);
  });

  it("deduplicates mutate calls when a key is registered for multiple invalidated tables", () => {
    const key = ["edgepod", "getUserWithPosts", {}];

    registerQuery(["a1b2", "c3d4"], key);

    invalidateTables(["a1b2", "c3d4"]);

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(key);
  });
});
