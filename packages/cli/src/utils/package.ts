import { consola } from "consola";
import { updatePackage } from "write-package";

export const addScriptsToPackageJson = async (rootPath: string) => {
  const packageJsonPath = `${rootPath}/package.json`;
  await updatePackage(packageJsonPath, {
    scripts: {
      "edgepod:dev": "edgepod build && wrangler dev -c edgepod/wrangler.json",
      "edgepod:deploy":
        "edgepod build && wrangler deploy -c edgepod/wrangler.json --secrets-file edgepod/.env",
    },
  });

  consola.success("Updated package.json with Edgepod scripts.");
};
