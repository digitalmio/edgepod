import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  format: ["esm", "cjs"],
  platform: "browser",
  dts: true,
  exports: true,
  outDir: "dist",
  deps: {
    neverBundle: ["react", "@types/react", "nanostores", "partysocket", "swr"],
  },
});
