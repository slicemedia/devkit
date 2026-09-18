import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "./commands.js";
import { discoverAddonEntries } from "./discovery.js";
import { documentEntry } from "./documentation.js";
import { buildScripts } from "./scripts-build.js";
import type { DevKitRuntime } from "../../core/dist/runtime.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  delete window.slicemediaDevKit;
  await Promise.all(
    temporaryDirectories.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "devkit-standalone-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "src/addons"), { recursive: true });
  return root;
}

function browserEntry(name: string): string {
  const core = path.resolve(import.meta.dirname, "../../core/src/index.ts");
  return `import { installDevKitRuntime, createAddon, defineAddon } from ${JSON.stringify(core)};
const installation = installDevKitRuntime({ version: "0.1.0" });
if (installation.status === "conflict") throw new Error("Runtime version conflict");
const { runtime } = installation;
runtime.queue.push(async () => {
  if (runtime.getAddon(${JSON.stringify(name)})) return;
  let initializations = 0;
  const addon = createAddon(defineAddon({ name: ${JSON.stringify(name)}, version: "0.1.0",
    description: "Standalone test", defaultOptions: {}, entry: ${JSON.stringify(name)},
    setup() { return { init() { initializations++; }, getState() { return { initializations }; } }; }
  }));
  await addon.init();
  runtime.registerAddon({ name: ${JSON.stringify(name)}, version: "0.1.0", value: addon });
});`;
}

describe("standalone public builds", () => {
  it("loads one shared vendor and stylesheet across independently built addon IIFEs", async () => {
    const root = await project();
    const core = path.resolve(import.meta.dirname, "../../core/src/index.ts");
    await mkdir(path.join(root, "src/vendors"));
    await mkdir(path.join(root, "src/integrations"));
    await writeFile(
      path.join(root, "src/integrations/shared.ts"),
      `import { loadSharedModule, resolveVendorAsset } from ${JSON.stringify(core)};
const moduleUrl = import.meta.url;
export const load = () => loadSharedModule({ url: resolveVendorAsset("shared.js", moduleUrl), styles: [{url: resolveVendorAsset("shared.css", moduleUrl)}] });`,
    );
    for (const name of ["alpha", "beta"]) {
      await writeFile(
        path.join(root, `src/addons/${name}.ts`),
        `import { load } from "../integrations/shared"; window.load${name} = load;`,
      );
    }
    await writeFile(
      path.join(root, "src/vendors/shared.ts"),
      `import { registerSharedModule } from ${JSON.stringify(core)};
import "./shared.css";
window.vendorExecutions = (window.vendorExecutions || 0) + 1;
registerSharedModule({ marker: "vendor-payload-only-once" });`,
    );
    await writeFile(path.join(root, "src/vendors/shared.css"), "[data-wft-shared]{color:red}");
    await writeFile(
      path.join(root, "devkit.config.json"),
      JSON.stringify({ vendors: [{ name: "shared", input: "src/vendors/shared.ts" }] }),
    );
    const result = await buildScripts({ root, sourcemap: true });
    expect(result.vendors).toEqual([
      expect.objectContaining({ scriptFile: "vendor/shared.js", cssFile: "vendor/shared.css" }),
    ]);
    const run = (code: string, src: string) => {
      const script = document.createElement("script");
      script.src = src;
      Object.defineProperty(document, "currentScript", { configurable: true, value: script });
      try {
        runInNewContext(code, { window, document, URL, setTimeout, clearTimeout });
      } finally {
        Reflect.deleteProperty(document, "currentScript");
      }
    };
    document.head.replaceChildren();
    document.body.replaceChildren();
    for (const entry of result.entries) {
      const code = await readFile(entry.scriptPath, "utf8");
      expect(code).not.toContain("vendor-payload-only-once");
      run(code, `https://assets.example.com/shared-test/${entry.scriptFile}`);
    }
    expect(document.querySelectorAll("script,link")).toHaveLength(0);
    const first = (Reflect.get(window, "loadalpha") as () => Promise<unknown>)();
    const second = (Reflect.get(window, "loadbeta") as () => Promise<unknown>)();
    const scripts = document.querySelectorAll<HTMLScriptElement>("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.src).toBe("https://assets.example.com/shared-test/vendor/shared.js");
    expect(document.querySelectorAll("link")).toHaveLength(1);
    run(await readFile(result.vendors[0]!.scriptPath, "utf8"), scripts[0]!.src);
    scripts[0]!.dispatchEvent(new Event("load"));
    let settled = false;
    void first.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    document.querySelector("link")!.dispatchEvent(new Event("load"));
    expect(await first).toBe(await second);
    expect(Reflect.get(window, "vendorExecutions")).toBe(1);
    for (const name of ["loadalpha", "loadbeta", "vendorExecutions"])
      Reflect.deleteProperty(window, name);
    document.head.replaceChildren();
    document.body.replaceChildren();
  });

  it("keeps catalog CSS and vendor paths consistent with actual build outputs", async () => {
    const root = await project();
    await writeFile(path.join(root, "src/addons/plain.ts"), "document.title = 'plain';");
    await writeFile(
      path.join(root, "src/addons/styled.ts"),
      'import "../theme.css"; document.title = "styled";',
    );
    await writeFile(path.join(root, "src/theme.css"), "body{color:red}");
    await mkdir(path.join(root, "src/vendors"));
    await writeFile(path.join(root, "src/vendors/shared.ts"), 'document.title = "vendor";');
    await writeFile(
      path.join(root, "devkit.config.json"),
      JSON.stringify({ vendors: [{ name: "shared", input: "src/vendors/shared.ts" }] }),
    );
    const result = await buildScripts({ root });
    const output: string[] = [];
    expect(
      await runCli(
        [
          "catalog",
          "--manifest",
          "dist/webflow-scripts.json",
          "--public-base-url",
          "https://assets.example.com/",
          "--json",
        ],
        {
          cwd: root,
          writer: { info: (text) => output.push(text), error: (text) => output.push(text) },
        },
      ),
    ).toBe(0);
    const documented = JSON.parse(output[0]!).data;
    expect(
      documented.find((entry: { name: string }) => entry.name === "plain").snippets.stylesheet,
    ).toBeUndefined();
    expect(
      documented.find((entry: { name: string }) => entry.name === "styled").snippets.stylesheet,
    ).toContain("addons/styled.css");
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
    expect(
      manifest.entries.find((entry: { name: string }) => entry.name === "plain").bundle.cssFile,
    ).toBeUndefined();
    expect(manifest.vendors[0].bundle.scriptFile).toBe("vendor/shared.js");
  });

  it("builds separate self-contained addons, per-entry CSS, private maps and exact script tags", async () => {
    const root = await project();
    await writeFile(path.join(root, "src/addons/alpha.ts"), browserEntry("alpha"));
    await mkdir(path.join(root, "src/addons/beta"));
    await writeFile(
      path.join(root, "src/addons/beta/index.ts"),
      `import "./style.css";\n${browserEntry("beta")}`,
    );
    await writeFile(
      path.join(root, "src/addons/beta/style.css"),
      "[data-wft-beta] { color: green; }",
    );
    await writeFile(path.join(root, "src/addons/_helper.ts"), 'throw new Error("not an entry");');
    await writeFile(
      path.join(root, "src/addons/alpha.test.ts"),
      'throw new Error("not an entry");',
    );
    await writeFile(
      path.join(root, "src/main.ts"),
      'document.documentElement.dataset.wftProject = "true";',
    );
    await writeFile(
      path.join(root, "devkit.config.json"),
      JSON.stringify({
        entries: [
          { name: "project", kind: "project", input: "src/main.ts" },
          { name: "alpha", input: "src/addons/alpha.ts", description: "Configured alpha" },
        ],
      }),
    );
    const discovered = await discoverAddonEntries(root);
    expect(discovered.map(({ name }) => name)).toEqual(["project", "alpha", "beta"]);
    const documented = documentEntry(discovered[1]!, {
      publicBaseUrl: "https://assets.example.com/site",
    });
    expect(documented.snippets.development).toContain("/src/addons/alpha.ts");
    expect(documented.snippets.production).toContain("/site/addons/alpha.js");

    const result = await buildScripts({ root, sourcemap: true });
    expect((await readdir(path.join(root, "dist/addons"))).sort()).toEqual([
      "alpha.js",
      "beta.css",
      "beta.js",
    ]);
    expect(await readdir(path.join(root, "dist/projects"))).toEqual(["project.js"]);
    expect(result.entries.map(({ name }) => name)).toEqual(["project", "alpha", "beta"]);
    expect(result.entries[1]?.cssFile).toBeUndefined();
    expect(result.entries[2]?.cssFile).toBe("addons/beta.css");
    for (const entry of result.entries) {
      expect(entry.sourceMapPaths).toHaveLength(1);
      expect(entry.sourceMapPaths![0]).toContain(path.join(root, ".slicemedia/sourcemaps"));
      expect(await readFile(entry.scriptPath, "utf8")).not.toContain("sourceMappingURL");
    }
    const manifest = await readFile(result.manifestPath, "utf8");
    expect(manifest).not.toContain("sourcemaps");
    expect(JSON.parse(manifest).entries).toContainEqual(
      expect.objectContaining({
        name: "beta",
        bundle: expect.objectContaining({
          scriptFile: "addons/beta.js",
          cssFile: "addons/beta.css",
        }),
      }),
    );

    const alpha = await readFile(path.join(root, "dist/addons/alpha.js"), "utf8");
    const beta = await readFile(path.join(root, "dist/addons/beta.js"), "utf8");
    const run = (code: string) => runInNewContext(code, { window, document, AbortController });
    // Either addon runs alone, with no project script or shared runtime file.
    for (const [name, code] of [
      ["alpha", alpha],
      ["beta", beta],
    ] as const) {
      delete window.slicemediaDevKit;
      run(code);
      const runtime = Reflect.get(window, "slicemediaDevKit") as DevKitRuntime;
      await runtime.ready;
      expect(runtime.addons.map((entry) => entry.name)).toEqual([name]);
      expect(runtime[name]).toBe(runtime.getAddon(name)?.value);
    }
    // Both scripts and a repeated script share one registry and one addon instance per name.
    const runtime = window.slicemediaDevKit as DevKitRuntime;
    const ready = new Promise((resolve) => runtime.whenReady("alpha", resolve));
    run(alpha);
    await runtime.ready;
    expect(await ready).toBe(runtime.alpha);
    run(beta);
    run(alpha);
    await runtime.ready;
    expect(window.slicemediaDevKit).toBe(runtime);
    for (const name of ["alpha", "beta"]) {
      const api = runtime.getAddon<{ getState(): { initializations: number } }>(name)!.value;
      expect(api.getState().initializations).toBe(1);
    }
    // A new build removes obsolete outputs once, without erasing the other addon.
    await writeFile(path.join(root, "dist/addons/obsolete.js"), "stale");
    await buildScripts({ root });
    expect((await readdir(path.join(root, "dist/addons"))).sort()).toEqual([
      "alpha.js",
      "beta.css",
      "beta.js",
    ]);
  });

  it("rejects duplicate outputs and source-overlapping destinations before clearing anything", async () => {
    const root = await project();
    await writeFile(path.join(root, "src/addons/alpha.ts"), "document.title = 'alpha';");
    await writeFile(path.join(root, "src/addons/beta.ts"), "document.title = 'beta';");
    await mkdir(path.join(root, "dist"));
    await writeFile(path.join(root, "dist/keep.txt"), "existing output");
    await writeFile(
      path.join(root, "devkit.config.json"),
      JSON.stringify({
        entries: ["alpha", "beta"].map((name) => ({
          name,
          input: `src/addons/${name}.ts`,
          bundle: { input: `src/addons/${name}.ts`, scriptFile: "same.js" },
        })),
      }),
    );
    await expect(buildScripts({ root })).rejects.toThrow("Duplicate build output");
    expect(await readFile(path.join(root, "dist/keep.txt"), "utf8")).toBe("existing output");
    await rm(path.join(root, "devkit.config.json"));
    await expect(buildScripts({ root, outDir: "src" })).rejects.toThrow(
      "separate from project source",
    );
    expect(await readFile(path.join(root, "src/addons/alpha.ts"), "utf8")).toContain("alpha");
  });

  it("uses standalone discovery in the default CLI build and writes an empty manifest without dummy addons", async () => {
    const root = await project();
    const output: string[] = [];
    const writer = {
      info: (line: string) => output.push(line),
      error: (line: string) => output.push(line),
    };
    expect(await runCli(["build", "--json"], { cwd: root, writer })).toBe(0);
    expect(JSON.parse(output.pop()!).data.entries).toEqual([]);
    await writeFile(path.join(root, "src/addons/alpha.ts"), "document.title = 'alpha';");
    expect(await runCli(["build", "--json"], { cwd: root, writer })).toBe(0);
    expect(JSON.parse(output.pop()!).data.entries).toEqual([
      expect.objectContaining({ name: "alpha", scriptFile: "addons/alpha.js" }),
    ]);
    expect(
      await runCli(["build", "--script-file", "all.js", "--json"], { cwd: root, writer }),
    ).toBe(1);
    expect(JSON.parse(output.pop()!).summary).toContain("require an explicit --entry");
  });
});
