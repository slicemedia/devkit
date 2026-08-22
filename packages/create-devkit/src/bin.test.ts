import { EventEmitter } from "node:events";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  followUpCommands,
  installFailureMessage,
  installProjectDependencies,
  parseCliArgs,
  type CommandSpawner,
  type SpawnedCommand,
} from "./bin.js";

describe("create-devkit CLI arguments", () => {
  it("accepts zero or one project directory, including the current directory", () => {
    expect(parseCliArgs([])).toEqual({ help: false });
    expect(parseCliArgs(["webflow-project"])).toEqual({
      help: false,
      targetDirectory: "webflow-project",
    });
    expect(parseCliArgs(["."])).toEqual({ help: false, targetDirectory: "." });
  });

  it("recognizes help and the standard option delimiter", () => {
    expect(parseCliArgs(["--help"])).toEqual({ help: true });
    expect(parseCliArgs(["-h"])).toEqual({ help: true });
    expect(parseCliArgs(["--", "-project"])).toEqual({
      help: false,
      targetDirectory: "-project",
    });
  });

  it("rejects unknown options and multiple project directories", () => {
    expect(() => parseCliArgs(["--package-manager", "npm"])).toThrow(
      "Unknown option: --package-manager",
    );
    expect(() => parseCliArgs(["first", "second"])).toThrow(
      "Expected at most one project directory",
    );
  });
});

describe("create-devkit package-manager commands", () => {
  it.each([
    ["pnpm", ["pnpm install", "pnpm agents:generate", "pnpm dev"]],
    ["npm", ["npm install", "npm run agents:generate", "npm run dev"]],
    ["yarn", ["yarn install", "yarn agents:generate", "yarn dev"]],
  ] as const)("provides %s follow-up commands", (packageManager, expected) => {
    expect(
      followUpCommands(packageManager, {
        includeInstall: true,
        includeAgentGeneration: true,
      }),
    ).toEqual(expected);
  });

  it("omits completed or unneeded follow-up steps", () => {
    expect(
      followUpCommands("npm", {
        includeInstall: false,
        includeAgentGeneration: false,
      }),
    ).toEqual(["npm run dev"]);
  });

  it("spawns the selected package manager without a shell", async () => {
    const child = new EventEmitter();
    const spawnCommand = vi.fn<CommandSpawner>(() => child as unknown as SpawnedCommand);
    const installing = installProjectDependencies("npm", "project", spawnCommand);

    child.emit("close", 0, null);
    await installing;

    expect(spawnCommand).toHaveBeenCalledWith("npm", ["install"], {
      cwd: resolve("project"),
      shell: false,
      stdio: "inherit",
    });
  });

  it("reports unsuccessful installs without implying a scaffold rollback", async () => {
    const child = new EventEmitter();
    const spawnCommand = vi.fn<CommandSpawner>(() => child as unknown as SpawnedCommand);
    const installing = installProjectDependencies("yarn", ".", spawnCommand);

    child.emit("close", 7, null);
    await expect(installing).rejects.toThrow("yarn install failed with exit code 7");

    expect(
      installFailureMessage("yarn", "/projects/example", new Error("registry unavailable")),
    ).toContain(
      'Project was created at /projects/example, but dependency installation failed: registry unavailable\nThe generated files remain in place. Run "yarn install" manually',
    );
  });
});
