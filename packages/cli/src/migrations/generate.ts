import fs from "node:fs/promises";
import path from "node:path";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import type { DrizzleSQLiteSnapshotJSON } from "drizzle-kit/api";
import { consola } from "consola";

const SNAPSHOT_FILE = "snapshot.json";

const emptySnapshot = (): DrizzleSQLiteSnapshotJSON => ({
  version: "6",
  dialect: "sqlite",
  tables: {},
  views: {},
  enums: {},
  _meta: { tables: {}, columns: {} },
  id: "00000000-0000-0000-0000-000000000000",
  prevId: "00000000-0000-0000-0000-000000000000",
});

export async function generateMigrationFiles(
  rootPath: string,
  schemaRelPath: string = "edgepod/schema.ts",
  outputRelDir: string = "edgepod/.generated/migrations"
): Promise<void> {
  const absSchemaPath = path.resolve(rootPath, schemaRelPath);
  const absOutputDir = path.resolve(rootPath, outputRelDir);
  const snapshotPath = path.join(absOutputDir, SNAPSHOT_FILE);

  // Load previous snapshot if it exists
  let prevSnapshot: DrizzleSQLiteSnapshotJSON;
  try {
    const raw = await fs.readFile(snapshotPath, "utf-8");
    prevSnapshot = JSON.parse(raw) as DrizzleSQLiteSnapshotJSON;
  } catch {
    prevSnapshot = emptySnapshot();
  }

  // Import the user's schema and generate a new snapshot
  const userSchema = await import(absSchemaPath);
  const curSnapshot = await generateSQLiteDrizzleJson(userSchema, prevSnapshot.id);

  // Diff the snapshots to get SQL statements
  const statements = await generateSQLiteMigration(prevSnapshot, curSnapshot);

  if (statements.length === 0) {
    consola.warn("No schema changes detected, no migration generated.");
    return;
  }

  // Write migration file
  await fs.mkdir(absOutputDir, { recursive: true });
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const migrationPath = path.join(absOutputDir, `${timestamp}.sql`);

  await fs.writeFile(migrationPath, statements.join("\n"), "utf-8");
  consola.success(`Migration written to ${migrationPath}`);

  // Persist updated snapshot
  await fs.writeFile(snapshotPath, JSON.stringify(curSnapshot, null, 2), "utf-8");
}
