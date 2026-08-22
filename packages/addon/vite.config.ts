import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: ["@slicemedia/devkit-core"],
      preserveEntrySignatures: "strict",
      input: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        "example/index": resolve(import.meta.dirname, "src/example/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
    target: "es2022",
  },
});
