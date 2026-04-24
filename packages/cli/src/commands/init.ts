import {
  createEdgepodDirectories,
  createLocalEdgepodSqlDbFile,
  createPublicFiles,
} from "../utils/files";
import { findPackageManager, findRootPath, findWrangler } from "../utils/findFiles";
import { addScriptsToPackageJson } from "../utils/package";

export const initCommand = async () => {
  const packageManager = await findPackageManager();
  const rootPath = await findRootPath();
  const wranglerPath = await findWrangler();

  // if no rootPath - we need to ask user to init the project first
  if (!rootPath) {
    console.error(
      "No package manager lock file found. Please run 'npm / yarn / pnpm / bun init' to initialize your project first."
    );
    return;
  }

  console.log(`Detected package manager: ${packageManager}`);
  console.log(`Project root path: ${rootPath}`);

  await createEdgepodDirectories(rootPath);
  await createLocalEdgepodSqlDbFile(rootPath);
  await createPublicFiles(rootPath);

  await addScriptsToPackageJson(`${rootPath}/package.json`);

  if (wranglerPath) {
    console.warn(
      `Wrangler configuration file found at ${wranglerPath}. Please make sure to configure it to work with Edgepod.`
    );
  } else {
    console.warn(
      "No Wrangler configuration file found. If you plan to deploy to Cloudflare Workers, please run 'wrangler init' to initialize your project with Wrangler."
    );
  }
};
