import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@slicemedia/devkit-addon": resolve(import.meta.dirname, "packages/addon/src/index.ts"),
      "@slicemedia/devkit-core": resolve(import.meta.dirname, "packages/core/src/index.ts"),
    },
  },
  test: {
    coverage: {
      enabled: false,
      provider: "v8",
    },
    environment: "jsdom",
    include: [
      "packages/**/*.test.ts",
      "templates/**/*.test.ts",
      "tests/**/*.test.ts",
      "tests/**/*.test.mjs",
    ],
    restoreMocks: true,
  },
});
