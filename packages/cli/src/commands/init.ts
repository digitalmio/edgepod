import { consola } from "consola";
import {
  createFiles,
  generateWranglerFromTemplate,
  updateGitignore,
  writeEnvFile,
  writeJwksFiles,
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

type AuthChoice = { mode: "none" } | { mode: "remote"; jwksUrl: string } | { mode: "local" };

async function promptDataLocation(): Promise<DataLocationOptions> {
  const jChoice = (await consola.prompt(
    "Do you need to specify data residency compliance? (For most projects this is not required)",
    { type: "select", options: ["None", "EU (GDPR)", "FedRAMP"] }
  )) as string;

  if (jChoice === "EU (GDPR)") return { jurisdiction: "eu" };
  if (jChoice === "FedRAMP") return { jurisdiction: "fedramp" };

  const hintChoice = (await consola.prompt(
    "Would you like to specify a database server location hint? (* may fall back to a nearby region)",
    { type: "select", options: ["Default location", ...Object.keys(HINT_MAP)] }
  )) as string;

  const locationHint = HINT_MAP[hintChoice];
  return locationHint ? { locationHint } : {};
}

async function promptAuthConfig(): Promise<AuthChoice> {
  const choice = (await consola.prompt("Enable user authentication?", {
    type: "select",
    options: ["No", "Remote JWKS (Auth0, Clerk, Supabase, etc.)", "Local key pair"],
  })) as string;

  if (choice.startsWith("Remote")) {
    const jwksUrl = (await consola.prompt("Enter your JWKS endpoint URL:", {
      type: "text",
    })) as string;
    return { mode: "remote", jwksUrl };
  }

  if (choice.startsWith("Local")) return { mode: "local" };

  return { mode: "none" };
}

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
  const apiKey = `ep_pk_${crypto.randomUUID()}`;
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
      envVars.EDGEPOD_JWT_PRIVATE_KEY = await writeJwksFiles(rootPath);
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
