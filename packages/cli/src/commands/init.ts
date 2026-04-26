import { consola } from "consola";
import { showWranglerConfigMessage } from "../message-logs/wrangler";
import {
  createEdgepodDirectories,
  createLocalEdgepodSqlDbFile,
  createFiles,
  generateWranglerFromTemplate,
} from "../utils/files";
import { findPackageManager, findRootPath, findWrangler } from "../utils/findFiles";
import { addScriptsToPackageJson } from "../utils/package";
import { runNpmInstall } from "../execa/npmInstall";
import { generateMigrationFiles } from "../migrations/generate";

export const initCommand = async () => {
  console.log("");
  consola.start("Setting up your project...");
  console.log("");

  const [rootPath, wranglerPath, packageManager] = await Promise.all([
    findRootPath(),
    findWrangler(),
    findPackageManager(),
  ]);

  if (!rootPath) {
    consola.error(
      "No package.json found. Please run your package manager's init command first (e.g. npm init)."
    );
    process.exit(1);
  }

  try {
    await createEdgepodDirectories(rootPath);
    await createLocalEdgepodSqlDbFile(rootPath);
    await createFiles(rootPath);
    await addScriptsToPackageJson(rootPath);

    if (wranglerPath) {
      showWranglerConfigMessage(wranglerPath);
    } else {
      await generateWranglerFromTemplate(rootPath);
    }

    console.log("");
    consola.success("🚀 Edgepod initialized successfully.");
    console.log("");

    await generateMigrationFiles(rootPath);

    const runInstall = await consola.prompt(`Run ${packageManager} install now?`, {
      type: "confirm",
      initial: true,
    });

    if (runInstall) {
      await runNpmInstall(packageManager, rootPath);
    } else {
      consola.info(`Remember to run \`${packageManager} install\` before starting.`);
    }
  } catch (error) {
    consola.error(`Initialization failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};
