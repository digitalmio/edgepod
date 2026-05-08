import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    schema: "src/schema.ts",
  },
  format: ["esm", "cjs"],
  platform: "neutral",
  target: "es2022",
  dts: true,
  exports: true,
  outDir: "dist",
  deps: {
    alwaysBundle: ["drizzle-orm", "jose", "neverthrow", "@logtape/logtape"],
    neverBundle: ["cloudflare:workers", "@cloudflare/workers-types"],
    onlyBundle: false,
  },
});
