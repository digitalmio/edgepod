import { consola } from "consola";
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

export async function promptDataLocation(): Promise<DataLocationOptions> {
  const jurisdictionChoice = (await consola.prompt(
    "Do you need to specify data residency compliance? (For most projects this is not required)",
    { type: "select", options: ["None", "EU (GDPR)", "FedRAMP"] }
  )) as string | symbol | undefined;

  if (typeof jurisdictionChoice !== "string") process.exit(0);

  if (jurisdictionChoice === "EU (GDPR)") return { jurisdiction: "eu" };
  if (jurisdictionChoice === "FedRAMP") return { jurisdiction: "fedramp" };

  const hintChoice = (await consola.prompt(
    "Would you like to specify a database server location hint? (* may fall back to a nearby region)",
    { type: "select", options: ["Default location", ...Object.keys(HINT_MAP)] }
  )) as string | symbol | undefined;

  if (typeof hintChoice !== "string") process.exit(0);

  const locationHint = HINT_MAP[hintChoice];
  return locationHint ? { locationHint } : {};
}
