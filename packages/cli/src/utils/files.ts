import fs from "node:fs/promises";
import { consola } from "consola";
import { functionsIndexTemplate } from "../templates/functions";
import { schemaTemplate } from "../templates/schema";
import { wranglerJsonTemplate } from "../templates/wrangler";
import { genTypesTemplate } from "../templates/types";
import { serverTemplate } from "../templates/server";

export const createEdgepodDirectories = async (projectRoot: string) => {
  const edgepodRootDir = `${projectRoot}/edgepod`;
  const subdirectories = ["functions", ".generated/migrations", ".internal/server"];

  for (const subdir of subdirectories) {
    await fs.mkdir(`${edgepodRootDir}/${subdir}`, { recursive: true });
  }

  consola.success("Created project directories.");
};

export const createLocalEdgepodSqlDbFile = async (projectRoot: string) => {
  const dbFilePath = `${projectRoot}/edgepod/.internal/shadow.db`;

  const created = await fs
    .writeFile(dbFilePath, "", { flag: "wx" })
    .then(() => true)
    .catch((e: NodeJS.ErrnoException) => {
      if (e.code === "EEXIST") return false;
      throw e;
    });

  if (created) {
    consola.success("Local database file ready.");
  }
};

export const createFiles = async (projectRoot: string) => {
  const files = [
    ["edgepod/types.ts", genTypesTemplate()],
    ["edgepod/schema.ts", schemaTemplate()],
    ["edgepod/functions/index.ts", functionsIndexTemplate()],
    ["edgepod/.generated/server.ts", serverTemplate()],
  ];

  const results = await Promise.all(
    files.map((file) =>
      fs
        .writeFile(`${projectRoot}/${file[0]}`, file[1] ?? "", { flag: "wx" })
        .then(() => true)
        .catch((e: NodeJS.ErrnoException) => {
          if (e.code === "EEXIST") return false;
          throw e;
        })
    )
  );

  const created = results.filter(Boolean).length;

  if (created === files.length) {
    consola.success("Created project files.");
  } else if (created === 0) {
    consola.warn("Project files already exist, skipping.");
  } else {
    consola.success(`Created ${created} project file(s).`);
    consola.warn(`${files.length - created} file(s) already existed, skipped.`);
  }
};

export const generateWranglerFromTemplate = async (projectRoot: string, apiKey: string) => {
  const wranglerJsonPath = `${projectRoot}/wrangler.json`;

  await fs.writeFile(wranglerJsonPath, wranglerJsonTemplate(apiKey), { flag: "wx" });

  consola.success("Created wrangler.json.");
};
