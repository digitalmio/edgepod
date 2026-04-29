import { consola } from "consola";
import { execa } from "execa";

export async function runNpmInstall(
  packageManager: "npm" | "pnpm" | "yarn" | "bun",
  rootPath: string
) {
  const quietFlag: Record<string, string> = {
    npm: "--loglevel=error",
    pnpm: "--reporter=silent",
    yarn: "--silent",
    bun: "--quiet",
  };

  try {
    await execa(packageManager, ["install", quietFlag[packageManager]].filter(Boolean), {
      cwd: rootPath,
      stdio: "inherit",
    });
  } catch {
    consola.error(`Install failed. Please run '${packageManager} install' manually.`);
    process.exit(1);
  }
}
