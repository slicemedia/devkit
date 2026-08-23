import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const releaseDirectory = resolve(repositoryRoot, ".npm-release");
export const npmRegistry = "https://registry.npmjs.org/";
export const npmVersion = "11.19.0";
export const pnpmVersion = "11.21.0";
const repositoryUrl = "git+https://github.com/slicemedia/devkit.git";
const supportedNodeRange = ">=22.13.0 <23 || >=24.0.0 <25";
export const packageDefinitions = [
  {
    archive: "devkit-core.tgz",
    directory: "packages/core",
    homepage: "https://github.com/slicemedia/devkit/tree/main/packages/core#readme",
    internalDependencies: [],
    keywords: ["slicemedia", "webflow", "browser", "lifecycle", "typescript"],
    name: "@slicemedia/devkit-core",
  },
  {
    archive: "devkit-addon.tgz",
    directory: "packages/addon",
    homepage: "https://github.com/slicemedia/devkit/tree/main/packages/addon#readme",
    internalDependencies: ["@slicemedia/devkit-core"],
    keywords: ["slicemedia", "webflow", "addon", "lifecycle", "typescript"],
    name: "@slicemedia/devkit-addon",
  },
  {
    archive: "devkit-cli.tgz",
    directory: "packages/cli",
    homepage: "https://github.com/slicemedia/devkit/tree/main/packages/cli#readme",
    internalDependencies: [],
    keywords: ["slicemedia", "webflow", "cli", "vite", "typescript"],
    name: "@slicemedia/devkit-cli",
  },
  {
    archive: "create-devkit.tgz",
    directory: "packages/create-devkit",
    homepage: "https://github.com/slicemedia/devkit/tree/main/packages/create-devkit#readme",
    internalDependencies: [],
    keywords: ["slicemedia", "webflow", "starter", "scaffolding", "typescript"],
    name: "@slicemedia/create-devkit",
  },
  {
    archive: "devkit.tgz",
    directory: "packages/devkit",
    homepage: "https://github.com/slicemedia/devkit#readme",
    internalDependencies: ["@slicemedia/devkit-addon", "@slicemedia/devkit-core"],
    keywords: ["slicemedia", "webflow", "browser", "addon", "typescript"],
    name: "@slicemedia/devkit",
  },
];

const exactProhibitedPublicationVariables = new Set([
  "NODE_AUTH_TOKEN",
  "NPM_TOKEN",
  "NPM_ID_TOKEN",
  "SIGSTORE_ID_TOKEN",
  "YARN_NPM_AUTH_TOKEN",
]);
// pnpm injects these inert metadata keys into package scripts. Validation tolerates only these
// exact names so the reviewed pnpm entry points remain usable; child npm processes still remove
// both keys with every other npm configuration variable.
const allowedAmbientPublicationVariables = new Set([
  "NPM_CONFIG_NODE_GYP",
  "NPM_CONFIG_USER_AGENT",
]);

export function isProhibitedPublicationVariable(name) {
  if (typeof name !== "string") return false;
  const normalized = name.toUpperCase();
  return (
    normalized.startsWith("NPM_CONFIG_") || exactProhibitedPublicationVariables.has(normalized)
  );
}

export function isProhibitedPublicationOverride(name) {
  if (!isProhibitedPublicationVariable(name)) return false;
  return !allowedAmbientPublicationVariables.has(name.toUpperCase());
}

const exactSemver =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const receiptKeys = [
  "npmVersion",
  "packages",
  "pnpmVersion",
  "schemaVersion",
  "sourceCommit",
  "version",
];
const receiptPackageKeys = ["archive", "integrity", "name", "shasum", "treeDigest", "version"];

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}

function unique(values) {
  return [...new Set(values)];
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateReviewedMetadata(manifest, expected, label) {
  const errors = [];
  if (manifest.license !== "MIT") {
    errors.push(`${label} must use the MIT license.`);
  }
  if (
    !exactKeys(manifest.repository, ["directory", "type", "url"]) ||
    manifest.repository.type !== "git" ||
    manifest.repository.url !== repositoryUrl ||
    manifest.repository.directory !== expected.directory
  ) {
    errors.push(`${label} must use the reviewed DevKit repository metadata.`);
  }
  if (manifest.homepage !== expected.homepage) {
    errors.push(`${label} must use the reviewed DevKit homepage.`);
  }
  if (
    !exactKeys(manifest.bugs, ["url"]) ||
    manifest.bugs.url !== "https://github.com/slicemedia/devkit/issues"
  ) {
    errors.push(`${label} must use the reviewed DevKit issue tracker.`);
  }
  if (!sameJson(manifest.keywords, expected.keywords)) {
    errors.push(`${label} must use the reviewed package keywords.`);
  }
  if (!exactKeys(manifest.engines, ["node"]) || manifest.engines.node !== supportedNodeRange) {
    errors.push(`${label} must use the reviewed Node.js engine range.`);
  }
  return errors;
}

function isInternalDependencyName(name) {
  return (
    name === "@slicemedia/devkit" ||
    name === "@slicemedia/create-devkit" ||
    name.startsWith("@slicemedia/devkit-")
  );
}

function internalDependencyRows(manifest) {
  const rows = [];
  for (const section of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, range] of Object.entries(manifest[section] ?? {})) {
      if (isInternalDependencyName(name)) rows.push({ name, range, section });
    }
  }
  return rows.sort((left, right) =>
    `${left.section}\0${left.name}`.localeCompare(`${right.section}\0${right.name}`),
  );
}

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
}

async function run(command, arguments_, options = {}) {
  return execute(command, arguments_, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: options.encoding === "buffer" ? null : "utf8",
    env: options.env ?? process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
}

export function calculateArchiveHashes(contents) {
  return {
    integrity: `sha512-${createHash("sha512").update(contents).digest("base64")}`,
    shasum: createHash("sha1").update(contents).digest("hex"),
  };
}

export async function calculateArchiveTreeDigest(archive) {
  const { stdout } = await run("tar", ["-tf", archive]);
  const entries = stdout.split(/\r?\n/u).filter(Boolean);
  const files = entries.filter((entry) => !entry.endsWith("/"));
  if (new Set(files).size !== files.length) {
    throw new Error("Release archive contains duplicate file entries.");
  }
  for (const entry of entries) {
    const normalizedEntry = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    const segments = normalizedEntry.split("/");
    if (
      !entry.startsWith("package/") ||
      entry.includes("\\") ||
      hasControlCharacter(entry) ||
      segments.includes("..") ||
      segments.includes(".") ||
      segments.includes("")
    ) {
      throw new Error(`Release archive contains an unsafe entry: ${entry}`);
    }
  }

  const hash = createHash("sha256");
  for (const entry of [...files].sort()) {
    const { stdout: contents } = await run("tar", ["-xOf", archive, entry], {
      encoding: "buffer",
    });
    hash.update(entry);
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function calculateArchiveMetadata(archive) {
  const stats = await lstat(archive);
  if (!stats.isFile() || stats.size <= 0 || stats.size > 100 * 1024 * 1024) {
    throw new Error(`${archive} must be a bounded regular file.`);
  }
  const contents = await readFile(archive);
  return {
    ...calculateArchiveHashes(contents),
    size: stats.size,
    treeDigest: await calculateArchiveTreeDigest(archive),
  };
}

export async function readReleaseState({ requirePublic = true } = {}) {
  const packages = [];
  const errors = [];
  for (const definition of packageDefinitions) {
    const manifestPath = resolve(repositoryRoot, definition.directory, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.name !== definition.name) {
      errors.push(`${definition.directory}/package.json must be named ${definition.name}.`);
    }
    if (!exactSemver.test(manifest.version ?? "")) {
      errors.push(`${definition.name} must use one exact semantic version.`);
    }
    if (requirePublic && manifest.private !== false) {
      errors.push(`${definition.name} must explicitly set private to false.`);
    }
    if (manifest.publishConfig?.access !== "public") {
      errors.push(`${definition.name} must publish with public access.`);
    }
    if (manifest.publishConfig?.provenance !== true) {
      errors.push(`${definition.name} must request npm provenance.`);
    }
    errors.push(
      ...validateReviewedMetadata(manifest, definition, `${definition.directory}/package.json`),
    );
    for (const lifecycle of [
      "prepare",
      "prepack",
      "postpack",
      "prepublishOnly",
      "publish",
      "postpublish",
    ]) {
      if (manifest.scripts?.[lifecycle] !== undefined) {
        errors.push(`${definition.name} must not define the ${lifecycle} lifecycle script.`);
      }
    }
    packages.push({ ...definition, manifest, version: manifest.version });
  }
  const versions = unique(packages.map(({ version }) => version));
  if (versions.length !== 1) {
    errors.push("The five DevKit release packages must use one fixed version.");
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return { packages, version: versions[0] };
}

export function validateNoPublicationOverrides(environment) {
  const errors = [];
  for (const variable of Object.keys(environment)) {
    if (isProhibitedPublicationOverride(variable)) {
      errors.push(`${variable} must not override npm publication.`);
    }
  }
  return errors;
}

export function validatePackedManifest(manifest, expected) {
  const errors = [];
  if (manifest.name !== expected.name || manifest.version !== expected.version) {
    errors.push(`${expected.name} packed manifest has an unexpected identity.`);
  }
  if (manifest.private !== false) {
    errors.push(`${expected.name} packed manifest must explicitly be public.`);
  }
  if (manifest.publishConfig?.access !== "public" || manifest.publishConfig?.provenance !== true) {
    errors.push(`${expected.name} packed manifest has an unexpected publication policy.`);
  }
  errors.push(...validateReviewedMetadata(manifest, expected, `${expected.name} packed manifest`));

  const expectedInternalDependencies = expected.internalDependencies
    .map((name) => ({ name, range: expected.version, section: "dependencies" }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const actualInternalDependencies = internalDependencyRows(manifest);
  if (!sameJson(actualInternalDependencies, expectedInternalDependencies)) {
    errors.push(
      `${expected.name} packed manifest must contain exactly its reviewed internal dependencies at release version ${expected.version}.`,
    );
  }
  for (const dependencies of [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ]) {
    for (const range of Object.values(dependencies ?? {})) {
      if (typeof range === "string") {
        if (/^(?:workspace|catalog):/u.test(range)) {
          errors.push(`${expected.name} packed manifest contains an unresolved workspace range.`);
        }
        if (range.trimStart().startsWith("npm:")) {
          errors.push(`${expected.name} packed manifest contains a prohibited npm alias.`);
        }
      }
    }
  }
  for (const lifecycle of [
    "prepare",
    "prepack",
    "postpack",
    "prepublishOnly",
    "publish",
    "postpublish",
  ]) {
    if (manifest.scripts?.[lifecycle] !== undefined) {
      errors.push(`${expected.name} packed manifest contains the ${lifecycle} lifecycle script.`);
    }
  }
  return errors;
}

export async function assertPackedManifest(archive, expected) {
  const { stdout } = await run("tar", ["-xOf", archive, "package/package.json"]);
  const manifest = JSON.parse(stdout);
  const errors = validatePackedManifest(manifest, expected);
  if (errors.length > 0) throw new Error(errors.join("\n"));
}

export function validatePublicationEnvironment(environment) {
  const errors = validateNoPublicationOverrides(environment);
  if (environment.GITHUB_REPOSITORY !== "slicemedia/devkit") {
    errors.push("Publication is running in an unexpected repository.");
  }
  if (environment.GITHUB_REPOSITORY_VISIBILITY !== "public") {
    errors.push("Publication requires an explicitly public repository.");
  }
  if (environment.GITHUB_REF !== "refs/heads/main") {
    errors.push("Publication is restricted to refs/heads/main.");
  }
  if (environment.GITHUB_EVENT_NAME !== "workflow_dispatch") {
    errors.push("Publication requires an explicit workflow_dispatch event.");
  }
  if (environment.SLICEMEDIA_NPM_PUBLISH_NEXT_ENABLED !== "true") {
    errors.push("Publication requires SLICEMEDIA_NPM_PUBLISH_NEXT_ENABLED=true.");
  }
  if (environment.SLICEMEDIA_RELEASE_ENVIRONMENT !== "npm-next") {
    errors.push("Publication requires the protected npm-next environment.");
  }
  if (
    !/^[0-9a-f]{40}$/u.test(environment.GITHUB_SHA ?? "") ||
    environment.GITHUB_SHA !== environment.SLICEMEDIA_RELEASE_COMMIT
  ) {
    errors.push("Publication requires GITHUB_SHA to equal the approved release commit.");
  }
  if (
    environment.GITHUB_ACTIONS !== "true" ||
    !environment.ACTIONS_ID_TOKEN_REQUEST_URL?.trim() ||
    !environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN?.trim()
  ) {
    errors.push("Publication requires GitHub Actions OIDC.");
  }
  return errors;
}

export function validateReceiptShape(receipt, state, expectedCommit) {
  const errors = [];
  if (!exactKeys(receipt, receiptKeys)) {
    return ["Publication receipt does not match schema 1 exactly."];
  }
  if (receipt.schemaVersion !== 1) errors.push("Publication receipt has an unexpected schema.");
  if (receipt.npmVersion !== npmVersion) {
    errors.push(`Publication receipt must be prepared with npm ${npmVersion}.`);
  }
  if (receipt.pnpmVersion !== pnpmVersion) {
    errors.push(`Publication receipt must be prepared with pnpm ${pnpmVersion}.`);
  }
  if (!/^[0-9a-f]{40}$/u.test(expectedCommit ?? "") || receipt.sourceCommit !== expectedCommit) {
    errors.push("Publication receipt is not bound to the approved release commit.");
  }
  if (receipt.version !== state.version) {
    errors.push("Publication receipt does not match the fixed DevKit version.");
  }
  if (!Array.isArray(receipt.packages) || receipt.packages.length !== state.packages.length) {
    errors.push("Publication receipt must list the complete DevKit package family.");
    return errors;
  }
  for (const [index, expected] of state.packages.entries()) {
    const candidate = receipt.packages[index];
    if (!exactKeys(candidate, receiptPackageKeys)) {
      errors.push(`Publication receipt package ${index} does not match schema 1.`);
      continue;
    }
    if (
      candidate.name !== expected.name ||
      candidate.version !== state.version ||
      candidate.archive !== expected.archive
    ) {
      errors.push(`Publication receipt package ${index} has an unexpected identity or order.`);
    }
    if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(candidate.integrity ?? "")) {
      errors.push(`${expected.name} has an invalid integrity value.`);
    }
    if (!/^[0-9a-f]{40}$/u.test(candidate.shasum ?? "")) {
      errors.push(`${expected.name} has an invalid shasum.`);
    }
    if (!/^[0-9a-f]{64}$/u.test(candidate.treeDigest ?? "")) {
      errors.push(`${expected.name} has an invalid file-tree digest.`);
    }
  }
  return errors;
}

export async function inspectPublicationArtifact(expectedCommit) {
  const state = await readReleaseState();
  const expectedFiles = ["receipt.json", ...state.packages.map(({ archive }) => archive)].sort();
  const artifactEntries = await readdir(releaseDirectory, { withFileTypes: true });
  if (
    artifactEntries.some((entry) => !entry.isFile()) ||
    JSON.stringify(artifactEntries.map(({ name }) => name).sort()) !== JSON.stringify(expectedFiles)
  ) {
    throw new Error("Publication artifact must contain only the reviewed archives and receipt.");
  }
  const receiptPath = resolve(releaseDirectory, "receipt.json");
  const stats = await lstat(receiptPath);
  if (!stats.isFile() || stats.size <= 0 || stats.size > 32 * 1024) {
    throw new Error("Publication receipt must be a bounded regular file.");
  }
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  const errors = validateReceiptShape(receipt, state, expectedCommit);
  const candidates = [];
  if (errors.length === 0) {
    for (const [index, package_] of state.packages.entries()) {
      const archive = resolve(releaseDirectory, package_.archive);
      const metadata = await calculateArchiveMetadata(archive);
      await assertPackedManifest(archive, package_);
      const recorded = receipt.packages[index];
      if (
        metadata.integrity !== recorded.integrity ||
        metadata.shasum !== recorded.shasum ||
        metadata.treeDigest !== recorded.treeDigest
      ) {
        errors.push(`${package_.name} does not match its publication receipt.`);
      }
      candidates.push({ ...package_, archive, ...metadata });
    }
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return { candidates, receipt, state };
}

export async function verifySourceCommit(expectedCommit, { requireLiveMain = true } = {}) {
  if (!/^[0-9a-f]{40}$/u.test(expectedCommit ?? "")) {
    throw new Error("Release commit must be one full lowercase commit SHA.");
  }
  const [{ stdout: headOutput }, { stdout: statusOutput }] = await Promise.all([
    run("git", ["rev-parse", "--verify", "HEAD^{commit}"]),
    run("git", ["status", "--porcelain=v1", "--untracked-files=all"]),
  ]);
  const errors = [];
  if (headOutput.trim() !== expectedCommit) {
    errors.push("Checked-out HEAD does not match the approved release commit.");
  }
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== expectedCommit) {
    errors.push("GITHUB_SHA does not match the approved release commit.");
  }
  if (statusOutput.trim() !== "") errors.push("The publication checkout must remain clean.");
  if (requireLiveMain) {
    const { stdout } = await run("git", ["ls-remote", "--exit-code", "origin", "refs/heads/main"]);
    const rows = stdout.trim().split(/\r?\n/u).filter(Boolean);
    const [commit, reference, ...extra] = rows[0]?.split(/\s+/u) ?? [];
    if (
      rows.length !== 1 ||
      extra.length > 0 ||
      reference !== "refs/heads/main" ||
      commit !== expectedCommit
    ) {
      errors.push("The approved release commit is no longer the exact live origin/main tip.");
    }
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
}

export function validateRegistryMetadata(metadata, candidate) {
  const errors = [];
  if (metadata?.name !== candidate.name) errors.push("Registry package name does not match.");
  const published = metadata?.versions?.[candidate.version];
  if (published?.name !== candidate.name || published?.version !== candidate.version) {
    errors.push("Registry does not contain the exact published package version.");
  }
  if (published?.dist?.integrity !== candidate.integrity) {
    errors.push("Registry integrity does not match the approved archive.");
  }
  if (published?.dist?.shasum !== candidate.shasum) {
    errors.push("Registry shasum does not match the approved archive.");
  }
  try {
    const tarball = new URL(published?.dist?.tarball);
    if (tarball.origin !== "https://registry.npmjs.org") {
      errors.push("Registry metadata references an unexpected tarball origin.");
    }
  } catch {
    errors.push("Registry metadata is missing a valid HTTPS tarball URL.");
  }
  if (metadata?.["dist-tags"]?.next !== candidate.version) {
    errors.push("The npm next tag does not reference the approved version.");
  }
  return errors;
}
