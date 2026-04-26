// Drizzle SQLite schema builders and query helpers.
// This module is safe to import in Node.js (e.g. CLI migration tooling) because
// it has no dependency on cloudflare:workers.
export {
  sqliteTable as table,
  sqliteTable,
  sqliteView as view,
  sqliteView,
  text,
  integer,
  real,
  blob,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export {
  eq,
  ne,
  lt,
  lte,
  gt,
  gte,
  and,
  or,
  not,
  isNull,
  isNotNull,
  inArray,
  like,
  sql,
} from "drizzle-orm";
