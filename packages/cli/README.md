# `@slicemedia/devkit-cli`

Local development, project builds, sanitization, addon metadata, and read-only Webflow inspection.
The CLI contains no Webflow write or publish commands.

Run the current release candidate directly through the npm `next` tag:

```sh
npm exec --package=@slicemedia/devkit-cli@next -- slicemedia-devkit help
pnpm dlx @slicemedia/devkit-cli@next help
yarn dlx @slicemedia/devkit-cli@next help
```

For repeated use, install it in a project and call `slicemedia-devkit` from that project's scripts,
or install it globally with `npm install --global @slicemedia/devkit-cli@next`.

```sh
slicemedia-devkit dev
slicemedia-devkit dev --origin https://testing.example.com
slicemedia-devkit build
slicemedia-devkit doctor
slicemedia-devkit catalog
slicemedia-devkit explain example
slicemedia-devkit sanitize
slicemedia-devkit webflow components --site "$SLICEMEDIA_WEBFLOW_SITE_ID"
slicemedia-devkit webflow scan --url https://example.webflow.io
```

`slicemedia-devkit build` recursively discovers `*.entry.ts` / `*.entry.js` (also TSX/MJS) under
`src/addons/` and optional `src/projects/`. Each becomes an independent ES2018 IIFE under
`dist/addons/` or `dist/projects/`, preserving subfolders and removing `.entry` from the filename,
with adjacent CSS when imported. `index.entry.ts` retains `index.js` inside its folder.
Legacy `src/addons/<name>.ts` and `src/addons/<name>/index.ts` formats retain their flat outputs;
unmarked nested helper files are not public bundles. Public names must remain unique across folders.
Shared vendor URLs resolve automatically from every output depth. Configured entries add metadata/custom paths;
they do not disable discovery of new addons. A build manifest lists the actual outputs.
Use `--out-dir` for another destination or an explicit `--entry` with `--script-file` and
`--css-file` for a single custom build. See [standalone builds](../../docs/standalone-builds.md).

Every command supports `--json`. API-backed inspection accepts `WEBFLOW_OAUTH_ACCESS_TOKEN` or
`WEBFLOW_API_TOKEN` where the endpoint permits it. Site custom-code scanning specifically requires
an OAuth access token.

`explain` prints the full Webflow contract, options, runtime API, and per-entry script snippets.
Use `--public-base-url` for production tags, `--out` to save Markdown, and
`catalog --manifest dist/webflow-scripts.json` to export a machine-readable handoff after building.
See [generated setup guides](../../docs/setup-guides.md).

`build --sourcemap` stores JavaScript maps privately under `.slicemedia/sourcemaps/`, outside
`dist/`, and omits map references from the production script. Deploy only the output directory.
See [private sourcemaps](../../docs/private-sourcemaps.md).

Declare project-owned vendor entries with `vendors: [{ name, input }]` in `devkit.config.json`.
The default build emits them once under `dist/vendor/`, alongside independent addon/project files;
the build manifest records both entry and vendor outputs. Deploy the complete output tree. The
dev server builds vendors at startup; restart after vendor changes. Loopback origins are allowed
by default; use repeatable `--origin` options for exact approved Webflow testing-page origins.
See [shared dependencies](../../docs/shared-dependencies.md) and [deployment](../../docs/deployment.md).

## Support and security

See Slice Media's [support policy](https://github.com/slicemedia/.github/blob/main/SUPPORT.md) for
help and maintenance expectations. Report vulnerabilities through the
[DevKit security policy](../../SECURITY.md), not a public issue.

## Project notice

Licensed under MIT. This package is independently developed by Slice Media and is not affiliated
with, endorsed by, or sponsored by Webflow, Inc. Webflow and related marks belong to their
respective owners. AI tools materially assisted its implementation and documentation; production
use still requires human review, accessibility and security checks, and project-specific testing.
