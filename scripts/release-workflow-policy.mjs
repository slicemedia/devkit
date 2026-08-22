import { isDeepStrictEqual } from "node:util";

import { parseDocument } from "yaml";

const checkoutAction = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const pnpmSetupAction = "pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2";
const changesetsVersionAction =
  "changesets/action/version@8488615a623b1b9c987934bb89eae8af6a946ac1";

const expectedWorkflow = {
  name: "Release PR",
  on: {
    push: { branches: ["main"] },
  },
  permissions: {},
  concurrency: {
    group: "devkit-release-pr",
    "cancel-in-progress": false,
  },
  jobs: {
    version: {
      if: "github.repository == 'slicemedia/devkit' && github.event_name == 'push' && github.ref == 'refs/heads/main' && vars.SLICEMEDIA_RELEASE_PR_ENABLED == 'true'",
      "runs-on": "ubuntu-latest",
      permissions: {
        contents: "write",
        "pull-requests": "write",
      },
      steps: [
        {
          uses: checkoutAction,
          with: {
            "fetch-depth": 0,
            "persist-credentials": false,
          },
        },
        {
          uses: pnpmSetupAction,
          with: {
            version: "11.21.0",
            runtime: "node@22",
            cache: true,
            install: false,
          },
        },
        { run: "pnpm install --frozen-lockfile" },
        {
          run: "pnpm release:prepare:check",
          env: {
            GITHUB_REPOSITORY_VISIBILITY: "${{ github.event.repository.visibility }}",
          },
        },
        {
          uses: changesetsVersionAction,
          with: {
            script: "pnpm version-packages",
            "commit-message": "chore: version DevKit packages",
            "pr-title": "chore: version DevKit packages",
            "pr-draft": "create",
          },
        },
      ],
    },
  },
};

const allowedActionReferences = [checkoutAction, pnpmSetupAction, changesetsVersionAction];
const allowedRunCommands = ["pnpm install --frozen-lockfile", "pnpm release:prepare:check"];
const prohibitedWorkflowPatterns = [
  ["manual dispatch trigger", /\bworkflow_dispatch\s*:/u],
  ["npm publication command", /\bnpm\s+publish\b/u],
  ["Changesets publication command", /\bchangeset(?:s)?\s+publish\b/u],
  ["Changesets publish action", /changesets\/action\/publish@/u],
  ["combined Changesets action", /uses:\s*changesets\/action@/u],
  ["OIDC publication permission", /id-token:\s*write/u],
  ["npm token path", /\b(?:NODE_AUTH_TOKEN|NPM_TOKEN|NPM_CONFIG_TOKEN)\b/u],
  ["Git tag command", /\bgit\s+tag\b/u],
  ["GitHub Release command", /\bgh\s+release\b/u],
  ["GitHub Release action", /(?:create-release|action-gh-release)@/u],
];

export function validateReleaseWorkflow(source) {
  const errors = [];

  for (const [label, expression] of prohibitedWorkflowPatterns) {
    if (expression.test(source)) errors.push(`Version-PR workflow contains a prohibited ${label}.`);
  }

  const document = parseDocument(source, {
    prettyErrors: false,
    uniqueKeys: true,
  });
  for (const error of document.errors)
    errors.push(`Version-PR workflow YAML is invalid: ${error.message}`);
  for (const warning of document.warnings) {
    errors.push(`Version-PR workflow YAML warning is not allowed: ${warning.message}`);
  }

  if (document.errors.length === 0 && document.warnings.length === 0) {
    try {
      const workflow = document.toJS({ maxAliasCount: 0 });
      if (!isDeepStrictEqual(workflow, expectedWorkflow)) {
        errors.push(
          "Version-PR workflow must match the reviewed single-job version-only schema exactly.",
        );
      }
    } catch (error) {
      errors.push(
        `Version-PR workflow YAML cannot be converted safely: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const actionReferences = [...source.matchAll(/^\s*-\s+uses:\s*(\S+)/gmu)].map(
    (match) => match[1],
  );
  if (!isDeepStrictEqual(actionReferences, allowedActionReferences)) {
    errors.push(
      "Version-PR workflow action syntax must match the reviewed immutable allowlist exactly.",
    );
  }

  const runCommands = [...source.matchAll(/^\s*-\s+run:\s*(.+)$/gmu)].map((match) =>
    match[1].trim(),
  );
  if (!isDeepStrictEqual(runCommands, allowedRunCommands)) {
    errors.push(
      "Version-PR workflow command syntax must match the reviewed version-only allowlist exactly.",
    );
  }

  return errors;
}
