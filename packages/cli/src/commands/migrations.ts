import { consola } from "consola";
import { generateMigrationFiles } from "../migrations/generate";
import { findRootPath } from "../utils/findFiles";

export const migrationsCommand = async () => {
  const rootPath = await findRootPath();

  if (!rootPath) {
    consola.error("No package.json found. Are you in the right directory?");
    process.exit(1);
  }

  try {
    await generateMigrationFiles(rootPath);
  } catch (e) {
    consola.error(`Migrations failed: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
};
