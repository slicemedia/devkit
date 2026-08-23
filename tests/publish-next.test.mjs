import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  npmRegistry,
  prohibitedPublicationVariables,
} from "../scripts/npm-publication-contract.mjs";
import {
  createNpmPublishArguments,
  publishCandidate,
  sanitizedEnvironment,
} from "../scripts/publish-next.mjs";

const candidate = {
  archive: resolve("synthetic-devkit-core.tgz"),
  name: "@slicemedia/devkit-core",
  version: "0.1.0",
};

async function expectRemoved(path) {
  await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}

function configPaths(arguments_) {
  const userConfig = arguments_.find((argument) => argument.startsWith("--userconfig="))?.slice(13);
  const globalConfig = arguments_
    .find((argument) => argument.startsWith("--globalconfig="))
    ?.slice(15);
  if (!userConfig || !globalConfig) throw new Error("Missing isolated npm configuration flags.");
  return { directory: dirname(userConfig), globalConfig, userConfig };
}

describe("npm next publication isolation", () => {
  it("uses distinct empty configs and removes them after an isolated dry executor", async () => {
    const environment = Object.fromEntries(
      prohibitedPublicationVariables.map((variable) => [variable, "synthetic-secret"]),
    );
    environment.PATH = process.env.PATH;
    let paths;
    const executeCommand = vi.fn(async (command, arguments_, options) => {
      expect(command).toBe("npm");
      expect(arguments_).toEqual(
        expect.arrayContaining([
          "publish",
          candidate.archive,
          "--ignore-scripts",
          "--tag=next",
          "--access=public",
          "--provenance",
          `--registry=${npmRegistry}`,
        ]),
      );
      expect(arguments_).not.toContain("--userconfig=/dev/null");
      expect(arguments_).not.toContain("--globalconfig=/dev/null");
      paths = configPaths(arguments_);
      expect(paths.userConfig).not.toBe(paths.globalConfig);
      expect(dirname(paths.globalConfig)).toBe(paths.directory);
      await expect(readFile(paths.userConfig, "utf8")).resolves.toBe("");
      await expect(readFile(paths.globalConfig, "utf8")).resolves.toBe("");
      for (const variable of prohibitedPublicationVariables) {
        expect(options.env[variable]).toBeUndefined();
      }
      expect(options.env.PATH).toBe(environment.PATH);
      return { stderr: "", stdout: "" };
    });

    await publishCandidate(candidate, { environment, executeCommand });

    expect(executeCommand).toHaveBeenCalledOnce();
    await expectRemoved(paths.userConfig);
    await expectRemoved(paths.globalConfig);
    await expectRemoved(paths.directory);
    for (const variable of prohibitedPublicationVariables) {
      expect(environment[variable]).toBe("synthetic-secret");
    }
  });

  it("removes both configs and fails closed when the isolated executor rejects", async () => {
    let paths;
    const executeCommand = vi.fn(async (_command, arguments_) => {
      paths = configPaths(arguments_);
      throw new Error("synthetic executor failure");
    });

    await expect(publishCandidate(candidate, { executeCommand })).rejects.toThrow(
      "synthetic executor failure",
    );
    expect(executeCommand).toHaveBeenCalledOnce();
    await expectRemoved(paths.userConfig);
    await expectRemoved(paths.globalConfig);
    await expectRemoved(paths.directory);
  });

  it("rejects duplicate, aliased, or non-absolute configuration paths", () => {
    const userConfig = resolve("synthetic-user.npmrc");
    expect(() =>
      createNpmPublishArguments(candidate, { globalConfig: userConfig, userConfig }),
    ).toThrow("npm user and global configuration must use distinct files.");
    expect(() =>
      createNpmPublishArguments(candidate, {
        globalConfig: join(dirname(userConfig), "nested", "..", "synthetic-user.npmrc"),
        userConfig,
      }),
    ).toThrow("npm user and global configuration must use distinct files.");
    expect(() =>
      createNpmPublishArguments(candidate, {
        globalConfig: resolve("synthetic-global.npmrc"),
        userConfig: "relative-user.npmrc",
      }),
    ).toThrow("npm publication configuration paths must be absolute.");
  });

  it("returns a sanitized copy without changing the source environment", () => {
    const source = { NODE_AUTH_TOKEN: "synthetic", PATH: "fixture" };
    expect(sanitizedEnvironment(source)).toEqual({ PATH: "fixture" });
    expect(source).toEqual({ NODE_AUTH_TOKEN: "synthetic", PATH: "fixture" });
  });
});
