import fs from "node:fs/promises";
import { consola } from "consola";
import { execa } from "execa";
import { generateMigrationFiles } from "../migrations/generate";
import { findRootPath, findWrangler } from "../utils/findFiles";

const readApiKeyFromWrangler = async (wranglerPath: string): Promise<string | null> => {
  const content = await fs.readFile(wranglerPath, "utf-8");

  if (wranglerPath.endsWith(".toml")) {
    const match = content.match(/EDGEPOD_API_KEY\s*=\s*"([^"]+)"/);
    return match?.[1] ?? null;
  }

  try {
    const json = JSON.parse(content);
    return json?.vars?.EDGEPOD_API_KEY ?? null;
  } catch {
    return null;
  }
};

const generateMigrations = async (rootPath: string) => {
  consola.start("Generating migrations...");
  await generateMigrationFiles(rootPath);
  consola.success("Migrations ready.");
};

export const deployCommand = async () => {
  const [rootPath, wranglerPath] = await Promise.all([findRootPath(), findWrangler()]);

  if (!rootPath) {
    consola.error("No package.json found. Are you in the right directory?");
    process.exit(1);
  }

  if (!wranglerPath) {
    consola.error("No wrangler config found. Run edgepod init first.");
    process.exit(1);
  }

  try {
    await generateMigrations(rootPath);
  } catch {
    consola.error("Migration generation failed. Make sure edgepod/schema.ts exists.");
    process.exit(1);
  }

  const apiKey = await readApiKeyFromWrangler(wranglerPath);

  if (!apiKey) {
    consola.error("EDGEPOD_API_KEY not found in wrangler config. Run edgepod init first.");
    process.exit(1);
  }

  consola.start("Setting EDGEPOD_API_KEY as a Wrangler secret...");

  try {
    const proc = execa("wrangler", ["secret", "put", "EDGEPOD_API_KEY"], {
      cwd: rootPath,
      stdio: ["pipe", "inherit", "inherit"],
    });

    proc.stdin?.write(apiKey);
    proc.stdin?.end();

    await proc;

    consola.success("Secret set.");
  } catch {
    consola.error("Failed to set secret. Make sure wrangler is installed and you are logged in.");
    process.exit(1);
  }

  consola.start("Deploying with Wrangler...");

  try {
    await execa("wrangler", ["deploy"], { cwd: rootPath, stdio: "inherit" });
  } catch {
    consola.error("Deployment failed.");
    process.exit(1);
  }

  // Fetch the deployed URL from wrangler deployments
  let publicUrl: string | null = null;
  try {
    const { stdout } = await execa("wrangler", ["deployments", "list", "--json"], {
      cwd: rootPath,
    });
    const deployments = JSON.parse(stdout) as Array<{ url?: string; script_url?: string }>;
    const latest = deployments[0];
    publicUrl = latest?.url ?? latest?.script_url ?? null;
  } catch {
    // Non-fatal — URL is a convenience, not required
  }

  console.log("");
  consola.success("Deployed successfully.");
  console.log("");
  consola.info(`API key:       ${apiKey}`);
  if (publicUrl) {
    consola.info(`Worker URL:    ${publicUrl}`);
  }
  console.log("");
};
