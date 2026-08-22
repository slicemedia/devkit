import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  assertPackedManifest,
  calculateArchiveMetadata,
  inspectPublicationArtifact,
  npmVersion,
  pnpmVersion,
  readReleaseState,
  releaseDirectory,
  repositoryRoot,
  validateNoPublicationOverrides,
  verifySourceCommit,
} from "./npm-publication-contract.mjs";

const execute = promisify(execFile);

async function run(command, arguments_, cwd = repositoryRoot) {
  return execute(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
}

export function validatePackResult(result, expected, expectedArchive) {
  const errors = [];
  if (result?.name !== expected.name) errors.push("pnpm pack returned an unexpected package name.");
  if (result?.version !== expected.version)
    errors.push("pnpm pack returned an unexpected version.");
  if (
    typeof result?.filename !== "string" ||
    resolve(result.filename) !== resolve(expectedArchive)
  ) {
    errors.push("pnpm pack returned an unexpected archive path.");
  }
  return errors;
}

async function main() {
  const overrideErrors = validateNoPublicationOverrides(process.env);
  if (overrideErrors.length > 0) throw new Error(overrideErrors.join("\n"));
  const currentNpmVersion = (await run("npm", ["--version"])).stdout.trim();
  if (currentNpmVersion !== npmVersion) {
    throw new Error(`Release archives require npm ${npmVersion} exactly.`);
  }
  const currentPnpmVersion = (await run("pnpm", ["--version"])).stdout.trim();
  if (currentPnpmVersion !== pnpmVersion) {
    throw new Error(`Release archives require pnpm ${pnpmVersion} exactly.`);
  }
  const releaseCommit = process.env.SLICEMEDIA_RELEASE_COMMIT ?? "";
  await verifySourceCommit(releaseCommit);
  const state = await readReleaseState();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "slicemedia-devkit-pack-"));
  try {
    await rm(releaseDirectory, { force: true, recursive: true });
    await mkdir(releaseDirectory, { mode: 0o700 });
    const receiptPackages = [];
    for (const package_ of state.packages) {
      const temporaryArchive = resolve(temporaryDirectory, package_.archive);
      const { stdout } = await run(
        "pnpm",
        ["pack", "--out", temporaryArchive, "--json"],
        resolve(repositoryRoot, package_.directory),
      );
      const parsed = JSON.parse(stdout);
      if (!Array.isArray(parsed) || parsed.length !== 1) {
        throw new Error(`${package_.name} must produce exactly one npm archive.`);
      }
      const result = parsed[0];
      const metadata = await calculateArchiveMetadata(temporaryArchive);
      const errors = validatePackResult(result, package_, temporaryArchive);
      if (errors.length > 0) throw new Error(errors.join("\n"));
      await assertPackedManifest(temporaryArchive, package_);
      await copyFile(
        temporaryArchive,
        resolve(releaseDirectory, package_.archive),
        constants.COPYFILE_EXCL,
      );
      receiptPackages.push({
        archive: package_.archive,
        integrity: metadata.integrity,
        name: package_.name,
        shasum: metadata.shasum,
        treeDigest: metadata.treeDigest,
        version: state.version,
      });
    }
    await writeFile(
      resolve(releaseDirectory, "receipt.json"),
      `${JSON.stringify(
        {
          npmVersion,
          packages: receiptPackages,
          pnpmVersion,
          schemaVersion: 1,
          sourceCommit: releaseCommit,
          version: state.version,
        },
        null,
        2,
      )}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await inspectPublicationArtifact(releaseCommit);
    await verifySourceCommit(releaseCommit);
    console.info(
      `Prepared five commit-bound DevKit ${state.version} archives for protected publication.`,
    );
  } catch (error) {
    await rm(releaseDirectory, { force: true, recursive: true });
    throw error;
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
