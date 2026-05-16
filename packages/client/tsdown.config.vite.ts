import { defineConfig } from "tsdown";
import { addNestedTypes } from "../../scripts/tsdown-config.mjs";

export default defineConfig({
  entry: "src/vite.ts",
  format: ["esm", "cjs"],
  platform: "node",
  dts: true,
  exports: {
    customExports: addNestedTypes,
  },
  outDir: "dist",
  clean: false,
  deps: {
    neverBundle: ["vite"],
  },
});
