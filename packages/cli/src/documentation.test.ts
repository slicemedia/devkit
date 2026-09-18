import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "./commands.js";
import { documentEntry, renderCatalog, renderSetupGuide } from "./documentation.js";
import type { AddonEntry } from "./types.js";

const entry: AddonEntry = {
  name: "counter",
  input: "src/counter.ts",
  description: "Animate an authored number.",
  placement: "head",
  dependencies: ["@slicemedia/devkit-core"],
  attributes: ["data-wft-counter"],
  attributeDetails: [
    {
      name: "data-wft-counter",
      description: "The number to animate.",
      type: "number",
      required: true,
    },
  ],
  scriptAttributes: { "data-wft-test": 'a"b&c' },
  defaultOptions: { duration: 1200 },
  api: {
    lifecycle: ["init", "destroy"],
    options: [{ name: "duration", type: "number", description: "Milliseconds." }],
  },
  usage: {
    setup: ["Add a text element in Webflow."],
    markup: '<span data-wft-counter="25">25</span>',
  },
  bundle: { input: "src/main.ts", scriptFile: "project.js", cssFile: "project.css" },
};

describe("Webflow documentation", () => {
  it("generates the full contract and the explicitly configured entry's local, production and stylesheet tags", () => {
    const documented = documentEntry(entry, {
      publicBaseUrl: "https://assets.example.com/project/assets",
    });
    const guide = renderSetupGuide(documented);
    expect(guide).toContain("The number to animate.");
    expect(guide).toContain("Milliseconds.");
    expect(guide).toContain('"duration": 1200');
    expect(guide).toContain(entry.usage!.markup);
    expect(documented.snippets.development).toContain("/@vite/client");
    expect(documented.snippets.development).toContain("/src/main.ts");
    expect(documented.snippets.development).not.toContain("/src/counter.ts");
    expect(documented.snippets.production).toContain(
      '<script defer src="https://assets.example.com/project/assets/project.js"',
    );
    expect(documented.snippets.production).toContain("a&quot;b&amp;c");
    expect(documented.snippets.stylesheet).toContain("project/assets/project.css");
    expect(renderCatalog([documented])).toContain("## counter\n");
    expect(renderCatalog([documented])).toContain("### Webflow setup\n");
  });

  it("does not invent a deployment URL or a standalone addon script", () => {
    const addon = { ...entry };
    delete addon.bundle;
    expect(documentEntry(addon).snippets).toEqual({});
    expect(documentEntry(entry).snippets.production).toBeUndefined();
    expect(documentEntry(entry, { hmr: false }).snippets.development).not.toContain("@vite/client");
    expect(() => documentEntry(entry, { publicBaseUrl: "javascript:alert(1)" })).toThrow("HTTP(S)");
    expect(() =>
      documentEntry({ ...entry, bundle: { input: "../private.ts", scriptFile: "site.js" } }),
    ).toThrow("relative asset paths");
  });

  it("prints explain details and exports Markdown and a JSON manifest from explicitly selected metadata", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "devkit-documentation-"));
    try {
      await mkdir(path.join(root, "src"));
      // Discovery must not execute the browser composition entry.
      await writeFile(path.join(root, "src/main.ts"), 'throw new Error("browser entry executed");');
      await writeFile(
        path.join(root, "src/metadata.ts"),
        `export const definition = ${JSON.stringify({ ...entry, attributes: entry.attributeDetails, options: entry.api.options })};`,
      );
      await writeFile(
        path.join(root, "devkit.config.json"),
        JSON.stringify({
          entries: [
            {
              name: "counter",
              input: "src/main.ts",
              bundle: entry.bundle,
              definition: { module: "src/metadata.ts", export: "definition" },
            },
          ],
        }),
      );
      const lines: string[] = [];
      const writer = {
        info: (line: string) => lines.push(line),
        error: (line: string) => lines.push(line),
      };
      expect(await runCli(["explain", "counter"], { cwd: root, writer })).toBe(0);
      expect(lines.join("\n")).toContain("The number to animate.");
      expect(lines.join("\n")).toContain("Milliseconds.");
      lines.length = 0;
      expect(
        await runCli(
          [
            "catalog",
            "--out",
            "docs/addons.md",
            "--manifest",
            "dist/webflow-scripts.json",
            "--public-base-url",
            "https://assets.example.com",
            "--json",
          ],
          { cwd: root, writer },
        ),
      ).toBe(0);
      const json = JSON.parse(lines.join("\n"));
      expect(json.text).toBeUndefined();
      expect(json.data[0].attributeDetails[0].required).toBe(true);
      expect(await readFile(path.join(root, "docs/addons.md"), "utf8")).toContain("src/main.ts");
      expect(
        JSON.parse(await readFile(path.join(root, "dist/webflow-scripts.json"), "utf8")),
      ).toMatchObject({
        schemaVersion: 1,
        entries: [
          { name: "counter", snippets: { production: expect.stringContaining("project.js") } },
        ],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
