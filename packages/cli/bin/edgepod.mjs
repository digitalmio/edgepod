#!/usr/bin/env node
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const require = createRequire(import.meta.url);
const tsxPath = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/.bin/tsx");
const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "../src/index.ts");

const { spawnSync } = require("node:child_process");
const result = spawnSync(tsxPath, [scriptPath, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
