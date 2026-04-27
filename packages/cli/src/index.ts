#!/usr/bin/env tsx
import cac from "cac";
import { initCommand } from "./commands/init";
import { deployCommand } from "./commands/deploy";

const cli = cac("edgepod");

cli.command("init", "Initialize a new Edgepod project").action(initCommand);
cli.command("deploy", "Set secrets and deploy with Wrangler").action(deployCommand);

// Default command — same as `init`
cli.command("", "Initialize a new Edgepod project (default)").action(initCommand);

cli.help();
cli.version("0.0.1");

cli.parse();
