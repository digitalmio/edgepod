import { defineConfig } from "tsdown";
import { addNestedTypes } from "../../scripts/tsdown-config.mjs";

export default defineConfig({
  entry: "src/index.ts",
  format: ["esm", "cjs"],
  platform: "browser",
  dts: true,
  exports: {
    customExports: addNestedTypes,
  },
  outDir: "dist",
  deps: {
    neverBundle: ["react", "@types/react", "nanostores", "partysocket", "swr"],
  },
});
