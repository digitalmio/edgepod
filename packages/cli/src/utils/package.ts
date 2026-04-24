import pc from "picocolors";
import { updatePackage } from "write-package";

export const addScriptsToPackageJson = async (packageJsonPath: string) => {
  await updatePackage(packageJsonPath, {
    scripts: {
      "edgepod:dev": "edgepod run --port 7700",
      "edgepod:deploy": "edgepod run --deploy",
    },
    dependencies: {
      "@edgepod/client": "latest",
      "@edgepod/server": "latest",
    },
    devDependencies: {
      "@edgepod/cli": "latest",
    },
  });

  console.log(pc.green("Updated package.json with Edgepod scripts and dependencies."));
};
