# Release process

## Version preparation

DevKit uses Changesets for semantic versioning. Add a changeset with `pnpm changeset` for every
publishable change. The five DevKit packages are one fixed version group; the private
`webflow-project` starter fixture is excluded from versioning.

The initial public baseline is already versioned as `0.1.0`. Its development history is
consolidated in the root `CHANGELOG.md` and has no pending Changesets. Publish that reviewed
baseline directly; do not run a version-preparation step for it. Every publishable change after the
baseline requires a new Changeset.

`pnpm version-packages` is the only supported version command. It applies Changesets, synchronizes
the runtime and creator defaults from the resulting package version, updates the lockfile, and
verifies consistency. `pnpm version:check` fails when package manifests, generated version modules,
the fixed group, or the external-product compatibility configuration disagree.

Agent Kit, Swiper Adapter, and Spaces Deployer keep independent versions and Changesets histories.
Their compatible ranges live in `config/external-products.json`; changing one requires a creator
changeset but never versions the external repository.

For a coordinated release, prepare and verify the three independent product versions first. Then
update their compatible ranges, add a creator changeset, and rerun the full-family candidate matrix
before merging the DevKit version PR. This ordering matters for `0.x`: a caret range such as
`^0.1.0` does not accept `0.2.0`. Never merge a DevKit release whose generated dependencies exclude
the external versions being published.

The `Release PR` workflow is intentionally version-only. It may create a draft Changesets release
PR only from a push to `main`; manual dispatch is not supported, so a branch-controlled ref cannot
start the write-capable job. The version job also requires the repository variable
`SLICEMEDIA_RELEASE_PR_ENABLED` to equal `true`. Keep it disabled until the organization and
repository policies allow GitHub Actions to create pull requests. A push may trigger the workflow
while the variable is disabled, but the version job skips without running.

The workflow has no npm credential, npm publication command, OIDC permission, tag creation, or
GitHub Release step. Its structural safety check requires an explicit private or public repository
state and rejects npm credentials, extra jobs or steps, and changes to the exact trigger,
permission, action, command, or version-input schema. Changing package visibility cannot add
publication authority to this workflow.

Before the first npm `next` prerelease, run `pnpm check`, `pnpm test:release-candidate`, package
dry-runs, and `pnpm sanitize -- --json`. Inspect source, adapters, bundles, ZIPs, tarballs, logs, and
reachable Git history for secrets or forbidden identifiers. Private denylist matches include their
literal, exact UTF-8 base64, and exact UTF-8 hex forms; reports contain rule indices rather than the
private values. The automated packed-consumer and neutral-project matrix gates the first
prerelease; it does not claim to replace later production evidence.

Public-fork pull requests run generic secret, naming, generated-output, and archive rules without
receiving the private denylist. CI never uses `pull_request_target`. A separate trusted `push` to
`main` enters the main-only `release-sanitize` environment, repeats both source/history and
package-archive scans with private rules, and fails closed unless that denylist contains at least
one valid term. Publication preparation uses the same environment and repeats the requirement
before any checked-out repository script runs.

The release-candidate gate packs DevKit locally, scaffolds neutral projects for pnpm 11.21, npm 10
or 11, and Yarn 4, and installs, typechecks, builds, and sanitizes neutral, individual-capability,
all-capability, and all-agent-target shapes. Ordinary DevKit CI runs it at the Node 22.13 floor and
on Node 24 and uses clearly labeled synthetic contract tarballs for independent products. Unit,
type, build, and scaffolding checks additionally run on Windows at Node 22.13 and on Node 24.

A coordinated product-family candidate must instead supply all three real package archives and use
fail-closed full-family mode:

```sh
SLICEMEDIA_AGENT_KIT_TARBALL=/path/to/agent-kit.tgz \
SLICEMEDIA_SWIPER_ADAPTER_TARBALL=/path/to/swiper-adapter.tgz \
SLICEMEDIA_SPACES_DEPLOYER_TARBALL=/path/to/spaces-deployer.tgz \
pnpm test:release-candidate -- --full-family
```

The equivalent CLI options are `--agent-kit-tarball`, `--swiper-adapter-tarball`, and
`--spaces-deployer-tarball`. Paths are always explicit and never stored in the repository. The gate
validates each archive's package name and configured semver range. Full-family mode rejects missing
archives rather than falling back to contract fixtures.

Use the first real client projects after the initial `next` prerelease as controlled pilots. Record
problems, add regression coverage, and publish fixes as further immutable `0.x` versions under
`next`. Do not promote any artifact to `latest` until those pilots and the public-readiness review
pass.

DevKit packages use MIT. Generated client projects remain project-owned and do not receive an
automatic license. Publish immutable `0.x` release candidates only after naming, ownership, sanitization,
and the automated project matrix are complete. Agent Kit, Swiper Adapter, and Spaces Deployer have independent
release gates and must not be published implicitly by a DevKit release.

The five DevKit packages are versioned together so one DevKit version selects compatible
convenience, core, addon, CLI, and creator releases.

## First-package bootstrap

npm can attach a trusted publisher only after a package exists in the registry. For each of the
five package names, the one-time bootstrap operation publishes a reviewed, minimal identity archive
with public access as `0.0.0-bootstrap.0` under the non-default `bootstrap` tag. A bootstrap archive contains only the
package identity, license, repository metadata, and an explanatory README; it contains no DevKit
runtime, executable, install script, dependency, or credential. Inspect its dry-run and tarball
before the one-time publish.

Never assign `latest` or `next` to a bootstrap version, never install it from generated projects,
and never reuse it as a release artifact. After all names exist, configure the exact
`slicemedia/devkit` GitHub repository and `.github/workflows/publish-next.yml` workflow as trusted
publishers in npm, with the `npm publish` action explicitly allowed. Require two-factor authentication for the npm organization before bootstrapping
and revoke any temporary publication credential if one was created. Normal DevKit releases use
GitHub OIDC trusted publishing; they do not use a stored npm token.

## npm `next` activation

The separate `Publish npm prerelease` workflow fails closed until all of these reviewed conditions
are complete:

1. Keep the root workspace and generated starter explicitly private, while each of the five
   publishable package manifests explicitly sets `private` to `false`. Do not remove the field: the
   publication contract requires explicit public intent.
2. Make the repository public, complete the one-time bootstrap above, and configure this exact
   workflow as the npm trusted publisher for all five packages with the `npm publish` action
   explicitly allowed.
3. Keep the `slicemedia` npm organization protected by enforced two-factor authentication.
4. Keep the GitHub `release-sanitize` environment restricted to protected `main` and store the
   nonempty `SLICEMEDIA_FORBIDDEN_TERMS` environment secret only there.
5. Keep the GitHub `npm-next` environment restricted to protected `main` with required approval.
6. Set the repository variable `SLICEMEDIA_NPM_PUBLISH_NEXT_ENABLED=true` only for an approved
   release.
7. Dispatch the workflow with the full 40-character commit SHA currently at `origin/main`.

The workflow separates authority into three jobs. The preparation job has no OIDC permission and
uses only the `release-sanitize` environment. Before dependency installation or any checked-out
repository script runs, a dependency-free check rejects npm token, registry, and user-configuration
overrides and proves that the requested commit, event commit, checkout, and live remote `main` tip
are identical. It requires the private release denylist, runs the complete project and real-registry
candidate matrices, packs the fixed package family with pinned pnpm, and sanitizes source, Git
history, generated output, and the resulting tarballs. It uploads only five immutable tarballs plus
a short commit-, integrity-, and file-tree-bound receipt. The denylist secret is never added to that
artifact, the `npm-next` publication job, or any later job.

Only the minimal publication job enters the protected `npm-next` environment and receives GitHub
OIDC. It installs pinned npm 11.19.0 with lifecycle scripts disabled, downloads the artifact from the
same workflow attempt, verifies every receipt and archive using dependency-free repository code,
and repeats the live-main, approved-SHA, clean-tree, npm-version, and configuration checks
immediately before publication. No repository dependencies, build, tests, pack command, private
denylist, or long-lived npm token enter this job. Each package publish uses the exact prepared
tarball, an explicit `https://registry.npmjs.org/` boundary, disabled lifecycle scripts, public
access, provenance, and only the `next` tag. The source proof repeats before every actual write so a
main-branch change stops the remaining publications.

After publication, a third job with no OIDC permission downloads the same artifact and reads every
version back from the public registry. It compares npm integrity, shasum, exact archive bytes, and a
complete sorted file-tree digest with the preparation receipt. The workflow creates no Git tag,
GitHub Release, or `latest` promotion.

After the first verified OIDC release, set each package's npm Publishing access to require
two-factor authentication and disallow tokens. Trusted publishing is additive, so these package
settings close token-based publication paths outside the reviewed workflow.

Publication order is dependency-safe: core, addon, CLI, creator, then the `@slicemedia/devkit`
convenience package. Only after all five npm archives have been read back and verified should a
separate, explicitly approved operation create matching Git tags and GitHub Releases from the exact
published commit. Promotion to `latest` must retag those existing npm artifacts rather than rebuild
them.

For the first coordinated release, publish and verify Agent Kit, Swiper Adapter, and Spaces Deployer
under `next` first. Update `config/external-products.json` to their exact compatible release lines,
run `pnpm test:registry-release-candidate`, and only then publish DevKit. The registry candidate gate
never falls back to synthetic fixtures.

## Platform support

Maintained DevKit releases support Node 22.13+ and Node 24; odd-numbered and end-of-life Node lines
are intentionally excluded. The CLI, wizard, lifecycle packages, and generated builds are tested on
Linux, macOS through local development, and Windows through CI. Shell-specific deployment,
Webflow-account configuration, browser policy, and hosting credentials remain project-owned and
outside DevKit's support boundary.
