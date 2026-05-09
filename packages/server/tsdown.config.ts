import { defineConfig } from "tsdown";

function addNestedTypes(exports: Record<string, unknown>) {
  for (const [key, value] of Object.entries(exports)) {
    if (key === "./package.json") continue;
    const entry = value as Record<string, unknown>;
    if (entry.import && typeof entry.import === "string") {
      const jsPath = entry.import as string;
      const dtsPath = jsPath.replace(/\.(js|cjs)$/, ".d.ts");
      entry.import = { types: dtsPath, default: jsPath };
    }
    if (entry.require && typeof entry.require === "string") {
      const cjsPath = entry.require as string;
      const dctsPath = cjsPath.replace(/\.(js|cjs)$/, ".d.cts");
      entry.require = { types: dctsPath, default: cjsPath };
    }
  }
  return exports;
}

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
    alwaysBundle: ["drizzle-orm", "jose", "neverthrow", "@logtape/logtape"],
    neverBundle: ["cloudflare:workers", "@cloudflare/workers-types"],
    onlyBundle: false,
  },
});
