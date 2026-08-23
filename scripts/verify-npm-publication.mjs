import { Buffer } from "node:buffer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import {
  calculateArchiveMetadata,
  inspectPublicationArtifact,
  npmRegistry,
  validateRegistryMetadata,
  verifySourceCommit,
} from "./npm-publication-contract.mjs";

export const registryVerificationAttempts = 73;
export const registryVerificationDelayMilliseconds = 15_000;

async function fetchRegistryMetadata(name) {
  const response = await globalThis.fetch(`${npmRegistry}${encodeURIComponent(name)}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status} for ${name}.`);
  return response.json();
}

async function fetchVerifiedArchive(url, target) {
  const parsed = new URL(url);
  if (parsed.origin !== "https://registry.npmjs.org") {
    throw new Error("Refusing to download a release archive from an unexpected origin.");
  }
  const response = await globalThis.fetch(parsed, { redirect: "error" });
  if (!response.ok) throw new Error(`npm archive download returned HTTP ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > 100 * 1024 * 1024) {
    throw new Error("npm archive exceeds the verification size limit.");
  }
  const contents = Buffer.from(await response.arrayBuffer());
  if (contents.length <= 0 || contents.length > 100 * 1024 * 1024) {
    throw new Error("npm archive has an invalid verification size.");
  }
  await writeFile(target, contents, { flag: "wx", mode: 0o600 });
}

async function verifyCandidate(candidate, temporaryDirectory) {
  let latestError;
  for (let attempt = 1; attempt <= registryVerificationAttempts; attempt += 1) {
    try {
      const metadata = await fetchRegistryMetadata(candidate.name);
      const errors = validateRegistryMetadata(metadata, candidate);
      if (errors.length > 0) throw new Error(errors.join("\n"));
      const archive = resolve(temporaryDirectory, candidate.archive);
      await fetchVerifiedArchive(metadata.versions[candidate.version].dist.tarball, archive);
      const downloaded = await calculateArchiveMetadata(archive);
      if (
        downloaded.integrity !== candidate.integrity ||
        downloaded.shasum !== candidate.shasum ||
        downloaded.treeDigest !== candidate.treeDigest
      ) {
        throw new Error("Downloaded npm archive differs from the approved archive and file tree.");
      }
      return;
    } catch (error) {
      latestError = error;
      await rm(resolve(temporaryDirectory, candidate.archive), { force: true });
      if (attempt < registryVerificationAttempts) {
        await delay(registryVerificationDelayMilliseconds);
      }
    }
  }
  throw latestError;
}

async function main() {
  const releaseCommit = process.env.SLICEMEDIA_RELEASE_COMMIT ?? "";
  if (process.env.GITHUB_REPOSITORY !== "slicemedia/devkit") {
    throw new Error("Verification is running in an unexpected repository.");
  }
  if (process.env.GITHUB_REPOSITORY_VISIBILITY !== "public") {
    throw new Error("Verification requires the public release repository.");
  }
  await verifySourceCommit(releaseCommit, { requireLiveMain: false });
  const { candidates, state } = await inspectPublicationArtifact(releaseCommit);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "slicemedia-devkit-verify-"));
  try {
    for (const candidate of candidates) {
      await verifyCandidate(candidate, temporaryDirectory);
      console.info(
        `Verified ${candidate.name}@${candidate.version} integrity and complete file tree from npm.`,
      );
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
  console.info(
    `Verified all five DevKit ${state.version} archives without OIDC; no tag, GitHub Release, or latest promotion was created.`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
