import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": path.resolve(
        __dirname,
        "packages/server/src/__mocks__/cloudflare-workers.ts",
      ),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["packages/**/*.{test,spec}.{ts,tsx}"],
  },
});
