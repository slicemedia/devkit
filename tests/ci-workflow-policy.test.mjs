import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validateCiWorkflow } from "../scripts/ci-workflow-policy.mjs";

const workflowPath = resolve(import.meta.dirname, "../.github/workflows/ci.yml");
const workflow = await readFile(workflowPath, "utf8");
const trustedMain = "github.event_name == 'push' && github.ref == 'refs/heads/main'";
const secretEnvironment =
  "          SLICEMEDIA_FORBIDDEN_TERMS: ${{ secrets.SLICEMEDIA_FORBIDDEN_TERMS }}";

function expectRejected(source) {
  expect(validateCiWorkflow(source)).not.toEqual([]);
}

describe("CI private sanitization boundary", () => {
  it("accepts generic pull-request scans and environment-backed trusted-main scans", () => {
    expect(validateCiWorkflow(workflow)).toEqual([]);
  });

  it("rejects pull_request_target and broader triggers", () => {
    expectRejected(workflow.replace("  pull_request:\n", "  pull_request_target:\n"));
    expectRejected(workflow.replace("    branches: [main]", "    branches: [main, feature]"));
  });

  it("keeps both generic scans free of secret expressions and conditions", () => {
    expectRejected(
      workflow.replace(
        "      - name: Generic source and history sanitization\n",
        `      - name: Generic source and history sanitization\n        if: ${trustedMain}\n`,
      ),
    );
    expectRejected(
      workflow.replace(
        "      - name: Generic package archive sanitization\n",
        `      - name: Generic package archive sanitization\n        env:\n${secretEnvironment}\n`,
      ),
    );
  });

  it("restricts the private-rule job to trusted push main and release-sanitize", () => {
    expect(workflow.match(new RegExp(escapeRegExp(`if: ${trustedMain}`), "gu"))).toHaveLength(1);
    expect(workflow.match(/environment: release-sanitize/gu)).toHaveLength(1);
    expectRejected(
      workflow.replace(`    if: ${trustedMain}`, "    if: github.event_name == 'pull_request'"),
    );
    expectRejected(workflow.replace(`    if: ${trustedMain}\n`, ""));
    expectRejected(workflow.replace("    environment: release-sanitize\n", ""));
    expectRejected(
      workflow.replace("    environment: release-sanitize", "    environment: npm-next"),
    );
  });

  it("requires private source and archive coverage plus a nonempty-rule proof", () => {
    expectRejected(
      workflow.replace(
        "      - name: Private source and history sanitization",
        "      - name: Removed private source sanitization",
      ),
    );
    expectRejected(
      workflow.replace(
        "      - name: Private package archive sanitization",
        "      - name: Removed private archive sanitization",
      ),
    );
    expectRejected(
      workflow.replace(
        "          node --input-type=module -e",
        "          true # node --input-type=module -e",
      ),
    );
  });

  it("rejects any fourth secret context", () => {
    expectRejected(
      workflow.replace(
        "      - run: pnpm check\n",
        `      - run: pnpm check\n        if: ${trustedMain}\n        env:\n${secretEnvironment}\n`,
      ),
    );
  });

  it("tests the exact Node 22.13 floor and Node 24", () => {
    expectRejected(workflow.replaceAll("22.13.0", "22.12.0"));
    expectRejected(workflow.replace("            node: 24", "            node: 23"));
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
