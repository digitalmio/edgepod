import pc from "picocolors";
import { showWranglerConfigMessage } from "../messagelogs/wrangler";
import {
  createEdgepodDirectories,
  createLocalEdgepodSqlDbFile,
  createPublicFiles,
  generateWranglerFromTemplate,
} from "../utils/files";
import { findRootPath, findWrangler } from "../utils/findFiles";
import { addScriptsToPackageJson } from "../utils/package";

export const initCommand = async () => {
  const [rootPath, wranglerPath] = await Promise.all([findRootPath(), findWrangler()]);

  if (!rootPath) {
    console.error(
      pc.red(
        "No package.json found. Please run your package manager's init command first (e.g. npm init)."
      )
    );
    process.exit(1);
  }

  console.log(`Project root: ${pc.cyan(rootPath)}`);
  console.log("");

  try {
    await createEdgepodDirectories(rootPath);
    await createLocalEdgepodSqlDbFile(rootPath);
    await createPublicFiles(rootPath);
    await addScriptsToPackageJson(`${rootPath}/package.json`);

    if (wranglerPath) {
      showWranglerConfigMessage(wranglerPath);
    } else {
      await generateWranglerFromTemplate(rootPath);
    }

    console.log("");
    console.log(pc.green("Edgepod initialized successfully."));
  } catch (error) {
    console.error(
      pc.red(`Initialization failed: ${error instanceof Error ? error.message : error}`)
    );
    process.exit(1);
  }
};
