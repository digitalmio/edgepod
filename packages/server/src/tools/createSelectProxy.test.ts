import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSelectProxy } from "./createSelectProxy";
import type { EdgePodSessionMap } from "../types";

vi.mock("drizzle-orm", () => ({
  getTableName: vi.fn((t: { name?: string } | null) => t?.name ?? "unknown"),
}));

function createMockBuilder(
  options: { resultData?: Record<string, unknown>[]; limit?: number } = {},
) {
  const { resultData = [], limit: initialLimit } = options;
  let currentLimit = initialLimit;

  const builder: Record<string, unknown> = {
    limit: vi.fn(function (n: number) {
      currentLimit = n;
      const opts: { resultData: Record<string, unknown>[]; limit: number } = {
        resultData,
        limit: n,
      };
      return createMockBuilder(opts);
    }),
    where: vi.fn(function () {
      return builder;
    }),
    from: vi.fn(function () {
      return builder;
    }),
    leftJoin: vi.fn(function (_table: unknown) {
      const opts: { resultData: Record<string, unknown>[]; limit?: number } = { resultData };
      if (currentLimit !== undefined) opts.limit = currentLimit;
      return createMockBuilder(opts);
    }),
    innerJoin: vi.fn(function (_table: unknown) {
      const opts: { resultData: Record<string, unknown>[]; limit?: number } = { resultData };
      if (currentLimit !== undefined) opts.limit = currentLimit;
      return createMockBuilder(opts);
    }),
    rightJoin: vi.fn(function () {
      return builder;
    }),
    fullJoin: vi.fn(function () {
      return builder;
    }),
    // oxlint-disable-next-line unicorn/no-thenable
    then: vi.fn(function (resolve: (v: unknown) => void, reject: (e: unknown) => void) {
      const finalLimit = currentLimit ?? 1000;
      return Promise.resolve(resultData.slice(0, finalLimit)).then(resolve, reject);
    }),
  };

  return builder;
}

function createMockJoinTable() {
  return { name: "joined_table" };
}

describe("createSelectProxy", () => {
  let tablesRead: Set<string>;
  let warnings: string[];
  let activeSessions: EdgePodSessionMap;
  const sessionId = "test-session";

  beforeEach(() => {
    tablesRead = new Set();
    warnings = [];
    activeSessions = new Map();
    activeSessions.set(sessionId, {
      socket: {} as WebSocket,
      listeningToTables: new Set(),
    });
  });

  it("auto-applies max limit when none set", async () => {
    const builder = createMockBuilder({ resultData: Array(2000).fill({ id: 1 }) });
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    const result = await proxy;

    expect(result).toHaveLength(1000);
  });

  it("respects user-set limit under max", async () => {
    const builder = createMockBuilder({ resultData: Array(100).fill({ id: 1 }) });
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    const withLimit = proxy.limit(50);
    const result = await withLimit;

    expect(result).toHaveLength(50);
  });

  it("caps limit at max", async () => {
    const builder = createMockBuilder({ resultData: Array(5000).fill({ id: 1 }) });
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    const withLimit = proxy.limit(5000);
    const result = await withLimit;

    expect(result).toHaveLength(1000);
  });

  it("adds warning when user limit exceeds max", async () => {
    const builder = createMockBuilder({ resultData: [] });
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    await proxy.limit(5000);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("5000");
    expect(warnings[0]).toContain("1000");
  });

  it("tracks table reads on join methods", () => {
    const builder = createMockBuilder();
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    const joinTable = createMockJoinTable();
    proxy.leftJoin(joinTable, {});

    expect(tablesRead.has("joined_table")).toBe(true);
  });

  it("tracks table reads on innerJoin", () => {
    const builder = createMockBuilder();
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    const joinTable = createMockJoinTable();
    proxy.innerJoin(joinTable, {});

    expect(tablesRead.has("joined_table")).toBe(true);
  });

  it("adds warning when result hits max limit", async () => {
    const builder = createMockBuilder({ resultData: Array(1000).fill({ id: 1 }) });
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    await proxy;

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("1000 rows");
    expect(warnings[0]).toContain("paginate");
  });

  it("does not add warning when result is under limit", async () => {
    const builder = createMockBuilder({ resultData: Array(100).fill({ id: 1 }) });
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    await proxy;

    expect(warnings).toHaveLength(0);
  });

  it("tracks table reads on rightJoin", () => {
    const builder = createMockBuilder();
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    const joinTable = createMockJoinTable();
    proxy.rightJoin(joinTable, {});

    expect(tablesRead.has("joined_table")).toBe(true);
  });

  it("tracks table reads on fullJoin", () => {
    const builder = createMockBuilder();
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    const joinTable = createMockJoinTable();
    proxy.fullJoin(joinTable, {});

    expect(tablesRead.has("joined_table")).toBe(true);
  });

  it("tracks table reads on from", () => {
    const builder = createMockBuilder();
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    const joinTable = createMockJoinTable();
    proxy.from(joinTable, {});

    expect(tablesRead.has("joined_table")).toBe(true);
  });

  it("registers listening tables on session for joins", () => {
    const builder = createMockBuilder();
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    const joinTable = createMockJoinTable();
    proxy.leftJoin(joinTable, {});

    const session = activeSessions.get(sessionId);
    expect(session?.listeningToTables.has("joined_table")).toBe(true);
  });

  it("preserves proxy through chained method calls", () => {
    const builder = createMockBuilder();
    const proxy = createSelectProxy(builder, sessionId, activeSessions, tablesRead, warnings, 1000);

    const withWhere = proxy.where({ id: 1 });
    expect(withWhere).toBeDefined();
    expect(typeof withWhere.then).toBe("function");
  });
});
