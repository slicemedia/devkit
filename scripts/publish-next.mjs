import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
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

export function sanitizedEnvironment(source = process.env) {
  const environment = { ...source };
  for (const variable of prohibitedPublicationVariables) delete environment[variable];
  return environment;
}

export function createNpmPublishArguments(candidate, { globalConfig, userConfig }) {
  if (
    typeof userConfig !== "string" ||
    typeof globalConfig !== "string" ||
    !isAbsolute(userConfig) ||
    !isAbsolute(globalConfig)
  ) {
    throw new Error("npm publication configuration paths must be absolute.");
  }
  if (resolve(userConfig) === resolve(globalConfig)) {
    throw new Error("npm user and global configuration must use distinct files.");
  }
  return [
    "publish",
    candidate.archive,
    "--ignore-scripts",
    "--tag=next",
    "--access=public",
    "--provenance",
    `--registry=${npmRegistry}`,
    `--userconfig=${userConfig}`,
    `--globalconfig=${globalConfig}`,
  ];
}

export async function withIsolatedNpmConfigs(operation) {
  if (typeof operation !== "function") {
    throw new TypeError("An isolated npm configuration operation is required.");
  }
  const directory = await mkdtemp(join(tmpdir(), "slicemedia-devkit-npm-config-"));
  const userConfig = join(directory, "user.npmrc");
  const globalConfig = join(directory, "global.npmrc");
  try {
    await writeFile(userConfig, "", { flag: "wx", mode: 0o600 });
    await writeFile(globalConfig, "", { flag: "wx", mode: 0o600 });
    return await operation({ directory, globalConfig, userConfig });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function registryMetadata(name) {
  const response = await globalThis.fetch(`${npmRegistry}${encodeURIComponent(name)}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status} for ${name}.`);
  return response.json();
}

export async function publishCandidate(
  candidate,
  { environment = process.env, executeCommand = execute } = {},
) {
  await withIsolatedNpmConfigs(async (configs) => {
    await executeCommand("npm", createNpmPublishArguments(candidate, configs), {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: sanitizedEnvironment(environment),
      maxBuffer: 16 * 1024 * 1024,
    });
  });
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
    await publishCandidate(candidate);
    console.info(`Published exact ${candidate.name}@${candidate.version} with the next tag.`);
  }
  console.info(
    `Submitted all five DevKit ${state.version} archives; registry verification remains unprivileged.`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
