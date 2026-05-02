import fs from "node:fs/promises";
import { consola } from "consola";
import { wranglerDeploymentsList } from "../execa/wrangler";
import { findRootPath } from "../utils/findFiles";

const readWranglerJson = async (wranglerPath: string): Promise<Record<string, unknown> | null> => {
  try {
    return JSON.parse(await fs.readFile(wranglerPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const infoCommand = async () => {
  const rootPath = await findRootPath();

  if (!rootPath) {
    consola.error("No package.json found. Are you in the right directory?");
    process.exit(1);
  }

  const wranglerPath = `${rootPath}/edgepod/wrangler.json`;
  const wrangler = await readWranglerJson(wranglerPath);

  if (!wrangler) {
    consola.error("edgepod/wrangler.json not found. Run edgepod init first.");
    process.exit(1);
  }

  const vars = wrangler.vars as Record<string, string> | undefined;
  const apiKey = vars?.EDGEPOD_API_KEY ?? null;
  const workerName = typeof wrangler.name === "string" ? wrangler.name : null;

  console.log("");
  consola.info("EdgePod project info");
  console.log("");

  if (apiKey) {
    consola.log(`  API key:      ${apiKey}`);
  } else {
    consola.warn("  API key:      not found in edgepod/wrangler.json");
  }

  if (workerName) {
    consola.log(`  Worker name:  ${workerName}`);
  }

  // Try to fetch the deployed URL from wrangler
  process.stdout.write("◐ Fetching deployment info...");
  const deployments = await wranglerDeploymentsList(rootPath);
  process.stdout.write("\r\x1b[K"); // clear the spinner line

  if (deployments === null) {
    consola.log("  Worker URL:   run `wrangler login` to see deployment info");
  } else {
    const url = deployments[0]?.url ?? deployments[0]?.script_url ?? null;
    if (url) {
      consola.log(`  Worker URL:   ${url}`);
    } else {
      consola.log(
        "  Worker URL:   not deployed yet — run `wrangler deploy -c edgepod/wrangler.json`",
      );
    }
  }

  console.log("");
};
