import fs from "node:fs/promises";
import pc from "picocolors";
import { functionsIndexTemplate } from "../templates/functions";
import { prismaSchemaTemplate } from "../templates/prisma";
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
  const dbFilePath = `${projectRoot}/edgepod/.internal/local.db`;

  await fs.writeFile(dbFilePath, "", { flag: "wx" }).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "EEXIST") throw e;
  });

  console.log(pc.green("Local database file ready."));
};

export const createPublicFiles = async (projectRoot: string) => {
  const files = [
    ["edgepod/schema.prisma", prismaSchemaTemplate()],
    ["edgepod/functions/index.ts", functionsIndexTemplate()],
  ];

  await Promise.all(
    files.map((file) =>
      fs
        .writeFile(`${projectRoot}/${file[0]}`, file[1] ?? "", { flag: "wx" })
        .catch((e: NodeJS.ErrnoException) => {
          if (e.code !== "EEXIST") throw e;
        })
    )
  );

  console.log(pc.green("Created project files."));
};

export const generateWranglerFromTemplate = async (projectRoot: string) => {
  const wranglerJsonPath = `${projectRoot}/wrangler.json`;

  await fs.writeFile(wranglerJsonPath, wranglerJsonTemplate(), { flag: "wx" });

  console.log(pc.green("Created wrangler.json."));
};
