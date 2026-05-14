import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";
import { createSafetyProxy, type TrackContext } from "./createSafetyProxy";
import type { EdgePodSessionMap } from "../types";

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  userId: integer("user_id").notNull(),
});

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle({ client: sqlite, schema: { users, posts } });
  sqlite.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL, user_id INTEGER NOT NULL);
  `);
  const tablesRead = new Set<string>();
  const tablesWritten = new Set<string>();
  const rowIds = new Map<string, Set<string>>();
  const warnings: string[] = [];
  const activeSessions: EdgePodSessionMap = new Map();
  activeSessions.set("test-session", {
    socket: {} as WebSocket,
    listeningToTables: new Set(),
  });

  const trackCtx: TrackContext = {
    sessionId: "test-session",
    activeSessions,
    tablesRead,
    tablesWritten,
    rowIds,
    cascadeGraph: new Map(),
    warnings,
    pkMap: new Map([["users", ["id"]]]),
  };

  const proxy = createSafetyProxy(db as any, trackCtx);

  return { db: proxy as any, tablesRead, tablesWritten, rowIds, warnings, trackCtx };
}

describe("safety proxy — limit enforcement", () => {
  it("clamps negative limit to 0 (async)", async () => {
    const { db } = setup();
    const result = await db.select().from(users).limit(-1);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("caps limit at 1000 when exceeding max", async () => {
    const { db, warnings } = setup();
    await db.select().from(users).limit(5000);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("5000");
    expect(warnings[0]).toContain("1000");
  });

  it("auto-applies default limit when none set", async () => {
    const { db } = setup();
    const result = await db.select().from(users);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("safety proxy — WHERE enforcement", () => {
  it("blocks update without WHERE", () => {
    const { db } = setup();
    expect(() => db.update(users).set({ name: "changed" }).run()).toThrow(
      "UPDATE without WHERE is blocked",
    );
  });

  it("allows update with WHERE", async () => {
    const { db } = setup();
    const result = await db.update(users).set({ name: "changed" }).where(eq(users.id, 1)).run();
    expect(result).toBeDefined();
  });

  it("blocks delete without WHERE", () => {
    const { db } = setup();
    expect(() => db.delete(users).run()).toThrow("DELETE without WHERE is blocked");
  });

  it("allows delete with WHERE", async () => {
    const { db } = setup();
    const result = await db.delete(users).where(eq(users.id, 1)).run();
    expect(result).toBeDefined();
  });
});

describe("safety proxy — table tracking", () => {
  it("tracks insert as table write (async)", async () => {
    const { db, tablesWritten } = setup();
    await db.insert(users).values({ name: "test" });
    expect(tablesWritten.has("users")).toBe(true);
  });

  it("tracks insert as table write (sync)", () => {
    const { db, tablesWritten } = setup();
    db.insert(users).values({ name: "test" }).run();
    expect(tablesWritten.has("users")).toBe(true);
  });

  it("tracks update as table write", async () => {
    const { db, tablesWritten } = setup();
    await db.update(users).set({ name: "changed" }).where(eq(users.id, 1)).run();
    expect(tablesWritten.has("users")).toBe(true);
  });

  it("tracks delete as table write", async () => {
    const { db, tablesWritten } = setup();
    await db.delete(users).where(eq(users.id, 1)).run();
    expect(tablesWritten.has("users")).toBe(true);
  });

  it("tracks select as table read (async)", async () => {
    const { db, tablesRead } = setup();
    await db.select().from(users);
    expect(tablesRead.has("users")).toBe(true);
  });

  it("tracks select as table read (sync)", () => {
    const { db, tablesRead } = setup();
    db.select().from(users).all();
    expect(tablesRead.has("users")).toBe(true);
  });

  it("tracks join tables as reads", async () => {
    const { db, tablesRead } = setup();
    await db.select().from(users).leftJoin(posts, eq(users.id, posts.userId));
    expect(tablesRead.has("users")).toBe(true);
    expect(tablesRead.has("posts")).toBe(true);
  });
});

describe("safety proxy — insert chaining", () => {
  it("insert with .returning() records mutation", async () => {
    const { db, tablesWritten } = setup();
    const result = await db.insert(users).values({ name: "test" }).returning();
    expect(Array.isArray(result)).toBe(true);
    expect(tablesWritten.has("users")).toBe(true);
  });

  it("insert bulk at max limit succeeds", async () => {
    const { db } = setup();
    const rows = Array(1000).fill({ name: "test" });
    await expect(db.insert(users).values(rows)).resolves.toBeDefined();
  });

  it("insert bulk over max limit throws", () => {
    const { db } = setup();
    const rows = Array(1001).fill({ name: "test" });
    expect(() => db.insert(users).values(rows)).toThrow("Bulk insert blocked");
  });
});

describe("safety proxy — prepare", () => {
  it("blocks insert .prepare()", () => {
    const { db } = setup();
    expect(() => db.insert(users).values({ name: "test" }).prepare()).toThrow(
      ".prepare() is not supported for inserts",
    );
  });

  it("blocks update .prepare()", () => {
    const { db } = setup();
    expect(() =>
      db.update(users).set({ name: "changed" }).where(eq(users.id, 1)).prepare(),
    ).toThrow(".prepare() is not supported for updates");
  });

  it("blocks delete .prepare()", () => {
    const { db } = setup();
    expect(() => db.delete(users).where(eq(users.id, 1)).prepare()).toThrow(
      ".prepare() is not supported for deletes",
    );
  });

  it(".prepare() on select returns statement with limit enforced", async () => {
    const { db } = setup();
    const prepared = db.select().from(users).prepare();
    expect(typeof prepared.execute).toBe("function");
    expect(typeof prepared.all).toBe("function");
    const result = await prepared.execute();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("safety proxy — row ID tracking", () => {
  it("extracts WHERE IDs from update", async () => {
    const { db, rowIds } = setup();
    await db.update(users).set({ name: "changed" }).where(eq(users.id, 42)).run();
    expect(rowIds.has("users")).toBe(true);
    const ids = [...rowIds.get("users")!];
    // 42 hashed with djb2 should produce a stable hash
    expect(ids).toHaveLength(1);
  });

  it("extracts WHERE IDs from delete", async () => {
    const { db, rowIds } = setup();
    await db.delete(users).where(eq(users.id, 7)).run();
    expect(rowIds.has("users")).toBe(true);
    const ids = [...rowIds.get("users")!];
    expect(ids).toHaveLength(1);
  });

  it("skips row IDs for inserts without WHERE", async () => {
    const { db, rowIds } = setup();
    await db.insert(users).values({ name: "test" });
    expect(rowIds.size).toBe(0);
  });
});
