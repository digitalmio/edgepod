import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCascadeGraph } from "./buildCascadeGraph";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { getTableName } from "drizzle-orm";

vi.mock("drizzle-orm/sqlite-core", () => ({
  getTableConfig: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  getTableName: vi.fn(),
}));

const mockTableName = "mock_table";
const mockTableSymbol = Symbol.for("drizzle:Name");

function createMockTable(name: string) {
  return { [mockTableSymbol]: name };
}

describe("buildCascadeGraph", () => {
  beforeEach(() => {
    vi.mocked(getTableName).mockImplementation((t: any) => t[mockTableSymbol] ?? t);
  });

  it("returns empty graph for empty schema", () => {
    const graph = buildCascadeGraph({});
    expect(graph.size).toBe(0);
  });

  it("detects cascade relationship from foreign keys", () => {
    const usersTable = createMockTable("users");
    const postsTable = createMockTable("posts");

    vi.mocked(getTableConfig)
      .mockReturnValueOnce({
        name: "users",
        foreignKeys: [],
      } as any)
      .mockReturnValueOnce({
        name: "posts",
        foreignKeys: [
          {
            onDelete: "cascade",
            reference: () => ({ foreignTable: usersTable }),
          },
        ],
      } as any);

    const graph = buildCascadeGraph({ users: usersTable, posts: postsTable });

    expect(graph.get("users")).toEqual(new Set(["posts"]));
  });

  it("ignores non-cascade foreign keys", () => {
    const usersTable = createMockTable("users");
    const postsTable = createMockTable("posts");

    vi.mocked(getTableConfig)
      .mockReturnValueOnce({
        name: "users",
        foreignKeys: [],
      } as any)
      .mockReturnValueOnce({
        name: "posts",
        foreignKeys: [
          {
            onDelete: "restrict",
            reference: () => ({ foreignTable: usersTable }),
          },
        ],
      } as any);

    const graph = buildCascadeGraph({ users: usersTable, posts: postsTable });

    expect(graph.size).toBe(0);
  });

  it("handles multi-level cascade chains", () => {
    const usersTable = createMockTable("users");
    const postsTable = createMockTable("posts");
    const commentsTable = createMockTable("comments");

    vi.mocked(getTableConfig)
      .mockReturnValueOnce({
        name: "users",
        foreignKeys: [],
      } as any)
      .mockReturnValueOnce({
        name: "posts",
        foreignKeys: [
          {
            onDelete: "cascade",
            reference: () => ({ foreignTable: usersTable }),
          },
        ],
      } as any)
      .mockReturnValueOnce({
        name: "comments",
        foreignKeys: [
          {
            onDelete: "cascade",
            reference: () => ({ foreignTable: postsTable }),
          },
        ],
      } as any);

    const graph = buildCascadeGraph({
      users: usersTable,
      posts: postsTable,
      comments: commentsTable,
    });

    expect(graph.get("users")).toEqual(new Set(["posts"]));
    expect(graph.get("posts")).toEqual(new Set(["comments"]));
  });

  it("skips non-table objects in schema", () => {
    const graph = buildCascadeGraph({
      notATable: null,
      alsoNotATable: { foo: "bar" },
      validKey: undefined,
    });

    expect(graph.size).toBe(0);
  });
});
