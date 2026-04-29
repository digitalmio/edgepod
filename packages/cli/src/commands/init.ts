import { consola } from "consola";
import {
  createFiles,
  generateWranglerFromTemplate,
  readEnvVar,
  updateGitignore,
  writeEnvFile,
  writeJwksFiles,
} from "../utils/files";
import { findPackageManager, findRootPath } from "../utils/findFiles";
import { addScriptsToPackageJson } from "../utils/package";
import { runNpmInstall } from "../execa/npmInstall";
import { promptDataLocation } from "../prompts/dataLocation";
import { promptAuthConfig } from "../prompts/authConfig";

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

  const dataLocation = await promptDataLocation();
  const auth = await promptAuthConfig();
  const existingApiKey = await readEnvVar(rootPath, "EDGEPOD_API_KEY");
  const apiKey = existingApiKey ?? `ep_pk_${crypto.randomUUID()}`;
  const envVars: Record<string, string> = { EDGEPOD_API_KEY: apiKey };

  try {
    await createFiles(rootPath, dataLocation);
    await updateGitignore(rootPath);
    await addScriptsToPackageJson(rootPath);
    await generateWranglerFromTemplate(rootPath, {
      apiKey,
      authMode: auth.mode,
      ...(auth.mode === "remote" ? { jwksUrl: auth.jwksUrl } : {}),
    });

    if (auth.mode === "local") {
      const existingPrivateKey = await readEnvVar(rootPath, "EDGEPOD_JWT_PRIVATE_KEY");
      if (existingPrivateKey) {
        envVars.EDGEPOD_JWT_PRIVATE_KEY = existingPrivateKey;
      } else {
        envVars.EDGEPOD_JWT_PRIVATE_KEY = await writeJwksFiles(rootPath);
      }
    }
    await writeEnvFile(rootPath, envVars);

    console.log("");
    consola.success("🚀 Edgepod initialized successfully.");
    consola.info(`Your API key:  ${apiKey}`);
    consola.info("Keep this safe — you'll need it to connect clients to your EdgePod server.");
    if (auth.mode === "local") {
      consola.info("Private signing key stored in edgepod/.env as EDGEPOD_JWT_PRIVATE_KEY.");
    }
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
