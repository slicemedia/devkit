import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CORE_VERSION } from "../packages/core/src/version.js";
import {
  DEFAULT_DEVKIT_VERSION_RANGE,
  DEVKIT_PACKAGE_VERSION,
  EXTERNAL_PRODUCT_VERSION_RANGES,
} from "../packages/create-devkit/src/versions.generated.js";

const workspaceRoot = resolve(import.meta.dirname, "..");
const packageDirectories = [
  "packages/devkit",
  "packages/core",
  "packages/addon",
  "packages/cli",
  "packages/create-devkit",
];

async function json(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(workspaceRoot, relativePath), "utf8")) as Record<
    string,
    unknown
  >;
}

describe("release version consistency", () => {
  it("keeps the fixed package group, runtime, and creator default on one version", async () => {
    const manifests = await Promise.all(
      packageDirectories.map((directory) => json(`${directory}/package.json`)),
    );
    const versions = [...new Set(manifests.map(({ version }) => version))];

    expect(versions).toEqual([DEVKIT_PACKAGE_VERSION]);
    expect(CORE_VERSION).toBe(DEVKIT_PACKAGE_VERSION);
    expect(DEFAULT_DEVKIT_VERSION_RANGE).toBe(`^${DEVKIT_PACKAGE_VERSION}`);
  });

  it("publishes complete metadata and supports only active even-numbered Node lines", async () => {
    const manifests = await Promise.all(
      packageDirectories.map((directory) => json(`${directory}/package.json`)),
    );
    for (const manifest of manifests) {
      expect(manifest.engines).toEqual({
        node: ">=22.13.0 <23 || >=24.0.0 <25",
      });
      expect(manifest.homepage).toMatch(/^https:\/\/github\.com\/slicemedia\/devkit/u);
      expect(manifest.bugs).toEqual({
        url: "https://github.com/slicemedia/devkit/issues",
      });
    }
    const workspace = await json("package.json");
    const starter = await json("templates/starter/package.json");
    expect(workspace.engines).toEqual({
      node: ">=22.13.0 <23 || >=24.0.0 <25",
      pnpm: ">=11.21.0 <12",
    });
    expect(starter.engines).toEqual({
      node: ">=22.13.0 <23 || >=24.0.0 <25",
    });
  });

  it("keeps independent product ranges in the compatibility configuration", async () => {
    const configuration = (await json("config/external-products.json")) as {
      products: Record<string, { packageName: string; range: string }>;
    };

    expect(configuration.products.agentKit).toEqual({
      packageName: "@slicemedia/agent-kit",
      range: EXTERNAL_PRODUCT_VERSION_RANGES.agentKit,
    });
    expect(configuration.products.swiperAdapter).toEqual({
      packageName: "@slicemedia/swiper-adapter",
      range: EXTERNAL_PRODUCT_VERSION_RANGES.swiperAdapter,
    });
    expect(configuration.products.spacesDeployer).toEqual({
      packageName: "@slicemedia/spaces-deployer",
      range: EXTERNAL_PRODUCT_VERSION_RANGES.spacesDeployer,
    });
  });
});
