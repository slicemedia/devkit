import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSiteBundle } from "./build.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("explicit single-entry builds", () => {
  it("removes development-only DevTools and still supports an explicit inspector IIFE", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const root = await temporaryProject();
    const devtoolsEntry = path.resolve(import.meta.dirname, "../../devtools/src/index.ts");
    const source = (condition: string) =>
      `import { createDevTools } from ${JSON.stringify(devtoolsEntry)};\n` +
      `if (${condition}) createDevTools({ addons: [] }).init();\n` +
      `document.documentElement.dataset.wftReady = "true";\n`;
    await writeFile(path.join(root, "src/main.ts"), source("import.meta.env.DEV"));
    const production = await buildSiteBundle({ root });
    const productionCode = await readFile(production.scriptPath, "utf8");
    expect(productionCode).toContain("wftReady");
    expect(productionCode).not.toContain("data-wft-devtools");
    expect(productionCode).not.toContain("Registered addons");

    await writeFile(path.join(root, "src/main.ts"), source("true"));
    const debug = await buildSiteBundle({ root });
    const debugCode = await readFile(debug.scriptPath, "utf8");
    expect(debugCode).toContain("data-wft-devtools");
    expect(debugCode).toContain("Registered addons");
    expect(debugCode).toContain("Lucide icons");
    expect(debugCode).toContain("Cole Bemis");
    expect(await readdir(path.join(root, "dist"))).toEqual(["project.js"]);
  });

  it("emits one ES2018 IIFE and optional CSS for the selected entry", async () => {
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

  it("keeps maps and original sources outside deployable output, paired with the exact bundle", async () => {
    const root = await temporaryProject();
    const source =
      'const authorOnlyComment = "private-map-test"; document.title = authorOnlyComment;\n';
    await writeFile(path.join(root, "src/main.ts"), source);
    const result = await buildSiteBundle({ root, sourcemap: true });
    expect(await readdir(result.outDir)).toEqual(["project.js"]);
    const script = await readFile(result.scriptPath, "utf8");
    expect(script).not.toContain("sourceMappingURL");
    expect(result.sourceMapPaths).toHaveLength(1);
    const mapPath = result.sourceMapPaths![0]!;
    expect(mapPath).toContain(createHash("sha256").update(script).digest("hex"));
    expect(mapPath.startsWith(path.join(root, ".slicemedia/sourcemaps"))).toBe(true);
    const map = JSON.parse(await readFile(mapPath, "utf8"));
    expect(map.version).toBe(3);
    expect(map.mappings.length).toBeGreaterThan(0);
    expect(map.sourcesContent).toContain(source);
    expect(await readFile(path.join(root, ".slicemedia/sourcemaps/.gitignore"), "utf8")).toBe(
      "*\n",
    );
    const repeat = await buildSiteBundle({ root, sourcemap: true });
    expect(repeat.sourceMapPaths).toEqual(result.sourceMapPaths);
    await buildSiteBundle({ root });
    expect(await readdir(result.outDir)).toEqual(["project.js"]);
  });

  it("refuses maps inside deployable output or redirected private storage", async () => {
    const root = await temporaryProject();
    await writeFile(path.join(root, "src/main.ts"), "document.title = 'test';\n");
    const build = vi.fn();
    await expect(
      buildSiteBundle({ root, outDir: ".slicemedia", sourcemap: true, build }),
    ).rejects.toThrow("separate directories");
    const publicDir = path.join(root, "public");
    await mkdir(publicDir);
    await symlink(
      publicDir,
      path.join(root, ".slicemedia"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(buildSiteBundle({ root, sourcemap: true, build })).rejects.toThrow(
      "symbolic links",
    );
    expect(build).not.toHaveBeenCalled();
  });
});

async function temporaryProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "slicemedia-devkit-build-test-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  return root;
}
