#!/usr/bin/env tsx
import { consola } from "consola";
import cac from "cac";
import { initCommand } from "./commands/init";
import { buildCommand } from "./commands/build";
import { infoCommand } from "./commands/info";

consola.options.formatOptions = { date: false };

const cli = cac("edgepod");

cli.command("init", "Initialize a new Edgepod project").action(initCommand);
cli.command("build", "Generate migrations and prepare for deployment").action(buildCommand);
cli.command("info", "Display project info (API key, worker URL, etc.)").action(infoCommand);

// Default command — same as `init`
cli.command("", "Initialize a new Edgepod project (default)").action(initCommand);

cli.help();
cli.version("0.0.1");

cli.parse();
