import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  format: "esm",
  platform: "node",
  target: "node22",
  banner: { js: "#!/usr/bin/env node" },
  dts: false,
  outDir: "dist",
  deps: {
    neverBundle: ["wrangler", "drizzle-kit", "esbuild"],
  },
});
