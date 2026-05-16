import type { DurableObjectStorage } from "@cloudflare/workers-types";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { createMockDOStorage } from "./mockDOStorage";

export function createTestDb<TSchema extends Record<string, unknown>>(schema: TSchema) {
  const sqlite = new Database(":memory:");
  const storage = createMockDOStorage(sqlite);
  const db = drizzle(storage as unknown as DurableObjectStorage, { schema });
  return { db, sqlite, storage };
}
