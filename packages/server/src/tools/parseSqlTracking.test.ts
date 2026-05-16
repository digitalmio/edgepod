import { describe, it, expect } from "vitest";
import { parseSqlTracking } from "./parseSqlTracking";

describe("parseSqlTracking — query type", () => {
  it("detects SELECT", () => {
    const r = parseSqlTracking('select "id" from "users"', []);
    expect(r.queryType).toBe("select");
  });

  it("detects INSERT", () => {
    const r = parseSqlTracking('insert into "users" ("name") values (?)', ["test"]);
    expect(r.queryType).toBe("insert");
  });

  it("detects UPDATE", () => {
    const r = parseSqlTracking('update "users" set "name" = ? where "id" = ?', ["new", 1]);
    expect(r.queryType).toBe("update");
  });

  it("detects DELETE", () => {
    const r = parseSqlTracking('delete from "users" where "id" = ?', [1]);
    expect(r.queryType).toBe("delete");
  });

  it("returns 'unknown' for garbage SQL", () => {
    const r = parseSqlTracking("not sql at all", []);
    expect(r.queryType).toBe("unknown");
    expect(r.tablesRead).toEqual([]);
    expect(r.tablesWritten).toEqual([]);
    expect(r.whereIds).toEqual([]);
  });
});

describe("parseSqlTracking — table extraction", () => {
  it("extracts table from SELECT", () => {
    const r = parseSqlTracking('select * from "users"', []);
    expect(r.tablesRead).toEqual(["users"]);
  });

  it("extracts multiple tables from JOIN", () => {
    const r = parseSqlTracking(
      'select * from "users" left join "posts" on "posts"."user_id" = "users"."id"',
      [],
    );
    expect(r.tablesRead).toEqual(["users", "posts"]);
  });

  it("extracts tables from comma-joined FROM", () => {
    const r = parseSqlTracking('select * from "users", "posts"', []);
    expect(r.tablesRead).toEqual(["users", "posts"]);
  });

  it("extracts table from INSERT", () => {
    const r = parseSqlTracking('insert into "users" ("name") values (?)', ["test"]);
    expect(r.tablesWritten).toEqual(["users"]);
  });

  it("extracts table from UPDATE", () => {
    const r = parseSqlTracking('update "users" set "name" = ?', ["test"]);
    expect(r.tablesWritten).toEqual(["users"]);
  });

  it("extracts table from DELETE", () => {
    const r = parseSqlTracking('delete from "users"', []);
    expect(r.tablesWritten).toEqual(["users"]);
  });

  it("detects subquery tables in WHERE IN (SELECT)", () => {
    const r = parseSqlTracking(
      'select * from "users" where "id" in (select "user_id" from "banned")',
      [],
    );
    expect(r.tablesRead).toEqual(["users", "banned"]);
  });

  it("detects subquery tables in WHERE EXISTS", () => {
    const r = parseSqlTracking(
      'select * from "users" where exists (select 1 from "orders" where "orders"."user_id" = "users"."id")',
      [],
    );
    expect(r.tablesRead).toContain("users");
    expect(r.tablesRead).toContain("orders");
    expect(r.tablesRead).toHaveLength(2);
  });

  it("detects subquery tables in INSERT...SELECT", () => {
    const r = parseSqlTracking('insert into "logs" select * from "old_logs"', []);
    expect(r.tablesWritten).toEqual(["logs"]);
    expect(r.tablesRead).toEqual(["old_logs"]);
  });

  it("detects subquery tables in UPDATE with scalar subquery", () => {
    const r = parseSqlTracking(
      'update "users" set "name" = (select "name" from "profiles" where "profiles"."id" = "users"."id")',
      [],
    );
    expect(r.tablesWritten).toEqual(["users"]);
    expect(r.tablesRead).toEqual(["profiles"]);
  });

  it("detects subquery tables in DELETE with IN subquery", () => {
    const r = parseSqlTracking(
      'delete from "users" where "id" in (select "id" from "banned_users")',
      [],
    );
    expect(r.tablesWritten).toEqual(["users"]);
    expect(r.tablesRead).toEqual(["banned_users"]);
  });

  it("detects multiple subquery tables with JOIN in outer query", () => {
    const r = parseSqlTracking(
      'select * from "users" join "posts" on "users"."id" = "posts"."user_id" where "posts"."id" in (select "post_id" from "comments")',
      [],
    );
    expect(r.tablesRead).toContain("users");
    expect(r.tablesRead).toContain("posts");
    expect(r.tablesRead).toContain("comments");
    expect(r.tablesRead).toHaveLength(3);
  });

  it("does not track subquery tables as reads for write ops when same as main table", () => {
    const r = parseSqlTracking('insert into "logs" select * from "logs"', []);
    expect(r.tablesWritten).toEqual(["logs"]);
    expect(r.tablesRead).toEqual([]);
  });
});

describe("parseSqlTracking — CTEs, compounds, subqueries", () => {
  it("excludes CTE aliases from tablesRead", () => {
    const r = parseSqlTracking("WITH cte AS (SELECT * FROM users) SELECT * FROM cte", []);
    expect(r.tablesRead).toEqual(["users"]);
  });

  it("excludes CTE aliases from JOIN in main query", () => {
    const r = parseSqlTracking(
      "WITH a AS (SELECT * FROM users) SELECT * FROM a JOIN b ON a.id = b.id",
      [],
    );
    expect(r.tablesRead).toEqual(["users", "b"]);
  });

  it("collects tables from scalar subquery in SELECT list (no outer FROM)", () => {
    const r = parseSqlTracking("SELECT (SELECT name FROM profiles LIMIT 1) AS n", []);
    expect(r.tablesRead).toEqual(["profiles"]);
  });

  it("collects tables from scalar subquery in SELECT list (with outer FROM)", () => {
    const r = parseSqlTracking("SELECT (SELECT count FROM stats) AS c FROM users", []);
    expect(r.tablesRead).toEqual(["users", "stats"]);
  });

  it("collects all table references from UNION", () => {
    const r = parseSqlTracking("SELECT * FROM users UNION SELECT * FROM admins", []);
    expect(r.tablesRead).toContain("users");
    expect(r.tablesRead).toContain("admins");
    expect(r.tablesRead).toHaveLength(2);
  });

  it("collects tables from subquery in HAVING", () => {
    const r = parseSqlTracking(
      "SELECT user_id, count(*) FROM orders GROUP BY user_id HAVING count(*) > (SELECT avg(count) FROM stats)",
      [],
    );
    expect(r.tablesRead).toContain("orders");
    expect(r.tablesRead).toContain("stats");
  });

  it("collects tables from subquery in ORDER BY", () => {
    const r = parseSqlTracking(
      "SELECT * FROM users ORDER BY (SELECT score FROM leaderboard LIMIT 1)",
      [],
    );
    expect(r.tablesRead).toContain("users");
    expect(r.tablesRead).toContain("leaderboard");
  });

  it("collects tables from derived table in JOIN", () => {
    const r = parseSqlTracking(
      "SELECT * FROM users JOIN (SELECT * FROM posts) AS p ON users.id = p.user_id",
      [],
    );
    expect(r.tablesRead).toContain("users");
    expect(r.tablesRead).toContain("posts");
  });

  it("collects tables from deeply nested subqueries", () => {
    const r = parseSqlTracking(
      "SELECT * FROM users WHERE id IN (SELECT id FROM (SELECT * FROM banned))",
      [],
    );
    expect(r.tablesRead).toEqual(["users", "banned"]);
  });

  it("collects subquery tables for INSERT...SELECT with compound", () => {
    const r = parseSqlTracking(
      "INSERT INTO logs SELECT * FROM old_logs UNION SELECT * FROM archived_logs",
      [],
    );
    expect(r.tablesWritten).toEqual(["logs"]);
    expect(r.tablesRead).toContain("old_logs");
    expect(r.tablesRead).toContain("archived_logs");
  });

  it("collects CTE tables for write ops with subquery", () => {
    const r = parseSqlTracking(
      "WITH cte AS (SELECT * FROM source) INSERT INTO target SELECT * FROM cte",
      [],
    );
    expect(r.tablesWritten).toEqual(["target"]);
    expect(r.tablesRead).toEqual(["source"]);
  });
});

describe("parseSqlTracking — WHERE ID extraction", () => {
  it("extracts simple WHERE id = ?", () => {
    const r = parseSqlTracking('select * from "users" where "users"."id" = ?', [42]);
    expect(r.whereIds).toHaveLength(1);
    expect(r.whereIds[0].tableHint).toBe("users");
    expect(r.whereIds[0].column).toBe("id");
    expect(r.whereIds[0].paramIndices).toEqual([0]);
  });

  it("extracts WHERE id = ? from UPDATE", () => {
    const r = parseSqlTracking('update "users" set "name" = ? where "users"."id" = ?', ["new", 1]);
    expect(r.whereIds).toHaveLength(1);
    expect(r.whereIds[0].tableHint).toBe("users");
    expect(r.whereIds[0].column).toBe("id");
    expect(r.whereIds[0].paramIndices).toEqual([1]);
  });

  it("extracts WHERE id IN (?, ?)", () => {
    const r = parseSqlTracking('select * from "users" where "users"."id" in (?, ?)', [1, 2]);
    expect(r.whereIds).toHaveLength(1);
    expect(r.whereIds[0].tableHint).toBe("users");
    expect(r.whereIds[0].column).toBe("id");
    expect(r.whereIds[0].paramIndices).toEqual([0, 1]);
  });

  it("handles unqualified column in WHERE", () => {
    const r = parseSqlTracking('select * from "users" where "id" = ?', [42]);
    expect(r.whereIds).toHaveLength(1);
    expect(r.whereIds[0].tableHint).toBe("");
    expect(r.whereIds[0].column).toBe("id");
  });

  it("returns empty whereIds for queries without WHERE", () => {
    const r = parseSqlTracking('select * from "users"', []);
    expect(r.whereIds).toEqual([]);
  });

  it("returns empty whereIds for INSERT", () => {
    const r = parseSqlTracking('insert into "users" ("name") values (?)', ["test"]);
    expect(r.whereIds).toEqual([]);
  });
});

describe("parseSqlTracking — raw SQL (uppercase)", () => {
  it("parses uppercase SELECT", () => {
    const r = parseSqlTracking("SELECT * FROM users WHERE users.id = ?", [1]);
    expect(r.queryType).toBe("select");
    expect(r.tablesRead).toEqual(["users"]);
    expect(r.whereIds).toHaveLength(1);
  });

  it("parses uppercase UPDATE", () => {
    const r = parseSqlTracking("UPDATE users SET name = ? WHERE users.id = ?", ["new", 1]);
    expect(r.queryType).toBe("update");
    expect(r.tablesWritten).toEqual(["users"]);
    expect(r.whereIds).toHaveLength(1);
  });
});

describe("parseSqlTracking — edge cases", () => {
  it("handles multiple AND conditions in WHERE", () => {
    const r = parseSqlTracking(
      'select * from "users" where "users"."id" = ? and "users"."name" = ?',
      [1, "test"],
    );
    expect(r.whereIds).toHaveLength(2);
    expect(r.whereIds[0].column).toBe("id");
    expect(r.whereIds[1].column).toBe("name");
  });

  it("ignores params in SET clause (not WHERE)", () => {
    const r = parseSqlTracking('update "users" set "name" = ? where "users"."id" = ?', ["new", 1]);
    // Only the WHERE param should be extracted, not the SET param
    expect(r.whereIds).toHaveLength(1);
    expect(r.whereIds[0].column).toBe("id");
  });

  it("returns empty for parse errors", () => {
    const r = parseSqlTracking("not valid sqlite", []);
    expect(r.queryType).toBe("unknown");
    expect(r.tablesRead).toEqual([]);
    expect(r.tablesWritten).toEqual([]);
    expect(r.whereIds).toEqual([]);
  });
});
