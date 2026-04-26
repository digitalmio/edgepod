import { consola } from "consola";
import { updatePackage } from "write-package";

export const addScriptsToPackageJson = async (rootPath: string) => {
  const packageJsonPath = `${rootPath}/package.json`;
  await updatePackage(packageJsonPath, {
    scripts: {
      "edgepod:dev": "edgepod run --port 7700",
      "edgepod:deploy": "edgepod run --deploy",
    },
  });

  consola.success("Updated package.json with Edgepod scripts.");
};
