import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverAddonEntries } from "./discovery.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("addon discovery", () => {
  it("discovers marked entries at every depth and preserves their paths without publishing helpers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devkit-nested-entries-"));
    temporaryDirectories.push(root);
    const sources = [
      "addons/legacy.ts",
      "addons/old-folder/index.js",
      "addons/flat.entry.ts",
      "addons/animations/counter.entry.ts",
      "addons/animations/headlines/reveal.entry.js",
      "addons/sliders/gallery/index.entry.ts",
      "projects/pages/landing.entry.mjs",
      "entries/forms/contact.entry.tsx",
      "addons/animations/options.ts",
      "addons/animations/counter/helpers/index.ts",
      "addons/_private/hidden.entry.ts",
      "addons/animations/.draft.entry.ts",
      "addons/animations/_helper.entry.ts",
      "addons/animations/counter.test.entry.ts",
      "addons/animations/counter.entry.spec.ts",
      "addons/animations/counter.entry.d.ts",
    ];
    for (const source of sources) {
      const file = path.join(root, "src", source);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, 'throw new Error("Discovery must not execute browser entries");');
    }
    await writeFile(
      path.join(root, "src/addons/sliders/gallery/addon.json"),
      JSON.stringify({ description: "Gallery metadata" }),
    );
    const entries = await discoverAddonEntries(root);
    expect(entries.map(({ name, bundle }) => [name, bundle?.scriptFile])).toEqual([
      ["counter", "addons/animations/counter.js"],
      ["reveal", "addons/animations/headlines/reveal.js"],
      ["flat", "addons/flat.js"],
      ["legacy", "addons/legacy.js"],
      ["old-folder", "addons/old-folder.js"],
      ["gallery", "addons/sliders/gallery/index.js"],
      ["contact", "addons/forms/contact.js"],
      ["landing", "projects/pages/landing.js"],
    ]);
    expect(entries.find(({ name }) => name === "gallery")?.description).toBe("Gallery metadata");
  });

  it("requires unique public names across folders and supports configured names without flattening paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devkit-entry-names-"));
    temporaryDirectories.push(root);
    for (const category of ["animation", "navigation"]) {
      await mkdir(path.join(root, "src/addons", category), { recursive: true });
      await writeFile(path.join(root, "src/addons", category, "menu.entry.ts"), "void 0;");
    }
    await expect(discoverAddonEntries(root)).rejects.toThrow("Duplicate public entry name: menu");
    await writeFile(
      path.join(root, "devkit.config.json"),
      JSON.stringify({
        entries: [{ name: "animated-menu", input: "src/addons/animation/menu.entry.ts" }],
      }),
    );
    expect(
      (await discoverAddonEntries(root)).map(({ name, bundle }) => [name, bundle?.scriptFile]),
    ).toEqual([
      ["animated-menu", "addons/animation/menu.js"],
      ["menu", "addons/navigation/menu.js"],
    ]);
  });

  it("retains existing names, sidecars and output URLs for top-level marked entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devkit-legacy-markers-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src/addons"), { recursive: true });
    for (const name of ["myCounter", "index", "oldName"]) {
      await writeFile(path.join(root, `src/addons/${name}.entry.ts`), "void 0;");
    }
    await writeFile(
      path.join(root, "src/addons/index.addon.json"),
      JSON.stringify({ description: "Index metadata" }),
    );
    await writeFile(
      path.join(root, "devkit.config.json"),
      JSON.stringify({
        entries: [{ name: "configured-name", input: "src/addons/oldName.entry.ts" }],
      }),
    );
    const entries = await discoverAddonEntries(root);
    expect(entries.map(({ name, bundle }) => [name, bundle?.scriptFile])).toEqual([
      ["configured-name", "addons/configured-name.js"],
      ["index", "addons/index.js"],
      ["my-counter", "addons/my-counter.js"],
    ]);
    expect(entries.find(({ name }) => name === "index")?.description).toBe("Index metadata");
  });

  it("discovers first-level addon entries and consumes their exported metadata catalog", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "slicemedia-devkit-discovery-test-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src", "counter"), { recursive: true });
    await writeFile(path.join(root, "src", "counter", "index.ts"), "export const value = 1;\n");
    await writeFile(
      path.join(root, "src", "index.ts"),
      `
export const addonDefinitions = [{
  name: "counter",
  version: "0.1.0",
  description: "Demonstrates the addon lifecycle.",
  placement: "head",
  entry: "@slicemedia/devkit-addon/example",
  attributes: [{ name: "data-wft-example" }],
  dependencies: [{ name: "@slicemedia/devkit-core" }],
  lifecycle: ["init", "destroy"],
  options: [{ name: "duration", type: "number" }],
  defaultOptions: { duration: 1.5 }
}];
`,
    );

    await expect(discoverAddonEntries(root)).resolves.toEqual([
      expect.objectContaining({
        name: "counter",
        version: "0.1.0",
        description: "Demonstrates the addon lifecycle.",
        placement: "head",
        attributes: ["data-wft-example"],
        dependencies: ["@slicemedia/devkit-core"],
        defaultOptions: { duration: 1.5 },
        api: expect.objectContaining({
          entry: "@slicemedia/devkit-addon/example",
          lifecycle: ["init", "destroy"],
        }),
      }),
    ]);
  });
});
