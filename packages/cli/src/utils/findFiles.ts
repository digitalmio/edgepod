import path from "node:path";
import { findUp } from "find-up";

export const findRootPath = async () => {
  const packagePath = await findUp("package.json");
  return packagePath ? path.dirname(packagePath) : undefined;
};

export const findWrangler = async () =>
  findUp(["wrangler.toml", "wrangler.jsonc", "wrangler.json"]);
