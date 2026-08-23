import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { npmRegistry } from "../scripts/npm-publication-contract.mjs";
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
const prohibitedEnvironment = {
  Npm_Config__AuthToken: "synthetic-secret",
  "Npm_Config_//registry.npmjs.org/:_authToken": "synthetic-scoped-secret",
  Npm_Config_Ignore_Scripts: "true",
  Npm_Config_Node_Gyp: "/example/node-gyp.js",
  Npm_Config_Provenance: "false",
  Npm_Config_Registry: "https://example.test",
  Npm_Config_Tag: "latest",
  Npm_Config_UserConfig: "/tmp/example.npmrc",
  Npm_Config_User_Agent: "pnpm/11.21.0 npm/? node/v24",
  Npm_Id_Token: "synthetic-id-token",
  Npm_Token: "synthetic-npm-token",
  Node_Auth_Token: "synthetic-node-token",
  Sigstore_Id_Token: "synthetic-sigstore-token",
  Yarn_Npm_Auth_Token: "synthetic-yarn-token",
};

async function expectRemoved(path) {
  await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}

function configPaths(arguments_) {
  const userConfig = arguments_[7]?.startsWith("--userconfig=")
    ? arguments_[7].slice(13)
    : undefined;
  const globalConfig = arguments_[8]?.startsWith("--globalconfig=")
    ? arguments_[8].slice(15)
    : undefined;
  if (!userConfig || !globalConfig) throw new Error("Missing isolated npm configuration flags.");
  return { directory: dirname(userConfig), globalConfig, userConfig };
}

function expectExactlyOnePublicationFlag(arguments_, prefix) {
  expect(
    arguments_.filter((argument) => argument === prefix || argument.startsWith(`${prefix}=`)),
  ).toHaveLength(1);
}

describe("npm next publication isolation", () => {
  it("uses distinct empty configs and removes them after an isolated dry executor", async () => {
    const environment = {
      ...prohibitedEnvironment,
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic-oidc-request-token",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.test/oidc",
      PATH: process.env.PATH,
    };
    let paths;
    const executeCommand = vi.fn(async (command, arguments_, options) => {
      expect(command).toBe("npm");
      paths = configPaths(arguments_);
      expect(arguments_).toEqual([
        "publish",
        candidate.archive,
        "--ignore-scripts",
        "--tag=next",
        "--access=public",
        "--provenance",
        `--registry=${npmRegistry}`,
        `--userconfig=${paths.userConfig}`,
        `--globalconfig=${paths.globalConfig}`,
      ]);
      for (const prefix of [
        "--ignore-scripts",
        "--tag",
        "--access",
        "--provenance",
        "--registry",
        "--userconfig",
        "--globalconfig",
      ]) {
        expectExactlyOnePublicationFlag(arguments_, prefix);
      }
      expect(paths.userConfig).not.toBe(paths.globalConfig);
      expect(dirname(paths.globalConfig)).toBe(paths.directory);
      await expect(readFile(paths.userConfig, "utf8")).resolves.toBe("");
      await expect(readFile(paths.globalConfig, "utf8")).resolves.toBe("");
      for (const variable of Object.keys(prohibitedEnvironment)) {
        expect(options.env[variable]).toBeUndefined();
      }
      expect(options.env.PATH).toBe(environment.PATH);
      expect(options.env.ACTIONS_ID_TOKEN_REQUEST_URL).toBe(
        environment.ACTIONS_ID_TOKEN_REQUEST_URL,
      );
      expect(options.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN).toBe(
        environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
      );
      return { stderr: "", stdout: "" };
    });

    await publishCandidate(candidate, { environment, executeCommand });

    expect(executeCommand).toHaveBeenCalledOnce();
    await expectRemoved(paths.userConfig);
    await expectRemoved(paths.globalConfig);
    await expectRemoved(paths.directory);
    expect(environment).toMatchObject(prohibitedEnvironment);
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

  it.each([
    ["a latest tag", (arguments_) => [...arguments_, "--tag=latest"]],
    ["a duplicate ignore-scripts flag", (arguments_) => [...arguments_, "--ignore-scripts"]],
    ["a duplicate tag", (arguments_) => [...arguments_, "--tag=next"]],
    ["a duplicate access flag", (arguments_) => [...arguments_, "--access=public"]],
    ["a duplicate registry", (arguments_) => [...arguments_, `--registry=${npmRegistry}`]],
    ["a duplicate user config", (arguments_) => [...arguments_, arguments_[7]]],
    ["a duplicate global config", (arguments_) => [...arguments_, arguments_[8]]],
    ["a duplicate provenance flag", (arguments_) => [...arguments_, "--provenance"]],
  ])("fails before execution when arguments append %s", async (_label, mutate) => {
    const executeCommand = vi.fn();
    await expect(
      publishCandidate(candidate, {
        createArguments(candidate_, configs) {
          return mutate(createNpmPublishArguments(candidate_, configs));
        },
        executeCommand,
      }),
    ).rejects.toThrow(
      "npm publication arguments must match the reviewed ordered contract exactly.",
    );
    expect(executeCommand).not.toHaveBeenCalled();
  });

  it("removes mixed-case config and token variables while retaining GitHub OIDC", () => {
    const source = {
      ...prohibitedEnvironment,
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic-oidc-request-token",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.test/oidc",
      PATH: "fixture",
    };
    expect(sanitizedEnvironment(source)).toEqual({
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic-oidc-request-token",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.test/oidc",
      PATH: "fixture",
    });
    expect(source).toMatchObject(prohibitedEnvironment);
  });
});
