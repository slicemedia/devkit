import { isDeepStrictEqual } from "node:util";

import { parseDocument } from "yaml";

const checkoutAction = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const pnpmSetupAction = "pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2";
const trustedMain = "github.event_name == 'push' && github.ref == 'refs/heads/main'";
const privateRulesEnvironment = {
  SLICEMEDIA_FORBIDDEN_TERMS: "${{ secrets.SLICEMEDIA_FORBIDDEN_TERMS }}",
};
const sourceScan =
  "node packages/cli/dist/bin.js sanitize --root . --ignore .private --git-history --json";
const archiveScan =
  'node packages/cli/dist/bin.js sanitize --root "${{ runner.temp }}/packs" --json';
const privateRulesProof =
  'set -euo pipefail\nnode --input-type=module -e \'const raw = process.env.SLICEMEDIA_FORBIDDEN_TERMS?.trim() ?? ""; let terms = []; try { terms = raw.startsWith("[") ? JSON.parse(raw) : raw.split(/[\\n,]/u); } catch { process.exit(1); } if (!Array.isArray(terms) || !terms.every((term) => typeof term === "string") || !terms.some((term) => term.trim() !== "")) process.exit(1);\'\n';

const expectedSanitizationSteps = [
  {
    name: "Generic source and history sanitization",
    run: sourceScan,
  },
  {
    name: "Generic package archive sanitization",
    run: archiveScan,
  },
];

const expectedPrivateRulesStep = {
  name: "Require private sanitization rules on trusted main",
  env: privateRulesEnvironment,
  shell: "bash",
  run: privateRulesProof,
};
const expectedPrivateSanitizationJob = {
  needs: "packed-consumer",
  if: trustedMain,
  environment: "release-sanitize",
  "runs-on": "ubuntu-latest",
  permissions: { contents: "read" },
  steps: [
    {
      uses: checkoutAction,
      with: { "persist-credentials": false },
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
    { run: "pnpm install --frozen-lockfile" },
    { run: "pnpm build" },
    {
      run: "pnpm -r --filter './packages/*' pack --pack-destination \"${{ runner.temp }}/packs\"",
    },
    expectedPrivateRulesStep,
    {
      name: "Private source and history sanitization",
      run: sourceScan,
      env: privateRulesEnvironment,
    },
    {
      name: "Private package archive sanitization",
      run: archiveScan,
      env: privateRulesEnvironment,
    },
  ],
};

export function validateCiWorkflow(source) {
  const errors = [];
  if (/\bpull_request_target\s*:/u.test(source)) {
    errors.push("CI must never use pull_request_target.");
  }

  const document = parseDocument(source, { prettyErrors: false, uniqueKeys: true });
  for (const error of document.errors) errors.push(`CI workflow YAML is invalid: ${error.message}`);
  for (const warning of document.warnings) {
    errors.push(`CI workflow YAML warning is not allowed: ${warning.message}`);
  }
  if (document.errors.length > 0 || document.warnings.length > 0) return unique(errors);

  let workflow;
  try {
    workflow = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    return [
      `CI workflow YAML cannot be converted safely: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }

  if (
    !isDeepStrictEqual(workflow.on, {
      pull_request: null,
      push: { branches: ["main"] },
    })
  ) {
    errors.push("CI triggers must be exactly pull_request and push to main.");
  }

  const packedConsumer = workflow.jobs?.["packed-consumer"];
  if (!Array.isArray(packedConsumer?.steps)) {
    errors.push("CI must define the packed-consumer steps.");
    return unique(errors);
  }
  const sanitizationSteps = packedConsumer.steps.filter((step) =>
    step?.run?.includes("packages/cli/dist/bin.js sanitize"),
  );
  if (!isDeepStrictEqual(sanitizationSteps, expectedSanitizationSteps)) {
    errors.push(
      "CI sanitization must keep generic scans secret-free and private scans restricted to trusted main pushes.",
    );
  }
  if (JSON.stringify(packedConsumer).includes("${{ secrets.")) {
    errors.push("Pull-request packed-consumer CI must not receive any secret context.");
  }

  const privateSanitization = workflow.jobs?.["private-sanitization"];
  if (!isDeepStrictEqual(privateSanitization, expectedPrivateSanitizationJob)) {
    errors.push(
      "Private sanitization must use the reviewed main-only release-sanitize job exactly.",
    );
  }

  const expectedValidateMatrix = {
    include: [
      { os: "ubuntu-latest", node: "22.13.0" },
      { os: "ubuntu-latest", node: 24 },
      { os: "windows-latest", node: "22.13.0" },
      { os: "windows-latest", node: 24 },
    ],
  };
  if (!isDeepStrictEqual(workflow.jobs?.validate?.strategy?.matrix, expectedValidateMatrix)) {
    errors.push("CI must test the Node 22.13 floor and Node 24 on Linux and Windows.");
  }
  if (
    !isDeepStrictEqual(packedConsumer.strategy?.matrix, {
      node: ["22.13.0", 24],
    })
  ) {
    errors.push("Packed-consumer CI must test the Node 22.13 floor and Node 24.");
  }

  const allSteps = Object.values(workflow.jobs ?? {}).flatMap((job) => job?.steps ?? []);
  const secretBackedSteps = allSteps.filter((step) =>
    JSON.stringify(step).includes("${{ secrets.SLICEMEDIA_FORBIDDEN_TERMS }}"),
  );
  if (
    secretBackedSteps.length !== 3 ||
    secretBackedSteps.some(
      (step) =>
        !isDeepStrictEqual(step.env, privateRulesEnvironment) || Object.keys(step.env).length !== 1,
    )
  ) {
    errors.push("Private sanitization rules may enter only three release-sanitize job steps.");
  }

  const secretReferences = source.match(/\$\{\{\s*secrets\./gu) ?? [];
  if (secretReferences.length !== 3) {
    errors.push("CI may contain only the three reviewed private sanitization secret references.");
  }
  return unique(errors);
}

function unique(errors) {
  return [...new Set(errors)];
}
