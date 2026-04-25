import fs from "node:fs/promises";
import pc from "picocolors";
import { functionsIndexTemplate } from "../templates/functions";
import { schemaTemplate } from "../templates/schema";
import { wranglerJsonTemplate } from "../templates/wrangler";

export const createEdgepodDirectories = async (projectRoot: string) => {
  const edgepodRootDir = `${projectRoot}/edgepod`;
  const subdirectories = ["functions", ".generated/migrations", ".internal/server"];

  for (const subdir of subdirectories) {
    await fs.mkdir(`${edgepodRootDir}/${subdir}`, { recursive: true });
  }

  console.log(pc.green("Created project directories."));
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
    console.log(pc.green("Local database file ready."));
  }
};

export const createFiles = async (projectRoot: string) => {
  const files = [
    ["edgepod/.generated/types.ts", ""],
    ["edgepod/schema.ts", schemaTemplate()],
    ["edgepod/functions/index.ts", functionsIndexTemplate()],
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
    console.log(pc.green("Created project files."));
  } else if (created === 0) {
    console.log(pc.yellow("Project files already exist, skipping."));
  } else {
    console.log(
      pc.green(`Created ${created} project file(s).`) +
        pc.yellow(` ${files.length - created} already existed, skipped.`)
    );
  }
};

export const generateWranglerFromTemplate = async (projectRoot: string) => {
  const wranglerJsonPath = `${projectRoot}/wrangler.json`;

  await fs.writeFile(wranglerJsonPath, wranglerJsonTemplate(), { flag: "wx" });

  console.log(pc.green("Created wrangler.json."));
};
