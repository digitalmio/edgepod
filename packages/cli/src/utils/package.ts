import { consola } from "consola";
import { updatePackage } from "write-package";
import pkg from "../../package.json" with { type: "json" };

const wranglerTypesCmd =
  "wrangler types -c edgepod/wrangler.json edgepod/.generated/cloudflare-env.d.ts";

export const addScriptsToPackageJson = async (rootPath: string) => {
  const packageJsonPath = `${rootPath}/package.json`;
  await updatePackage(packageJsonPath, {
    scripts: {
      "preedgepod:dev": wranglerTypesCmd,
      "edgepod:dev": "wrangler dev -c edgepod/wrangler.json",
      "edgepod:migrations": "edgepod migrations",
      "preedgepod:deploy": wranglerTypesCmd,
      "edgepod:deploy": "wrangler deploy -c edgepod/wrangler.json --secrets-file edgepod/.env",
    },
    devDependencies: {
      wrangler: "latest",
      "@cloudflare/workers-types": "latest",
      "@edgepod/cli": `^${pkg.version}`,
      "@edgepod/client": `^${pkg.version}`,
      "@edgepod/server": `^${pkg.version}`,
    },
  });

  consola.success("Updated package.json with Edgepod scripts.");
};
