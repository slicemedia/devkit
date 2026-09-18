import { fileURLToPath } from "node:url";
import { build } from "vite";

await build({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "es2018",
    sourcemap: false,
    rolldownOptions: { output: { comments: { legal: true, annotation: false, jsdoc: false } } },
    lib: {
      entry: fileURLToPath(new URL("../browser/devtools.ts", import.meta.url)),
      name: "DevKitInspectorBundle",
      formats: ["iife"],
      fileName: () => "devtools.global.js",
    },
  },
});
