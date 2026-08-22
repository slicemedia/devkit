import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { isSupportedNodeVersion, runCli } from "./commands.js";
import type { OutputWriter } from "./output.js";
import type { WebflowClient } from "./webflow/client.js";

describe("CLI local and read-only commands", () => {
  it("enforces the Node 22.13 floor while preserving Node 24", () => {
    expect(isSupportedNodeVersion("22.12.9")).toBe(false);
    expect(isSupportedNodeVersion("22.13.0")).toBe(true);
    expect(isSupportedNodeVersion("22.99.0")).toBe(true);
    expect(isSupportedNodeVersion("23.0.0")).toBe(false);
    expect(isSupportedNodeVersion("24.0.0")).toBe(true);
    expect(isSupportedNodeVersion("25.0.0")).toBe(false);
  });

  it("accepts the maintained even-numbered Node release lines", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "slicemedia-devkit-doctor-test-"));
    try {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "package.json"), "{}\n");
      await writeFile(path.join(root, "src/main.ts"), "export {};\n");
      const output: string[] = [];

      expect(
        await runCli(["doctor", "--json"], {
          cwd: root,
          writer: collectingWriter(output),
        }),
      ).toBe(0);
      const result = JSON.parse(output.join("\n")) as {
        ok: boolean;
        data: Array<{ name: string; status: string }>;
      };
      expect(result.ok).toBe(true);
      expect(result.data.find(({ name }) => name === "node")).toMatchObject({ status: "pass" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("includes canonical version and default options in catalog and explain JSON", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "slicemedia-devkit-catalog-test-"));
    try {
      await mkdir(path.join(root, "src", "counter"), { recursive: true });
      await writeFile(path.join(root, "src", "counter", "index.ts"), "export const value = 1;\n");
      await writeFile(
        path.join(root, "src", "index.ts"),
        `export const addonDefinitions = [{
          name: "counter",
          version: "0.4.0",
          description: "Counts neutral values.",
          defaultOptions: { duration: 1.25 }
        }];\n`,
      );

      const catalogOutput: string[] = [];
      expect(
        await runCli(["catalog", "--root", root, "--json"], {
          writer: collectingWriter(catalogOutput),
        }),
      ).toBe(0);
      expect(JSON.parse(catalogOutput.join("\n"))).toMatchObject({
        data: [{ name: "counter", version: "0.4.0", defaultOptions: { duration: 1.25 } }],
      });

      const explainOutput: string[] = [];
      expect(
        await runCli(["explain", "counter", "--root", root, "--json"], {
          writer: collectingWriter(explainOutput),
        }),
      ).toBe(0);
      expect(JSON.parse(explainOutput.join("\n"))).toMatchObject({
        data: { name: "counter", version: "0.4.0", defaultOptions: { duration: 1.25 } },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("builds one local project bundle with JSON output", async () => {
    const projectRoot = path.resolve(path.sep, "project");
    const output: string[] = [];
    const buildBundle = vi.fn().mockResolvedValue({
      entryPath: path.join(projectRoot, "src", "site.ts"),
      outDir: path.join(projectRoot, "public"),
      scriptPath: path.join(projectRoot, "public", "site.js"),
      cssPath: path.join(projectRoot, "public", "site.css"),
    });

    expect(
      await runCli(
        [
          "build",
          "--entry",
          "src/site.ts",
          "--out-dir",
          "public",
          "--script-file",
          "site.js",
          "--css-file",
          "site.css",
          "--json",
        ],
        { cwd: projectRoot, writer: collectingWriter(output), buildBundle },
      ),
    ).toBe(0);

    expect(buildBundle).toHaveBeenCalledWith({
      root: projectRoot,
      entry: "src/site.ts",
      outDir: "public",
      scriptFileName: "site.js",
      cssFileName: "site.css",
    });
    expect(JSON.parse(output.join("\n"))).toMatchObject({
      ok: true,
      command: "build",
      data: {
        scriptPath: path.join(projectRoot, "public", "site.js"),
        cssPath: path.join(projectRoot, "public", "site.css"),
      },
    });
  });

  it("supports read-only component inspection", async () => {
    const listComponents = vi.fn().mockResolvedValue([{ id: "component-one" }]);
    const output: string[] = [];
    const exitCode = await runCli(["webflow", "components", "--site", "site-one", "--json"], {
      writer: collectingWriter(output),
      createClient: () => ({ listComponents }) as unknown as WebflowClient,
    });

    expect(exitCode).toBe(0);
    expect(listComponents).toHaveBeenCalledWith("site-one");
    expect(JSON.parse(output.join("\n"))).toMatchObject({
      data: [{ id: "component-one" }],
    });
  });

  it("does not expose Webflow script or publish commands", async () => {
    for (const removed of ["script", "publish"]) {
      const errors: string[] = [];
      expect(
        await runCli(["webflow", removed, "--site", "site-one"], {
          writer: collectingWriter([], errors),
        }),
      ).toBe(1);
      expect(errors.join("\n")).toContain("components|scan");
    }

    const output: string[] = [];
    expect(await runCli(["help", "--json"], { writer: collectingWriter(output) })).toBe(0);
    const help = JSON.stringify(JSON.parse(output.join("\n")));
    expect(help).not.toContain("cdn-origin");
    expect(help).not.toContain("webflow script");
    expect(help).not.toContain("webflow publish");
  });
});

function collectingWriter(info: string[], errors: string[] = []): OutputWriter {
  return {
    info: (message) => info.push(message),
    error: (message) => errors.push(message),
  };
}
