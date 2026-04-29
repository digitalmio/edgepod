import { consola } from "consola";
import {
  createFiles,
  generateWranglerFromTemplate,
  updateGitignore,
  writeEnvFile,
} from "../utils/files";
import { findPackageManager, findRootPath } from "../utils/findFiles";
import { addScriptsToPackageJson } from "../utils/package";
import { runNpmInstall } from "../execa/npmInstall";
import type { DataLocationOptions } from "../templates/server";

const HINT_MAP: Record<string, string> = {
  "Western North America": "wnam",
  "Eastern North America": "enam",
  "Western Europe": "weur",
  "Eastern Europe": "eeur",
  "Asia-Pacific": "apac",
  Oceania: "oc",
  "South America *": "sam",
  "Africa *": "afr",
  "Middle East *": "me",
};

export const initCommand = async () => {
  console.log("");
  consola.start("Setting up your project...");
  console.log("");

  const [rootPath, packageManager] = await Promise.all([findRootPath(), findPackageManager()]);

  if (!rootPath) {
    consola.error(
      "No package.json found. Please run your package manager's init command first (e.g. npm init)."
    );
    process.exit(1);
  }

  const jChoice = (await consola.prompt(
    "Do you need to specify data residency compliance? (For most projects this is not required)",
    {
      type: "select",
      options: ["None", "EU (GDPR)", "FedRAMP"],
    }
  )) as string;

  const dataLocation: DataLocationOptions = {};

  if (jChoice === "EU (GDPR)") {
    dataLocation.jurisdiction = "eu";
  } else if (jChoice === "FedRAMP") {
    dataLocation.jurisdiction = "fedramp";
  } else {
    const hintChoice = (await consola.prompt(
      "Would you like to specify a database server location hint? (* may fall back to a nearby region)",
      {
        type: "select",
        options: ["Default location", ...Object.keys(HINT_MAP)],
      }
    )) as string;
    const hint = HINT_MAP[hintChoice];
    if (hint) dataLocation.locationHint = hint;
  }

  const apiKey = `ep_pk_${crypto.randomUUID()}`;

  try {
    await createFiles(rootPath, dataLocation);
    await updateGitignore(rootPath);
    await addScriptsToPackageJson(rootPath);

    await generateWranglerFromTemplate(rootPath, apiKey);
    await writeEnvFile(rootPath, apiKey);

    console.log("");
    consola.success("🚀 Edgepod initialized successfully.");
    consola.info(`Your API key:  ${apiKey}`);
    consola.info("Keep this safe — you'll need it to connect clients to your EdgePod server.");
    console.log("");

    const runInstall = await consola.prompt(`Run ${packageManager} install now?`, {
      type: "confirm",
      initial: true,
    });

    if (runInstall) {
      await runNpmInstall(packageManager, rootPath);
    } else {
      consola.info(`Remember to run \`${packageManager} install\` before starting.`);
    }
  } catch (error) {
    consola.error(`Initialization failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};
