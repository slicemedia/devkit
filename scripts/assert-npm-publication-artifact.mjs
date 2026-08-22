import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  inspectPublicationArtifact,
  npmVersion,
  repositoryRoot,
  validatePublicationEnvironment,
  verifySourceCommit,
} from "./npm-publication-contract.mjs";

const execute = promisify(execFile);
const reviewedNpmrc =
  "engine-strict=true\nlink-workspace-packages=true\nprefer-workspace-packages=true\nsave-exact=true\n";

export async function assertNpmPublicationArtifact(environment = process.env) {
  const errors = validatePublicationEnvironment(environment);
  const npmrc = await readFile(resolve(repositoryRoot, ".npmrc"), "utf8");
  if (npmrc !== reviewedNpmrc) {
    errors.push("Repository .npmrc must match the reviewed credential-free configuration.");
  }
  try {
    const { stdout } = await execute("npm", ["--version"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    if (stdout.trim() !== npmVersion) {
      errors.push(`Publication requires npm ${npmVersion} exactly.`);
    }
  } catch (error) {
    errors.push(
      `Unable to verify npm ${npmVersion}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    await inspectPublicationArtifact(environment.SLICEMEDIA_RELEASE_COMMIT ?? "");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  try {
    await verifySourceCommit(environment.SLICEMEDIA_RELEASE_COMMIT ?? "");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (errors.length > 0) throw new Error([...new Set(errors)].join("\n"));
}

async function main() {
  try {
    await assertNpmPublicationArtifact();
    console.info("Exact DevKit archives and the protected OIDC boundary passed validation.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
