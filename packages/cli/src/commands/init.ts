import { confirm } from "@inquirer/prompts";
import pc from "picocolors";
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

export const initCommand = async () => {
  console.log("");
  console.log(pc.bold("Edgepod — Init"));
  console.log("Setting up your project...");
  console.log("");

  const [rootPath, wranglerPath, packageManager] = await Promise.all([
    findRootPath(),
    findWrangler(),
    findPackageManager(),
  ]);

  if (!rootPath) {
    console.error(
      pc.red(
        "No package.json found. Please run your package manager's init command first (e.g. npm init)."
      )
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
    console.log(pc.green("🚀 Edgepod initialized successfully."));
    console.log("");

    const runInstall = await confirm({
      message: `Run ${packageManager} install now?`,
      default: true,
    });

    if (runInstall) {
      await runNpmInstall(packageManager, rootPath);
    } else {
      console.log(`Remember to run ${pc.cyan(`${packageManager} install`)} before starting.`);
    }
  } catch (error) {
    console.error(
      pc.red(`Initialization failed: ${error instanceof Error ? error.message : error}`)
    );
    process.exit(1);
  }
};
