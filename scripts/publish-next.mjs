import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  inspectPublicationArtifact,
  npmRegistry,
  prohibitedPublicationVariables,
  repositoryRoot,
  validatePublicationEnvironment,
  validateRegistryMetadata,
  verifySourceCommit,
} from "./npm-publication-contract.mjs";

const execute = promisify(execFile);

function sanitizedEnvironment() {
  const environment = { ...process.env };
  for (const variable of prohibitedPublicationVariables) delete environment[variable];
  return environment;
}

async function registryMetadata(name) {
  const response = await globalThis.fetch(`${npmRegistry}${encodeURIComponent(name)}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status} for ${name}.`);
  return response.json();
}

async function publish(candidate) {
  await execute(
    "npm",
    [
      "publish",
      candidate.archive,
      "--ignore-scripts",
      "--tag=next",
      "--access=public",
      "--provenance",
      `--registry=${npmRegistry}`,
      "--userconfig=/dev/null",
      "--globalconfig=/dev/null",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: sanitizedEnvironment(),
      maxBuffer: 16 * 1024 * 1024,
    },
  );
}

async function main() {
  const environmentErrors = validatePublicationEnvironment(process.env);
  if (environmentErrors.length > 0) throw new Error(environmentErrors.join("\n"));
  const releaseCommit = process.env.SLICEMEDIA_RELEASE_COMMIT ?? "";
  const { candidates, state } = await inspectPublicationArtifact(releaseCommit);

  for (const candidate of candidates) {
    const metadata = await registryMetadata(candidate.name);
    if (metadata?.versions?.[candidate.version] !== undefined) {
      const errors = validateRegistryMetadata(metadata, candidate);
      if (errors.length > 0) {
        throw new Error(
          `${candidate.name}@${candidate.version} already exists but is not the approved archive:\n${errors.join("\n")}`,
        );
      }
      console.info(`Keeping exact existing ${candidate.name}@${candidate.version}.`);
      continue;
    }

    await verifySourceCommit(releaseCommit);
    await publish(candidate);
    console.info(`Published exact ${candidate.name}@${candidate.version} with the next tag.`);
  }
  console.info(
    `Submitted all five DevKit ${state.version} archives; registry verification remains unprivileged.`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
