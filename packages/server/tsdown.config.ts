import { defineConfig } from "tsdown";
import { addNestedTypes } from "../../scripts/tsdown-config.mjs";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    schema: "src/schema.ts",
  },
  format: ["esm", "cjs"],
  platform: "neutral",
  target: "es2022",
  dts: true,
  exports: {
    customExports: addNestedTypes,
  },
  outDir: "dist",
  deps: {
    neverBundle: ["cloudflare:workers", "@cloudflare/workers-types"],
  },
});
