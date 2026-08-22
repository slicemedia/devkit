import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSiteBundle } from "./build.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("site bundle builds", () => {
  it("emits only one ES2018 IIFE and optional CSS", async () => {
    const root = await temporaryProject();
    await writeFile(
      path.join(root, "src/main.ts"),
      'import "./styles.css";\ndocument.documentElement.dataset.wftReady = "true";\n',
    );
    await writeFile(path.join(root, "src/styles.css"), "[data-wft-ready] { color: green; }\n");

    const result = await buildSiteBundle({ root });

    expect(result.scriptPath).toBe(path.join(root, "dist/project.js"));
    expect(result.cssPath).toBe(path.join(root, "dist/project.css"));
    expect(await readFile(result.scriptPath, "utf8")).toContain("wftReady");
    expect(await readFile(result.cssPath!, "utf8")).toContain("data-wft-ready");
    expect((await readdir(path.join(root, "dist"))).sort()).toEqual(["project.css", "project.js"]);
  });

  it("passes a single IIFE configuration to Vite and omits CSS when none is emitted", async () => {
    const root = await temporaryProject();
    await writeFile(path.join(root, "src/main.ts"), "document.body.hidden = false;\n");
    const build = vi.fn(async (config) => {
      const output = config.build?.rollupOptions?.output;
      if (Array.isArray(output) || output === undefined || typeof output === "string") {
        throw new Error("Unexpected output config.");
      }
      const outDir = config.build?.outDir;
      if (outDir === undefined) throw new Error("Missing output directory.");
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, String(output.entryFileNames)), "(() => {})();\n");
    });

    const result = await buildSiteBundle({
      root,
      entry: "src/main.ts",
      outDir: "build",
      scriptFileName: "site.js",
      cssFileName: "site.css",
      build,
    });

    expect(build).toHaveBeenCalledOnce();
    const config = build.mock.calls[0]?.[0];
    expect(config?.build).toMatchObject({
      target: "es2018",
      cssCodeSplit: false,
      sourcemap: false,
    });
    expect(config?.build?.rollupOptions?.output).toMatchObject({ format: "iife" });
    expect(result.cssPath).toBeUndefined();
  });

  it("rejects missing entries and output path traversal", async () => {
    const root = await temporaryProject();
    await expect(buildSiteBundle({ root })).rejects.toThrow("Project entry does not exist");
    await writeFile(path.join(root, "src/main.ts"), "void 0;\n");
    await expect(
      buildSiteBundle({ root, scriptFileName: "../outside.js", build: vi.fn() }),
    ).rejects.toThrow("plain .js file name");
  });
});

async function temporaryProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "slicemedia-devkit-build-test-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  return root;
}
