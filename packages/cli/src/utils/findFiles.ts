import path from "node:path";
import { findUp } from "find-up";

export const findRootPath = async () => {
  const packagePath = await findUp("package.json");
  return packagePath ? path.dirname(packagePath) : undefined;
};

export const findPackageManager = async () => {
  const packageLockPath = await findUp([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "bun.lock",
  ]);

  if (!packageLockPath) {
    return "npm"; // Default to npm if no lock file is found
  }

  switch (packageLockPath.split("/").pop()) {
    case "package-lock.json":
      return "npm";
    case "yarn.lock":
      return "yarn";
    case "pnpm-lock.yaml":
      return "pnpm";
    case "bun.lockb":
    case "bun.lock":
      return "bun";
    default:
      return "npm";
  }
};

export const findWrangler = async () =>
  findUp(["wrangler.toml", "wrangler.jsonc", "wrangler.json"]);
