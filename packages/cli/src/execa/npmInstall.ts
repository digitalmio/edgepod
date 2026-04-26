import { consola } from "consola";
import { execa } from "execa";

export async function runNpmInstall(
  packageManager: "npm" | "pnpm" | "yarn" | "bun",
  rootPath: string
) {
  // We figure out the "quiet" flag based on the manager
  const flags = [];
  if (packageManager === "npm") flags.push("--loglevel=error");
  if (packageManager === "pnpm") flags.push("--reporter=silent"); // pnpm's quiet mode
  if (packageManager === "yarn") flags.push("--silent");
  if (packageManager === "bun") flags.push("--quiet");

  try {
    await execa(packageManager, ["install", ...flags], {
      cwd: rootPath,
      stdio: "inherit",
    });
  } catch {
    consola.error(`Install failed. Please run '${packageManager} install' manually.`);
    process.exit(1);
  }
}
