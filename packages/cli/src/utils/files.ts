import fs from "node:fs/promises";

export const createEdgepodDirectories = async (projectRoot: string) => {
  const edgepodRootDir = `${projectRoot}/.edgepod`;
  const subdirectories = ["functions", "static", "db", "migrations"];

  try {
    for (const subdir of subdirectories) {
      await fs.mkdir(`${edgepodRootDir}/${subdir}`, { recursive: true });
      console.debug(`Created ${subdir} directory at ${edgepodRootDir}/${subdir}`);
    }
  } catch (error) {
    console.error(`Failed to create .edgepod directory: ${error}`);
    throw error;
  }
};

export const createLocalEdgepodSqlDbFile = async (projectRoot: string) => {
  const dbFilePath = `${projectRoot}/.edgepod/db/edgepod.db`;

  try {
    await fs.writeFile(dbFilePath, "");
    console.log(`Created local Edgepod SQL database file at ${dbFilePath}`);
  } catch (error) {
    console.error(`Failed to create local Edgepod SQL database file: ${error}`);
    throw error;
  }
};

export const createPublicFiles = async (projectRoot: string) => {
  const publicDir = `${projectRoot}/edgepod`;
  const deepestDir = `${publicDir}/functions`;
  const files = [
    ["schema.prisma", "// Add your database schema here"],
    ["functions/index.ts", "// Add your functions code here"],
  ];

  try {
    await fs.mkdir(deepestDir, { recursive: true });
    await Promise.all(
      files.map((file) =>
        fs.writeFile(`${publicDir}/${file[0]}`, file[1] ?? "", { flag: "wx" }).catch((e) => {
          if (e.code !== "EEXIST") throw e;
        })
      )
    );
    console.debug(`Created public directory at ${publicDir}`);
  } catch (error) {
    console.error(`Failed to create public directory: ${error}`);
    throw error;
  }
};
