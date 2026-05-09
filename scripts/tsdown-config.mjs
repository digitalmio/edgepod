/**
 * Transforms flat tsdown exports into nested structure with types conditions.
 * Converts { import: "./dist/index.js" } into { import: { types: "./dist/index.d.ts", default: "./dist/index.js" } }
 */
export function addNestedTypes(exports) {
  for (const [key, value] of Object.entries(exports)) {
    if (key === "./package.json") continue;
    const entry = value;
    if (entry.import && typeof entry.import === "string") {
      const jsPath = entry.import;
      const dtsPath = jsPath.replace(/\.(js|cjs)$/, ".d.ts");
      entry.import = { types: dtsPath, default: jsPath };
    }
    if (entry.require && typeof entry.require === "string") {
      const cjsPath = entry.require;
      const dctsPath = cjsPath.replace(/\.(js|cjs)$/, ".d.cts");
      entry.require = { types: dctsPath, default: cjsPath };
    }
  }
  return exports;
}
