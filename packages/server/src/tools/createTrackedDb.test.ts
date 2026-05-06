import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTrackedDb } from "./createTrackedDb";
import type { EdgePodSessionMap, RawDrizzleDb } from "../types";

vi.mock("drizzle-orm", () => ({
  getTableName: vi.fn((t: { name?: string } | null) => t?.name ?? "unknown"),
}));

function createUpdateBuilder() {
  return {
    set: vi.fn(function () {
      return {
        where: vi.fn(function () {
          return { run: vi.fn(() => Promise.resolve({ changes: 1 })) };
        }),
        withoutWhere: vi.fn(function () {
          return { run: vi.fn(() => Promise.resolve({ changes: 1 })) };
        }),
        run: vi.fn(() => Promise.resolve({ changes: 1 })),
      };
    }),
    where: vi.fn(function () {
      return { run: vi.fn(() => Promise.resolve({ changes: 1 })) };
    }),
    withoutWhere: vi.fn(function () {
      return { run: vi.fn(() => Promise.resolve({ changes: 1 })) };
    }),
    run: vi.fn(() => Promise.resolve({ changes: 1 })),
  };
}

function createDeleteBuilder() {
  return {
    where: vi.fn(function () {
      return { run: vi.fn(() => Promise.resolve({ changes: 1 })) };
    }),
    withoutWhere: vi.fn(function () {
      return { run: vi.fn(() => Promise.resolve({ changes: 1 })) };
    }),
    run: vi.fn(() => Promise.resolve({ changes: 1 })),
  };
}

function createMockDb() {
  const db: Record<string, unknown> = {
    select: vi.fn(() => createSelectBuilder()),
    selectDistinct: vi.fn(() => createSelectBuilder()),
    insert: vi.fn((_table: unknown) => ({
      values: vi.fn(function () {
        return Promise.resolve({ inserted: true });
      }),
    })),
    update: vi.fn((_table: unknown) => createUpdateBuilder()),
    delete: vi.fn((_table: unknown) => createDeleteBuilder()),
    query: {
      users: createQueryTableApi("users"),
      posts: createQueryTableApi("posts"),
    },
    run: vi.fn(() => Promise.resolve()),
    all: vi.fn(() => Promise.resolve([])),
    get: vi.fn(() => Promise.resolve(null)),
    values: vi.fn(() => Promise.resolve([])),
    execute: vi.fn(() => Promise.resolve()),
  };

  return db;
}

function createSelectBuilder() {
  const builder: Record<string, unknown> = {
    limit: vi.fn(function () {
      return builder;
    }),
    where: vi.fn(function () {
      return builder;
    }),
    from: vi.fn(function (_table: unknown) {
      return builder;
    }),
    // oxlint-disable-next-line unicorn/no-thenable
    then: vi.fn(function (resolve: (v: unknown) => void) {
      resolve([{ id: 1 }]);
      return Promise.resolve([{ id: 1 }]);
    }),
  };
  return builder;
}

function createQueryTableApi(tableName: string) {
  return {
    findMany: vi.fn(function (opts: Record<string, unknown> = {}) {
      const limit = (opts.limit as number) ?? 1000;
      return Promise.resolve(Array(Math.min(limit, 10)).fill({ id: 1, table: tableName }));
    }),
    findFirst: vi.fn(function () {
      return Promise.resolve({ id: 1, table: tableName });
    }),
  };
}

describe("createTrackedDb", () => {
  let tablesRead: Set<string>;
  let tablesWritten: Set<string>;
  let warnings: string[];
  let activeSessions: EdgePodSessionMap;
  const sessionId = "test-session";

  beforeEach(() => {
    tablesRead = new Set();
    tablesWritten = new Set();
    warnings = [];
    activeSessions = new Map();
    activeSessions.set(sessionId, {
      socket: {} as WebSocket,
      listeningToTables: new Set(),
    });
  });

  function createProxy(cascadeGraph?: Map<string, Set<string>>) {
    const mockDb = createMockDb();
    const proxy = createTrackedDb(
      mockDb as unknown as RawDrizzleDb<any>,
      sessionId,
      activeSessions,
      tablesRead,
      tablesWritten,
      cascadeGraph ?? new Map(),
      warnings,
    );
    return { proxy, mockDb };
  }

  it("blocks raw SQL methods", () => {
    const { proxy } = createProxy();

    expect(() => (proxy as any).run()).toThrow("ctx.db.run");
    expect(() => (proxy as any).all()).toThrow("ctx.db.all");
    expect(() => (proxy as any).get()).toThrow("ctx.db.get");
    expect(() => (proxy as any).values()).toThrow("ctx.db.values");
    expect(() => (proxy as any).execute()).toThrow("ctx.db.execute");
  });

  it("tracks insert as table write", async () => {
    const { proxy } = createProxy();
    const usersTable = { name: "users" };

    await (proxy as any).insert(usersTable).values({ name: "test" });

    expect(tablesWritten.has("users")).toBe(true);
  });

  it("tracks update as table write", async () => {
    const { proxy } = createProxy();
    const usersTable = { name: "users" };

    await (proxy as any).update(usersTable).set({ name: "updated" }).where({ id: 1 }).run();

    expect(tablesWritten.has("users")).toBe(true);
  });

  it("tracks delete as table write", async () => {
    const { proxy } = createProxy();
    const usersTable = { name: "users" };

    await (proxy as any).delete(usersTable).where({ id: 1 }).run();

    expect(tablesWritten.has("users")).toBe(true);
  });

  it("propagates cascades on delete", async () => {
    const cascadeGraph = new Map<string, Set<string>>();
    cascadeGraph.set("users", new Set(["posts", "comments"]));

    const { proxy } = createProxy(cascadeGraph);
    const usersTable = { name: "users" };

    await (proxy as any).delete(usersTable).where({ id: 1 }).run();

    expect(tablesWritten.has("users")).toBe(true);
    expect(tablesWritten.has("posts")).toBe(true);
    expect(tablesWritten.has("comments")).toBe(true);
  });

  it("does not propagate cascades on insert", async () => {
    const cascadeGraph = new Map<string, Set<string>>();
    cascadeGraph.set("users", new Set(["posts"]));

    const { proxy } = createProxy(cascadeGraph);
    const usersTable = { name: "users" };

    await (proxy as any).insert(usersTable).values({ name: "test" });

    expect(tablesWritten.has("users")).toBe(true);
    expect(tablesWritten.has("posts")).toBe(false);
  });

  it("does not propagate cascades on update", async () => {
    const cascadeGraph = new Map<string, Set<string>>();
    cascadeGraph.set("users", new Set(["posts"]));

    const { proxy } = createProxy(cascadeGraph);
    const usersTable = { name: "users" };

    await (proxy as any).update(usersTable).set({ name: "updated" }).where({ id: 1 }).run();

    expect(tablesWritten.has("users")).toBe(true);
    expect(tablesWritten.has("posts")).toBe(false);
  });

  it("tracks select as table read via query.findMany", async () => {
    const { proxy } = createProxy();

    await (proxy as any).query.users.findMany();

    expect(tablesRead.has("users")).toBe(true);
  });

  it("tracks select as table read via query.findFirst", async () => {
    const { proxy } = createProxy();

    await (proxy as any).query.users.findFirst();

    expect(tablesRead.has("users")).toBe(true);
  });

  it("registers listening tables on session via query.findMany", async () => {
    const { proxy } = createProxy();

    await (proxy as any).query.users.findMany();

    const session = activeSessions.get(sessionId);
    expect(session?.listeningToTables.has("users")).toBe(true);
  });

  it("applies limit to query.findMany", async () => {
    const { proxy } = createProxy();

    const result = await (proxy as any).query.users.findMany({ limit: 5 });

    expect(Array.isArray(result)).toBe(true);
  });

  it("caps query.findMany limit at max", async () => {
    const { proxy, mockDb } = createProxy();

    await (proxy as any).query.users.findMany({ limit: 5000 });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("5000");
    expect(warnings[0]).toContain("1000");
    expect(mockDb.query.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1000 }),
    );
  });

  it("blocks bulk insert exceeding max limit", () => {
    const { proxy } = createProxy();
    const usersTable = { name: "users" };
    const rows = Array(1001).fill({ name: "test" });

    expect(() => (proxy as any).insert(usersTable).values(rows)).toThrow("Bulk insert blocked");
  });

  it("allows bulk insert at or under max limit", () => {
    const { proxy } = createProxy();
    const usersTable = { name: "users" };
    const rows = Array(1000).fill({ name: "test" });

    expect(() => (proxy as any).insert(usersTable).values(rows)).not.toThrow();
  });

  it("delegates selectDistinct to select proxy", () => {
    const { proxy } = createProxy();

    const builder = (proxy as any).selectDistinct();
    expect(typeof builder.then).toBe("function");
  });

  it("binds non-tracked methods to target", () => {
    const { proxy } = createProxy();

    const existingMethod = (proxy as any).select;
    expect(typeof existingMethod).toBe("function");
  });
});
