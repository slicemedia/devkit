import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEVKIT_PACKAGES } from "./versioning.mjs";
import { validateReleaseWorkflow } from "./release-workflow-policy.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedRepository = "slicemedia/devkit";
const packageDirectories = [
  "packages/devkit",
  "packages/core",
  "packages/addon",
  "packages/cli",
  "packages/create-devkit",
];
const prohibitedCredentialVariables = ["NODE_AUTH_TOKEN", "NPM_TOKEN", "NPM_CONFIG_TOKEN"];
function workspacePath(relativePath) {
  return resolve(workspaceRoot, relativePath);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(workspacePath(relativePath), "utf8"));
}

const errors = [];
const visibility = process.env.GITHUB_REPOSITORY_VISIBILITY;
if (visibility !== "private" && visibility !== "public") {
  errors.push(
    `Release preparation requires an explicit private or public repository visibility; received ${JSON.stringify(visibility)}.`,
  );
}
if (process.env.GITHUB_REPOSITORY !== expectedRepository) {
  errors.push(`Release preparation is restricted to ${expectedRepository}.`);
}
if (process.env.GITHUB_EVENT_NAME !== "push" || process.env.GITHUB_REF !== "refs/heads/main") {
  errors.push("Release preparation is restricted to push events on refs/heads/main.");
}
for (const variable of prohibitedCredentialVariables) {
  if (process.env[variable]?.trim()) {
    errors.push(`${variable} must not be available to the version-PR workflow.`);
  }
}

const packageNames = [];
for (const directory of packageDirectories) {
  const manifest = await readJson(`${directory}/package.json`);
  packageNames.push(manifest.name);
}
if (JSON.stringify(packageNames) !== JSON.stringify(DEVKIT_PACKAGES)) {
  errors.push("Release preparation package order does not match the fixed DevKit family.");
}

const workflow = await readFile(workspacePath(".github/workflows/release-pr.yml"), "utf8");
errors.push(...validateReleaseWorkflow(workflow));

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.info("Version-PR release preparation is fail-closed; npm publication is disabled.");
}
