import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validatePublishNextWorkflow } from "../scripts/publish-next-workflow-policy.mjs";

const workflowPath = resolve(import.meta.dirname, "../.github/workflows/publish-next.yml");
const workflow = await readFile(workflowPath, "utf8");
const publishStep = "      - run: node scripts/publish-next.mjs";

function beforePublish(...lines) {
  return workflow.replace(publishStep, `${lines.join("\n")}\n${publishStep}`);
}

function expectRejected(source) {
  expect(validatePublishNextWorkflow(source)).not.toEqual([]);
}

describe("npm next workflow structural policy", () => {
  it("accepts only the reviewed split release workflow", () => {
    expect(validatePublishNextWorkflow(workflow)).toEqual([]);
  });

  it("keeps OIDC and approval exclusive to the minimal publication job", () => {
    expect(workflow.match(/id-token: write/gu)).toHaveLength(1);
    expectRejected(
      workflow.replace(
        "  prepare:\n    if:",
        "  prepare:\n    permissions:\n      id-token: write\n    if:",
      ),
    );
    expectRejected(workflow.replace("    environment: npm-next\n", ""));
    expectRejected(
      workflow.replace("  verify:\n    needs:", "  verify:\n    environment: npm-next\n    needs:"),
    );
  });

  it("requires a private release denylist only in preparation", () => {
    expect(workflow.match(/secrets\.SLICEMEDIA_FORBIDDEN_TERMS/gu)).toHaveLength(2);
    expect(workflow.match(/environment: release-sanitize/gu)).toHaveLength(1);
    expectRejected(workflow.replace("    environment: release-sanitize\n", ""));
    expectRejected(
      workflow.replace(
        "          SLICEMEDIA_FORBIDDEN_TERMS: ${{ secrets.SLICEMEDIA_FORBIDDEN_TERMS }}\n",
        "",
      ),
    );
    expectRejected(
      workflow.replace(
        "          SLICEMEDIA_RELEASE_ENVIRONMENT: npm-next\n",
        "          SLICEMEDIA_RELEASE_ENVIRONMENT: npm-next\n          SLICEMEDIA_FORBIDDEN_TERMS: ${{ secrets.SLICEMEDIA_FORBIDDEN_TERMS }}\n",
      ),
    );
  });

  it("requires dependency-free live-main checks before repository code and before publish", () => {
    expect(workflow.match(/Verify current main before repository code/gu)).toHaveLength(2);
    expectRejected(
      workflow.replace(
        'remote_main="$(git ls-remote --exit-code origin refs/heads/main | cut -f1)"',
        'remote_main="$GITHUB_SHA"',
      ),
    );
    expectRejected(
      workflow.replace("      - name: Verify current main immediately before publication\n", ""),
    );
    expectRejected(
      workflow.replace(
        'test "$SLICEMEDIA_RELEASE_COMMIT" = "$GITHUB_SHA"',
        'test "$SLICEMEDIA_RELEASE_COMMIT" = "$head_commit"',
      ),
    );
  });

  it("moves only exact commit-bound archives between the jobs", () => {
    expectRejected(workflow.replace("          path: .npm-release", "          path: ."));
    expectRejected(
      workflow.replace(
        "devkit-npm-${{ inputs.release_commit }}-${{ github.run_attempt }}",
        "devkit-npm-latest",
      ),
    );
    expectRejected(workflow.replace("          retention-days: 1", "          retention-days: 30"));
    expectRejected(
      workflow.replace("          compression-level: 0", "          compression-level: 6"),
    );
  });

  it.each([
    ["repository", (source) => source.replace("slicemedia/devkit", "example/devkit")],
    [
      "root permission",
      (source) => source.replace("permissions: {}", "permissions:\n  contents: read"),
    ],
    [
      "checkout pin",
      (source) => source.replace(/actions\/checkout@[0-9a-f]{40}/u, "actions/checkout@main"),
    ],
    [
      "Node line",
      (source) => source.replace("          runtime: node@24", "          runtime: node@22"),
    ],
    ["npm version", (source) => source.replace("npm@11.19.0", "npm@latest")],
    [
      "artifact validation",
      (source) =>
        source.replace(
          "node scripts/assert-npm-publication-artifact.mjs",
          "node scripts/publish-next.mjs",
        ),
    ],
    [
      "post-publication verification",
      (source) =>
        source.replace("node scripts/verify-npm-publication.mjs", "node scripts/publish-next.mjs"),
    ],
  ])("rejects a changed %s contract", (_label, mutate) => {
    expectRejected(mutate(workflow));
  });

  it("rejects extra block, flow, multiline, and reusable steps", () => {
    expectRejected(beforePublish("      - run: echo unreviewed"));
    expectRejected(beforePublish('      - { run: "echo unreviewed-flow-step" }'));
    expectRejected(
      workflow.replace("      - run: pnpm check", "      - run: |-\n          pnpm check"),
    );
    expectRejected(
      `${workflow}\n  unexpected:\n    uses: example/publish/.github/workflows/publish.yml@1111111111111111111111111111111111111111\n`,
    );
  });

  it.each([
    ["long-lived npm token", "          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}"],
    ["Git tag", "      - run: git tag v0.2.0"],
    ["GitHub Release", "      - run: gh release create v0.2.0"],
    ["direct publish", "      - run: npm publish"],
    ["latest tag", "      - run: npm dist-tag add @slicemedia/devkit@0.2.0 latest"],
  ])("rejects a %s path", (_label, line) => {
    expectRejected(beforePublish(line));
  });
});
