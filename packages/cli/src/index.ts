#!/usr/bin/env tsx
import cac from "cac";
import { initCommand } from "./commands/init";

const cli = cac("edgepod");

cli.command("init", "Initialize a new Edgepod project").action(initCommand);

// Default command — same as `init`
cli.command("", "Initialize a new Edgepod project (default)").action(initCommand);

cli.help();
cli.version("0.0.1");

cli.parse();
