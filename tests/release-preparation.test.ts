import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "../scripts/assert-release-preparation-safe.mjs");

function runGuard(overrides: NodeJS.ProcessEnv = {}) {
  const environment = {
    ...process.env,
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "slicemedia/devkit",
    GITHUB_REPOSITORY_VISIBILITY: "private",
    ...overrides,
  };
  delete environment.NODE_AUTH_TOKEN;
  delete environment.NPM_TOKEN;
  delete environment.NPM_CONFIG_TOKEN;
  if (overrides.NODE_AUTH_TOKEN !== undefined)
    environment.NODE_AUTH_TOKEN = overrides.NODE_AUTH_TOKEN;
  if (overrides.NPM_TOKEN !== undefined) environment.NPM_TOKEN = overrides.NPM_TOKEN;
  if (overrides.NPM_CONFIG_TOKEN !== undefined)
    environment.NPM_CONFIG_TOKEN = overrides.NPM_CONFIG_TOKEN;

  return spawnSync(process.execPath, [script], {
    cwd: resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: environment,
  });
}

describe("version-PR release preparation guard", () => {
  it.each(["private", "public"])(
    "accepts version-only preparation for an explicit %s repository",
    (visibility) => {
      const result = runGuard({ GITHUB_REPOSITORY_VISIBILITY: visibility });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("npm publication is disabled");
    },
  );

  it("fails closed when repository visibility is not explicit", () => {
    const result = runGuard({ GITHUB_REPOSITORY_VISIBILITY: "internal" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("requires an explicit private or public repository visibility");
  });

  it("fails closed when the repository identity is missing", () => {
    const result = runGuard({ GITHUB_REPOSITORY: undefined });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("restricted to slicemedia/devkit");
  });

  it("rejects npm credentials in the version-PR environment", () => {
    const result = runGuard({ NPM_TOKEN: "fixture-token-that-must-not-be-used" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("NPM_TOKEN must not be available");
  });

  it("rejects non-push events and non-main refs", () => {
    const dispatched = runGuard({ GITHUB_EVENT_NAME: "workflow_dispatch" });
    const branchPush = runGuard({ GITHUB_REF: "refs/heads/feature" });

    expect(dispatched.status).not.toBe(0);
    expect(dispatched.stderr).toContain("restricted to push events on refs/heads/main");
    expect(branchPush.status).not.toBe(0);
    expect(branchPush.stderr).toContain("restricted to push events on refs/heads/main");
  });
});
