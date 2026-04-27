import { consola } from "consola";
import { updatePackage } from "write-package";

export const addScriptsToPackageJson = async (rootPath: string) => {
  const packageJsonPath = `${rootPath}/package.json`;
  await updatePackage(packageJsonPath, {
    scripts: {
      "edgepod:dev": "wrangler dev",
      "edgepod:deploy": "edgepod deploy",
    },
  });

  consola.success("Updated package.json with Edgepod scripts.");
};
