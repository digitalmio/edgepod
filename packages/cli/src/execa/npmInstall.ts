import { consola } from "consola";
import { execa } from "execa";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

const quietFlag: Record<PackageManager, string> = {
  npm: "--loglevel=error",
  pnpm: "--reporter=silent",
  yarn: "--silent",
  bun: "--quiet",
};

export async function runNpmInstall(packageManager: PackageManager, rootPath: string) {
  try {
    await execa(packageManager, ["install", quietFlag[packageManager]], {
      cwd: rootPath,
      stdio: "inherit",
    });
  } catch {
    consola.error(`Install failed. Please run '${packageManager} install' manually.`);
    process.exit(1);
  }
}
