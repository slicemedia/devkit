import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validateReleaseWorkflow } from "../scripts/release-workflow-policy.mjs";

const workflowPath = resolve(import.meta.dirname, "../.github/workflows/release-pr.yml");
const workflow = await readFile(workflowPath, "utf8");
const changesetsStep =
  "      - uses: changesets/action/version@8488615a623b1b9c987934bb89eae8af6a946ac1 # v2.1.1";

function beforeChangesets(...lines) {
  return workflow.replace(changesetsStep, `${lines.join("\n")}\n${changesetsStep}`);
}

function expectRejected(source) {
  expect(validateReleaseWorkflow(source)).not.toEqual([]);
}

describe("release workflow structural policy", () => {
  it("accepts only the reviewed canonical workflow", () => {
    expect(validateReleaseWorkflow(workflow)).toEqual([]);
  });

  it("rejects ordinary block-style extra uses and run steps", () => {
    expectRejected(
      beforeChangesets(
        "      - uses: actions/setup-node@1111111111111111111111111111111111111111",
        "      - run: echo unreviewed-standard-step",
      ),
    );
  });

  it("rejects flow-style extra uses and run steps", () => {
    expectRejected(
      beforeChangesets(
        "      - { uses: actions/setup-node@1111111111111111111111111111111111111111, with: { node-version: 22 } }",
        '      - { run: "echo unreviewed-flow-step" }',
      ),
    );
  });

  it("rejects multiline run syntax even when it resolves to an allowed command", () => {
    expectRejected(
      workflow.replace(
        "      - run: pnpm install --frozen-lockfile",
        "      - run: |-\n          pnpm install --frozen-lockfile",
      ),
    );
  });

  it("rejects a job-level reusable workflow", () => {
    expectRejected(
      `${workflow}\n  unexpected:\n    uses: example/release/.github/workflows/publish.yml@1111111111111111111111111111111111111111\n`,
    );
  });

  it("requires the explicit repository-variable enablement gate", () => {
    expectRejected(workflow.replace(" && vars.SLICEMEDIA_RELEASE_PR_ENABLED == 'true'", ""));
  });

  it("rejects manual dispatch and requires the explicit push-main job guard", () => {
    expectRejected(
      workflow.replace("    branches: [main]\n", "    branches: [main]\n  workflow_dispatch:\n"),
    );
    expectRejected(workflow.replace(" && github.event_name == 'push'", ""));
    expectRejected(workflow.replace(" && github.ref == 'refs/heads/main'", ""));
  });

  it.each([
    ["trigger", (source) => source.replace("branches: [main]", "branches: [release]")],
    [
      "root permissions",
      (source) => source.replace("permissions: {}", "permissions:\n  contents: read"),
    ],
    [
      "concurrency",
      (source) => source.replace("cancel-in-progress: false", "cancel-in-progress: true"),
    ],
    [
      "job permissions",
      (source) => source.replace("      contents: write", "      contents: read"),
    ],
    [
      "step order",
      (source) =>
        source.replace(
          "      - run: pnpm install --frozen-lockfile\n      - run: pnpm release:prepare:check",
          "      - run: pnpm release:prepare:check\n      - run: pnpm install --frozen-lockfile",
        ),
    ],
    [
      "action pin",
      (source) =>
        source.replace(
          "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
          "actions/checkout@1111111111111111111111111111111111111111",
        ),
    ],
    [
      "action inputs",
      (source) => source.replace("          cache: true", "          cache: false"),
    ],
    [
      "guard environment",
      (source) =>
        source.replace(
          "${{ github.event.repository.visibility }}",
          "${{ vars.REPOSITORY_VISIBILITY }}",
        ),
    ],
    [
      "Changesets subaction input",
      (source) =>
        source.replace(
          "          script: pnpm version-packages",
          "          version-script: pnpm version-packages",
        ),
    ],
  ])("rejects a changed %s contract", (_label, mutate) => {
    expectRejected(mutate(workflow));
  });

  it.each([
    ["npm publish", "npm publish"],
    ["Changesets publish", "pnpm changeset publish"],
    ["Git tag", "git tag v0.2.0"],
    ["GitHub Release", "gh release create v0.2.0"],
  ])("rejects a %s command path", (_label, command) => {
    expectRejected(workflow.replace("pnpm install --frozen-lockfile", command));
  });

  it("rejects OIDC and npm credential paths", () => {
    expectRejected(workflow.replace("permissions: {}", "permissions:\n  id-token: write"));
    expectRejected(
      workflow.replace(
        "      - run: pnpm install --frozen-lockfile",
        "      - run: pnpm install --frozen-lockfile\n        env:\n          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}",
      ),
    );
  });
});
