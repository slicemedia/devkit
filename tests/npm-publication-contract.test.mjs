import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  calculateArchiveHashes,
  packageDefinitions,
  readReleaseState,
  validateNoPublicationOverrides,
  validatePackedManifest,
  validatePublicationEnvironment,
  validateReceiptShape,
  validateRegistryMetadata,
} from "../scripts/npm-publication-contract.mjs";
import { validatePackResult } from "../scripts/prepare-npm-publication.mjs";

const commit = "1".repeat(40);
const version = "0.2.0";
const state = {
  version,
  packages: packageDefinitions.map((definition) => ({ ...definition, version })),
};
const packages = state.packages.map((package_, index) => ({
  archive: package_.archive,
  integrity: `sha512-${Buffer.from(`integrity-${index}`).toString("base64")}`,
  name: package_.name,
  shasum: String(index + 1).repeat(40),
  treeDigest: String(index + 1).repeat(64),
  version,
}));
const receipt = {
  npmVersion: "11.19.0",
  packages,
  pnpmVersion: "11.21.0",
  schemaVersion: 1,
  sourceCommit: commit,
  version,
};

function packedManifest(package_) {
  return {
    name: package_.name,
    version,
    private: false,
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/slicemedia/devkit.git",
      directory: package_.directory,
    },
    homepage: package_.homepage,
    bugs: { url: "https://github.com/slicemedia/devkit/issues" },
    keywords: [...package_.keywords],
    engines: { node: ">=22.13.0 <23 || >=24.0.0 <25" },
    dependencies: Object.fromEntries(package_.internalDependencies.map((name) => [name, version])),
    publishConfig: { access: "public", provenance: true },
  };
}

describe("npm publication contract", () => {
  it("accepts the reviewed source metadata while packages remain private", async () => {
    const releaseState = await readReleaseState({ requirePublic: false });
    expect(releaseState.packages).toHaveLength(packageDefinitions.length);
  });

  it("binds the complete ordered package family to one commit", () => {
    expect(validateReceiptShape(receipt, state, commit)).toEqual([]);
    expect(
      validateReceiptShape({ ...receipt, packages: [...packages].reverse() }, state, commit),
    ).not.toEqual([]);
    expect(validateReceiptShape(receipt, state, "2".repeat(40))).not.toEqual([]);
    expect(validateReceiptShape({ ...receipt, unexpected: true }, state, commit)).not.toEqual([]);
  });

  it("rejects credential and registry overrides in either common casing", () => {
    expect(validateNoPublicationOverrides({ NODE_AUTH_TOKEN: "synthetic" })).not.toEqual([]);
    expect(
      validateNoPublicationOverrides({ npm_config_registry: "https://example.test" }),
    ).not.toEqual([]);
    expect(validateNoPublicationOverrides({})).toEqual([]);
  });

  it("requires the explicit public protected OIDC environment", () => {
    const environment = {
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic-oidc-request-token",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.test/oidc",
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: "slicemedia/devkit",
      GITHUB_REPOSITORY_VISIBILITY: "public",
      GITHUB_SHA: commit,
      SLICEMEDIA_NPM_PUBLISH_NEXT_ENABLED: "true",
      SLICEMEDIA_RELEASE_COMMIT: commit,
      SLICEMEDIA_RELEASE_ENVIRONMENT: "npm-next",
    };
    expect(validatePublicationEnvironment(environment)).toEqual([]);
    expect(
      validatePublicationEnvironment({ ...environment, SLICEMEDIA_RELEASE_ENVIRONMENT: "other" }),
    ).not.toEqual([]);
    expect(
      validatePublicationEnvironment({ ...environment, NPM_CONFIG_USERCONFIG: "fixture" }),
    ).not.toEqual([]);
  });

  it.each(packageDefinitions)(
    "accepts the exact packed internal dependency and metadata contract for $name",
    (package_) => {
      expect(validatePackedManifest(packedManifest(package_), { ...package_, version })).toEqual(
        [],
      );
    },
  );

  it.each(["*", "latest", "https://example.test/core.tgz", "0.2.1", "^0.2.0", "nope"])(
    "rejects the packed internal dependency range %j",
    (range) => {
      const package_ = packageDefinitions.find(({ name }) => name === "@slicemedia/devkit-addon");
      const manifest = packedManifest(package_);
      manifest.dependencies["@slicemedia/devkit-core"] = range;
      expect(validatePackedManifest(manifest, { ...package_, version })).not.toEqual([]);
    },
  );

  it("rejects missing, unexpected, renamed, or misplaced internal dependencies", () => {
    const package_ = packageDefinitions.find(({ name }) => name === "@slicemedia/devkit-addon");
    const expected = { ...package_, version };

    const missing = packedManifest(package_);
    delete missing.dependencies["@slicemedia/devkit-core"];
    expect(validatePackedManifest(missing, expected)).not.toEqual([]);

    const unexpected = packedManifest(package_);
    unexpected.dependencies["@slicemedia/devkit-cli"] = version;
    expect(validatePackedManifest(unexpected, expected)).not.toEqual([]);

    const renamed = packedManifest(package_);
    delete renamed.dependencies["@slicemedia/devkit-core"];
    renamed.dependencies["@slicemedia/devkit-cor"] = version;
    expect(validatePackedManifest(renamed, expected)).not.toEqual([]);

    const misplaced = packedManifest(package_);
    delete misplaced.dependencies["@slicemedia/devkit-core"];
    misplaced.peerDependencies = { "@slicemedia/devkit-core": version };
    expect(validatePackedManifest(misplaced, expected)).not.toEqual([]);
  });

  it.each(["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"])(
    "rejects an internal npm alias hidden in packed %s",
    (section) => {
      const package_ = packageDefinitions.find(({ name }) => name === "@slicemedia/devkit-core");
      const manifest = packedManifest(package_);
      manifest[section] = {
        "internal-alias": `npm:@slicemedia/devkit-addon@${version}`,
      };
      expect(validatePackedManifest(manifest, { ...package_, version })).not.toEqual([]);
    },
  );

  it.each([
    ["license", (manifest) => (manifest.license = "ISC")],
    ["repository", (manifest) => (manifest.repository.url = "https://example.test/repo")],
    ["keywords", (manifest) => manifest.keywords.pop()],
    ["engines", (manifest) => (manifest.engines.node = ">=18")],
  ])("rejects altered packed %s metadata", (_label, mutate) => {
    const package_ = packageDefinitions[0];
    const manifest = packedManifest(package_);
    mutate(manifest);
    expect(validatePackedManifest(manifest, { ...package_, version })).not.toEqual([]);
  });

  it("checks npm pack and registry identities against the approved bytes", () => {
    const contents = Buffer.from("neutral archive fixture");
    const hashes = calculateArchiveHashes(contents);
    const candidate = {
      ...state.packages[0],
      ...hashes,
      treeDigest: "a".repeat(64),
    };
    expect(
      validatePackResult(
        {
          filename: "/tmp/devkit-core.tgz",
          name: candidate.name,
          version,
        },
        candidate,
        "/tmp/devkit-core.tgz",
      ),
    ).toEqual([]);

    const metadata = {
      name: candidate.name,
      "dist-tags": { next: version },
      versions: {
        [version]: {
          name: candidate.name,
          version,
          dist: {
            integrity: hashes.integrity,
            shasum: hashes.shasum,
            tarball: "https://registry.npmjs.org/@slicemedia/devkit-core/-/devkit-core-0.2.0.tgz",
          },
        },
      },
    };
    expect(validateRegistryMetadata(metadata, candidate)).toEqual([]);
    expect(
      validateRegistryMetadata(
        {
          ...metadata,
          versions: {
            [version]: {
              ...metadata.versions[version],
              dist: { ...metadata.versions[version].dist, tarball: "https://example.test/a.tgz" },
            },
          },
        },
        candidate,
      ),
    ).not.toEqual([]);
  });
});
