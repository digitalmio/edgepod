import { consola } from "consola";
import { updatePackage } from "write-package";
import pkg from "../../package.json" with { type: "json" };

export const addScriptsToPackageJson = async (rootPath: string) => {
  const packageJsonPath = `${rootPath}/package.json`;
  await updatePackage(packageJsonPath, {
    scripts: {
      "edgepod:dev": "wrangler dev -c edgepod/wrangler.json",
      "edgepod:build":
        "wrangler types --output edgepod/.generated/cloudflare-env.d.ts && edgepod build",
      "edgepod:deploy": "wrangler deploy -c edgepod/wrangler.json --secrets-file edgepod/.env",
    },
    devDependencies: {
      wrangler: "latest",
      "@edgepod/cli": `^${pkg.version}`,
      "@edgepod/client": `^${pkg.version}`,
      "@edgepod/server": `^${pkg.version}`,
    },
  });

  consola.success("Updated package.json with Edgepod scripts.");
};
