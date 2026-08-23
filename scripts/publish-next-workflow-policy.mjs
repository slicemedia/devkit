import { isDeepStrictEqual } from "node:util";

import { parseDocument } from "yaml";

const checkoutAction = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const pnpmSetupAction = "pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2";
const setupNodeAction = "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020";
const uploadArtifactAction = "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02";
const downloadArtifactAction = "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093";
const repositoryGate =
  "github.repository == 'slicemedia/devkit' && github.event.repository.private == false && github.ref == 'refs/heads/main' && vars.SLICEMEDIA_NPM_PUBLISH_NEXT_ENABLED == 'true'";
const earlySourceProof =
  'set -euo pipefail\nif [[ ! "$SLICEMEDIA_RELEASE_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then\n  echo "release_commit must be a full lowercase commit SHA" >&2\n  exit 1\nfi\nfor variable in NODE_AUTH_TOKEN NPM_TOKEN NPM_CONFIG_TOKEN NPM_CONFIG__AUTH NPM_CONFIG__AUTHTOKEN NPM_CONFIG_REGISTRY NPM_CONFIG_USERCONFIG NPM_CONFIG_GLOBALCONFIG YARN_NPM_AUTH_TOKEN npm_config_token npm_config__auth npm_config__authtoken npm_config_registry npm_config_userconfig npm_config_globalconfig; do\n  if [[ -n "${!variable:-}" ]]; then\n    echo "$variable must not be present in the release workflow" >&2\n    exit 1\n  fi\ndone\nhead_commit="$(git rev-parse --verify HEAD^{commit})"\nremote_main="$(git ls-remote --exit-code origin refs/heads/main | cut -f1)"\ntest "$SLICEMEDIA_RELEASE_COMMIT" = "$GITHUB_SHA"\ntest "$SLICEMEDIA_RELEASE_COMMIT" = "$head_commit"\ntest "$SLICEMEDIA_RELEASE_COMMIT" = "$remote_main"\ntest -z "$(git status --porcelain=v1 --untracked-files=all)"\n';
const noTraceProof =
  'set -euo pipefail\nnode --input-type=module -e \'const raw = process.env.SLICEMEDIA_FORBIDDEN_TERMS?.trim() ?? ""; let terms = []; try { terms = raw.startsWith("[") ? JSON.parse(raw) : raw.split(/[\\n,]/u); } catch { process.exit(1); } if (!Array.isArray(terms) || !terms.every((term) => typeof term === "string") || !terms.some((term) => term.trim() !== "")) process.exit(1);\'\n';
const immediateSourceProof =
  'set -euo pipefail\ntest "$SLICEMEDIA_RELEASE_COMMIT" = "$GITHUB_SHA"\ntest "$SLICEMEDIA_RELEASE_COMMIT" = "$(git rev-parse --verify HEAD^{commit})"\ntest "$SLICEMEDIA_RELEASE_COMMIT" = "$(git ls-remote --exit-code origin refs/heads/main | cut -f1)"\ntest -z "$(git status --porcelain=v1 --untracked-files=all)"\ntest "$(npm --version)" = "11.19.0"\n';
const approvedCommitProof =
  'set -euo pipefail\ntest "$SLICEMEDIA_RELEASE_COMMIT" = "$GITHUB_SHA"\ntest "$SLICEMEDIA_RELEASE_COMMIT" = "$(git rev-parse --verify HEAD^{commit})"\ntest -z "$(git status --porcelain=v1 --untracked-files=all)"\n';
const npmInstall =
  "npm install --global npm@11.19.0 --ignore-scripts --registry=https://registry.npmjs.org/ --userconfig=/dev/null --globalconfig=/dev/null";
const npmVersionProof = 'test "$(npm --version)" = "11.19.0"';
const reviewedNpmPathProof =
  'set -euo pipefail\nnpm_global_prefix="$(npm prefix -g)"\nif [[ "$npm_global_prefix" != /* || "$npm_global_prefix" == *:* || "$npm_global_prefix" == *$\'\\n\'* || "$npm_global_prefix" == *$\'\\r\'* ]]; then\n  echo "npm global prefix is not a safe absolute PATH entry" >&2\n  exit 1\nfi\nnpm_global_bin="${npm_global_prefix%/}/bin"\nif [[ ! -d "$npm_global_bin" || ! -x "$npm_global_bin/npm" ]]; then\n  echo "reviewed npm executable was not found in the global npm bin directory" >&2\n  exit 1\nfi\nexport PATH="$npm_global_bin:$PATH"\nif [[ "$(command -v npm)" != "$npm_global_bin/npm" || "$(npm --version)" != "11.19.0" ]]; then\n  echo "reviewed npm 11.19.0 is not first on PATH" >&2\n  exit 1\nfi\nif [[ -z "${GITHUB_PATH:-}" || "$GITHUB_PATH" != /* || "$GITHUB_PATH" == *$\'\\n\'* || "$GITHUB_PATH" == *$\'\\r\'* ]]; then\n  echo "GITHUB_PATH is not a safe absolute command-file path" >&2\n  exit 1\nfi\nprintf \'%s\\n\' "$npm_global_bin" >> "$GITHUB_PATH"\n';
const artifactName = "devkit-npm-${{ inputs.release_commit }}-${{ github.run_attempt }}";
const releaseCommitEnvironment = {
  SLICEMEDIA_RELEASE_COMMIT: "${{ inputs.release_commit }}",
};
const checkoutStep = {
  uses: checkoutAction,
  with: { "fetch-depth": 0, "persist-credentials": false },
};

const expectedWorkflow = {
  name: "Publish npm prerelease",
  on: {
    workflow_dispatch: {
      inputs: {
        release_commit: {
          description: "Full 40-character main commit to publish",
          required: true,
          type: "string",
        },
      },
    },
  },
  permissions: {},
  concurrency: {
    group: "devkit-npm-next",
    "cancel-in-progress": false,
  },
  jobs: {
    prepare: {
      if: repositoryGate,
      environment: "release-sanitize",
      "runs-on": "ubuntu-latest",
      permissions: { contents: "read" },
      steps: [
        checkoutStep,
        {
          name: "Verify current main before repository code",
          shell: "bash",
          env: releaseCommitEnvironment,
          run: earlySourceProof,
        },
        {
          name: "Require private release denylist",
          shell: "bash",
          env: {
            SLICEMEDIA_FORBIDDEN_TERMS: "${{ secrets.SLICEMEDIA_FORBIDDEN_TERMS }}",
          },
          run: noTraceProof,
        },
        {
          uses: pnpmSetupAction,
          with: {
            version: "11.21.0",
            runtime: "node@24",
            cache: true,
            install: false,
          },
        },
        { run: npmInstall },
        {
          name: "Prefer reviewed npm CLI",
          shell: "bash",
          run: reviewedNpmPathProof,
        },
        { run: "pnpm install --frozen-lockfile" },
        { run: "pnpm check" },
        { run: "pnpm test:registry-release-candidate" },
        { run: "pnpm release:archive", env: releaseCommitEnvironment },
        {
          name: "Sanitize source, history, generated files, and release archives",
          run: "pnpm sanitize -- --json",
          env: {
            SLICEMEDIA_FORBIDDEN_TERMS: "${{ secrets.SLICEMEDIA_FORBIDDEN_TERMS }}",
          },
        },
        {
          uses: uploadArtifactAction,
          with: {
            name: artifactName,
            path: ".npm-release",
            "if-no-files-found": "error",
            "include-hidden-files": true,
            "retention-days": 1,
            "compression-level": 0,
          },
        },
      ],
    },
    publish: {
      needs: "prepare",
      if: `${repositoryGate} && needs.prepare.result == 'success'`,
      environment: "npm-next",
      "runs-on": "ubuntu-latest",
      permissions: { contents: "read", "id-token": "write" },
      steps: [
        checkoutStep,
        {
          name: "Verify current main before repository code",
          shell: "bash",
          env: releaseCommitEnvironment,
          run: earlySourceProof,
        },
        {
          uses: setupNodeAction,
          with: { "node-version": 24, "check-latest": false },
        },
        { run: npmInstall },
        { run: npmVersionProof },
        {
          uses: downloadArtifactAction,
          with: { name: artifactName, path: ".npm-release" },
        },
        {
          run: "node scripts/assert-npm-publication-artifact.mjs",
          env: {
            GITHUB_REPOSITORY_VISIBILITY: "${{ github.event.repository.visibility }}",
            SLICEMEDIA_NPM_PUBLISH_NEXT_ENABLED: "${{ vars.SLICEMEDIA_NPM_PUBLISH_NEXT_ENABLED }}",
            SLICEMEDIA_RELEASE_COMMIT: "${{ inputs.release_commit }}",
            SLICEMEDIA_RELEASE_ENVIRONMENT: "npm-next",
          },
        },
        {
          name: "Verify current main immediately before publication",
          shell: "bash",
          env: releaseCommitEnvironment,
          run: immediateSourceProof,
        },
        {
          run: "node scripts/publish-next.mjs",
          env: {
            GITHUB_REPOSITORY_VISIBILITY: "${{ github.event.repository.visibility }}",
            SLICEMEDIA_NPM_PUBLISH_NEXT_ENABLED: "${{ vars.SLICEMEDIA_NPM_PUBLISH_NEXT_ENABLED }}",
            SLICEMEDIA_RELEASE_COMMIT: "${{ inputs.release_commit }}",
            SLICEMEDIA_RELEASE_ENVIRONMENT: "npm-next",
          },
        },
      ],
    },
    verify: {
      needs: ["prepare", "publish"],
      if: `${repositoryGate} && needs.prepare.result == 'success' && needs.publish.result == 'success'`,
      "runs-on": "ubuntu-latest",
      permissions: { contents: "read" },
      steps: [
        checkoutStep,
        {
          name: "Verify approved commit before repository code",
          shell: "bash",
          env: releaseCommitEnvironment,
          run: approvedCommitProof,
        },
        {
          uses: setupNodeAction,
          with: { "node-version": 24, "check-latest": false },
        },
        {
          uses: downloadArtifactAction,
          with: { name: artifactName, path: ".npm-release" },
        },
        {
          run: "node scripts/verify-npm-publication.mjs",
          env: {
            GITHUB_REPOSITORY_VISIBILITY: "${{ github.event.repository.visibility }}",
            SLICEMEDIA_RELEASE_COMMIT: "${{ inputs.release_commit }}",
          },
        },
      ],
    },
  },
};

const allowedActions = [
  checkoutAction,
  pnpmSetupAction,
  uploadArtifactAction,
  checkoutAction,
  setupNodeAction,
  downloadArtifactAction,
  checkoutAction,
  setupNodeAction,
  downloadArtifactAction,
];
const allowedCommands = [
  npmInstall,
  "pnpm install --frozen-lockfile",
  "pnpm check",
  "pnpm test:registry-release-candidate",
  "pnpm release:archive",
  npmInstall,
  npmVersionProof,
  "node scripts/assert-npm-publication-artifact.mjs",
  "node scripts/publish-next.mjs",
  "node scripts/verify-npm-publication.mjs",
];
const prohibitedPatterns = [
  ["Git tag command", /\bgit\s+tag\b/u],
  ["GitHub Release command", /\bgh\s+release\b/u],
  ["GitHub Release action", /(?:create-release|action-gh-release)@/u],
  ["Changesets publication action", /changesets\/action(?:\/publish)?@/u],
  ["direct publish command", /^\s*-\s+run:\s*(?:npm|pnpm)\s+publish\b/gmu],
  ["latest npm tag", /(?:--tag[= ]+latest|dist-tag\s+add\s+\S+\s+latest)/u],
];

export function validatePublishNextWorkflow(source) {
  const errors = [];
  for (const [label, expression] of prohibitedPatterns) {
    expression.lastIndex = 0;
    if (expression.test(source)) errors.push(`Publish workflow contains a prohibited ${label}.`);
  }

  const document = parseDocument(source, { prettyErrors: false, uniqueKeys: true });
  for (const error of document.errors) {
    errors.push(`Publish workflow YAML is invalid: ${error.message}`);
  }
  for (const warning of document.warnings) {
    errors.push(`Publish workflow YAML warning is not allowed: ${warning.message}`);
  }
  if (document.errors.length === 0 && document.warnings.length === 0) {
    try {
      const workflow = document.toJS({ maxAliasCount: 0 });
      if (!isDeepStrictEqual(workflow, expectedWorkflow)) {
        errors.push(
          "Publish workflow must match the reviewed no-OIDC prepare, minimal OIDC publish, and no-OIDC verification schema exactly.",
        );
      }
    } catch (error) {
      errors.push(
        `Publish workflow YAML cannot be converted safely: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const actions = [...source.matchAll(/^\s*-\s+uses:\s*(\S+)/gmu)].map((match) => match[1]);
  if (!isDeepStrictEqual(actions, allowedActions)) {
    errors.push("Publish workflow actions must match the immutable allowlist exactly.");
  }
  const commands = [...source.matchAll(/^\s*-\s+run:\s*(.+)$/gmu)].map((match) => match[1].trim());
  if (!isDeepStrictEqual(commands, allowedCommands)) {
    errors.push("Publish workflow commands must match the reviewed allowlist exactly.");
  }
  return [...new Set(errors)];
}
