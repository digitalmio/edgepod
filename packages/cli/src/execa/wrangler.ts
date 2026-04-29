import { execa } from "execa";
import { consola } from "consola";

const runWrangler = async (
  args: string[],
  cwd: string,
  exitOnAuthError = true
): Promise<string | null> => {
  try {
    const { stdout } = await execa("wrangler", args, { cwd, preferLocal: true });
    return stdout;
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr ?? "";
    if (
      stderr.includes("not authenticated") ||
      stderr.includes("You must be logged in") ||
      stderr.includes("Failed to fetch auth token") ||
      stderr.includes("CLOUDFLARE_API_TOKEN")
    ) {
      if (exitOnAuthError) {
        consola.error("You are not logged in to Wrangler. Run `wrangler login` first.");
        process.exit(1);
      }
      return null;
    }
    throw e;
  }
};

export const wranglerDeploymentsList = async (
  cwd: string
): Promise<Array<{ url?: string; script_url?: string }> | null> => {
  const stdout = await runWrangler(["deployments", "list", "--json"], cwd, false);
  if (stdout === null) return null;
  return JSON.parse(stdout) as Array<{ url?: string; script_url?: string }>;
};
