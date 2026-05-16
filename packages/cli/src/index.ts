import { consola } from "consola";
import cac from "cac";
import { initCommand } from "./commands/init";
import { migrationsCommand } from "./commands/migrations";
import { infoCommand } from "./commands/info";
import { devCommand } from "./commands/dev";
import pkg from "../package.json" with { type: "json" };

consola.options.formatOptions = { date: false };

const cli = cac("edgepod");

cli.command("init", "Initialize a new Edgepod project").action(initCommand);
cli
  .command("migrations", "Detect schema changes and generate Drizzle migrations")
  .action(migrationsCommand);
cli.command("dev", "Start the Edgepod dev server with auto-migrations").action(devCommand);
cli.command("info", "Display project info (API key, worker URL, etc.)").action(infoCommand);

// Default command — same as `init`
cli.command("", "Initialize a new Edgepod project (default)").action(initCommand);

cli.help();
cli.version(pkg.version);

cli.parse();
