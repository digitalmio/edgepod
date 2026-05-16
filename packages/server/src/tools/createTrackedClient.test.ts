import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createMockDOStorage } from "../test-utils/mockDOStorage";
import { createTrackedClient, recordCascades } from "./createTrackedClient";

describe("recordCascades", () => {
  it("records a table and its cascade children", () => {
    const tablesWritten = new Set<string>();
    const cascadeGraph = new Map<string, Set<string>>();
    cascadeGraph.set("users", new Set(["posts", "comments"]));
    cascadeGraph.set("posts", new Set(["likes"]));

    recordCascades("users", tablesWritten, cascadeGraph);

    expect(tablesWritten.has("users")).toBe(true);
    expect(tablesWritten.has("posts")).toBe(true);
    expect(tablesWritten.has("comments")).toBe(true);
    expect(tablesWritten.has("likes")).toBe(true);
  });

  it("does not duplicate already-recorded tables", () => {
    const tablesWritten = new Set<string>();
    tablesWritten.add("posts");
    const cascadeGraph = new Map<string, Set<string>>();
    cascadeGraph.set("users", new Set(["posts"]));

    recordCascades("users", tablesWritten, cascadeGraph);

    expect(tablesWritten.has("users")).toBe(true);
    expect(tablesWritten.has("posts")).toBe(true);
    expect(tablesWritten.size).toBe(2);
  });

  it("handles empty cascade graph", () => {
    const tablesWritten = new Set<string>();
    recordCascades("users", tablesWritten, new Map());
    expect(tablesWritten.has("users")).toBe(true);
  });
});

describe("createTrackedClient", () => {
  function setup() {
    const sqlite = new Database(":memory:");
    const storage = createMockDOStorage(sqlite);
    const tablesRead = new Set<string>();
    const tablesWritten = new Set<string>();
    const cascadeGraph = new Map<string, Set<string>>();

    const tracked = createTrackedClient(
      storage as unknown as DurableObjectStorage,
      tablesRead,
      tablesWritten,
      cascadeGraph,
    );

    return { tracked, sqlite, tablesRead, tablesWritten, cascadeGraph };
  }

  it("tracks SELECT as table read", () => {
    const { tracked, sqlite, tablesRead } = setup();
    sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");

    tracked.sql.exec('SELECT * FROM "users"');

    expect(tablesRead.has("users")).toBe(true);
  });

  it("tracks INSERT as table write", () => {
    const { tracked, sqlite, tablesWritten } = setup();
    sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");

    tracked.sql.exec('INSERT INTO "users" ("id") VALUES (?)', [1]);

    expect(tablesWritten.has("users")).toBe(true);
  });

  it("tracks UPDATE as table write", () => {
    const { tracked, sqlite, tablesWritten } = setup();
    sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");

    tracked.sql.exec('UPDATE "users" SET "id" = ?', [2]);

    expect(tablesWritten.has("users")).toBe(true);
  });

  it("tracks DELETE as table write", () => {
    const { tracked, sqlite, tablesWritten } = setup();
    sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");

    tracked.sql.exec('DELETE FROM "users" WHERE "id" = ?', [1]);

    expect(tablesWritten.has("users")).toBe(true);
  });

  it("propagates cascades on write", () => {
    const { tracked, sqlite, tablesWritten, cascadeGraph } = setup();
    sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
    sqlite.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY)");
    cascadeGraph.set("users", new Set(["posts"]));

    tracked.sql.exec('DELETE FROM "users" WHERE "id" = ?', [1]);

    expect(tablesWritten.has("users")).toBe(true);
    expect(tablesWritten.has("posts")).toBe(true);
  });

  it("tracks JOIN tables as reads", () => {
    const { tracked, sqlite, tablesRead } = setup();
    sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");
    sqlite.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER)");

    tracked.sql.exec('SELECT * FROM "users" LEFT JOIN "posts" ON "posts"."user_id" = "users"."id"');

    expect(tablesRead.has("users")).toBe(true);
    expect(tablesRead.has("posts")).toBe(true);
  });

  it("tracks tables inside a transaction", () => {
    const { tracked, sqlite, tablesRead } = setup();
    sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY)");

    tracked.transactionSync(() => {
      tracked.sql.exec('SELECT * FROM "users"');
    });

    expect(tablesRead.has("users")).toBe(true);
  });
});
