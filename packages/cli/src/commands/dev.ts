import fs from "node:fs/promises";
import path from "node:path";
import { consola } from "consola";
import { execa } from "execa";
import { generateMigrationFiles } from "../migrations/generate";
import { findRootPath } from "../utils/findFiles";

export const devCommand = async () => {
  const rootPath = await findRootPath();

  if (!rootPath) {
    consola.error("No package.json found. Are you in the right directory?");
    process.exit(1);
  }

  const edgepodDir = path.resolve(rootPath, "edgepod");
  const wranglerJsonPath = path.resolve(edgepodDir, "wrangler.json");

  try {
    await fs.access(wranglerJsonPath);
  } catch {
    consola.error("No edgepod/wrangler.json found. Run `edgepod init` first.");
    process.exit(1);
  }

  consola.info("Starting EdgePod dev server...");

  // Run migrations once on startup
  try {
    await generateMigrationFiles(rootPath);
  } catch (e) {
    consola.error(`Migration failed: ${e instanceof Error ? e.message : e}`);
    consola.error("Fix the issue and restart with `edgepod dev`.");
    process.exit(1);
  }

  // Spawn wrangler dev
  const wrangler = execa("wrangler", ["dev", "-c", "edgepod/wrangler.json"], {
    cwd: rootPath,
    preferLocal: true,
    stdio: "inherit",
    reject: false,
  });

  // Use dynamic import for chokidar so it doesn't fail if not installed
  let watcher: { close: () => Promise<void> } | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  let isMigrating = false;

  try {
    const { watch } = await import("chokidar");
    const schemaPath = path.resolve(edgepodDir, "schema.ts");

    watcher = watch(schemaPath, { ignoreInitial: true });

    watcher.on("change", () => {
      consola.info("Schema change detected, running migrations...");

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (isMigrating) return;
        isMigrating = true;
        try {
          await generateMigrationFiles(rootPath);
          consola.success("Migrations updated. Wrangler will restart the worker.");
        } catch (e) {
          consola.error(`Migration failed: ${e instanceof Error ? e.message : e}`);
          consola.error(
            "Revert your schema change, fix the issue, and restart with `edgepod dev`.",
          );
          await cleanup();
          process.exit(1);
        } finally {
          isMigrating = false;
        }
      }, 100);
    });
  } catch {
    consola.warn(
      "chokidar is not installed. Schema watching disabled. Install chokidar to enable auto-migrations on schema changes.",
    );
  }

  const cleanup = async () => {
    consola.info("Shutting down EdgePod dev server...");
    if (debounceTimer) clearTimeout(debounceTimer);
    if (watcher) await watcher.close();
    wrangler.kill("SIGTERM", { forceKillAfterTimeout: 5000 });
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await wrangler;

  // Close watcher after wrangler exits so the process can terminate
  if (debounceTimer) clearTimeout(debounceTimer);
  if (watcher) await watcher.close();
};
