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
