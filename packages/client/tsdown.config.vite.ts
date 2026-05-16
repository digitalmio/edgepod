import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/vite.ts",
  format: ["esm", "cjs"],
  platform: "node",
  dts: true,
  exports: false,
  outDir: "dist",
  clean: false,
  deps: {
    neverBundle: ["vite"],
  },
});
