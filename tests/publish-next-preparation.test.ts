import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "..");
const guard = resolve(workspaceRoot, "scripts/assert-npm-publication-artifact.mjs");
const packageDirectories = ["devkit", "core", "addon", "cli", "create-devkit"];

describe("npm next publication preparation", () => {
  it("marks only the five release packages public", async () => {
    for (const directory of packageDirectories) {
      const manifest = JSON.parse(
        await readFile(resolve(workspaceRoot, `packages/${directory}/package.json`), "utf8"),
      ) as { private?: boolean };
      expect(manifest.private).toBe(false);
    }

    const workspace = JSON.parse(
      await readFile(resolve(workspaceRoot, "package.json"), "utf8"),
    ) as { private?: boolean };
    const starter = JSON.parse(
      await readFile(resolve(workspaceRoot, "templates/starter/package.json"), "utf8"),
    ) as { private?: boolean };
    expect(workspace.private).toBe(true);
    expect(starter.private).toBe(true);
  });

  it("fails closed before public/OIDC activation", () => {
    const environment = { ...process.env };
    delete environment.NODE_AUTH_TOKEN;
    delete environment.NPM_TOKEN;
    delete environment.NPM_CONFIG_TOKEN;
    delete environment.NPM_CONFIG_REGISTRY;
    delete environment.NPM_CONFIG_USERCONFIG;
    const result = spawnSync(process.execPath, [guard], {
      cwd: workspaceRoot,
      encoding: "utf8",
      env: {
        ...environment,
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_REF: "refs/heads/main",
        GITHUB_REPOSITORY: "slicemedia/devkit",
        GITHUB_REPOSITORY_VISIBILITY: "private",
        GITHUB_SHA: "1".repeat(40),
        SLICEMEDIA_NPM_PUBLISH_NEXT_ENABLED: "false",
        SLICEMEDIA_RELEASE_COMMIT: "1".repeat(40),
        SLICEMEDIA_RELEASE_ENVIRONMENT: "other",
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("requires an explicitly public repository");
    expect(result.stderr).toContain("SLICEMEDIA_NPM_PUBLISH_NEXT_ENABLED=true");
    expect(result.stderr).toContain("requires GitHub Actions OIDC");
  });
});
