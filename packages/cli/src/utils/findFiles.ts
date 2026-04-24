import path from "node:path";
import { findUp } from "find-up";

export const findRootPath = async () => {
  const packagePath = await findUp("package.json");
  return packagePath ? path.dirname(packagePath) : undefined;
};

export const findWrangler = async () =>
  findUp(["wrangler.toml", "wrangler.jsonc", "wrangler.json"]);

export const findPackageManager = async (): Promise<"npm" | "yarn" | "pnpm" | "bun"> => {
  const lockPath = await findUp([
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "bun.lock",
    "package-lock.json",
  ]);

  switch (lockPath?.split("/").pop()) {
    case "pnpm-lock.yaml":
      return "pnpm";
    case "yarn.lock":
      return "yarn";
    case "bun.lockb":
    case "bun.lock":
      return "bun";
    default:
      return "npm";
  }
};
