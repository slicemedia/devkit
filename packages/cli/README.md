# `@slicemedia/devkit-cli`

Local development, project builds, sanitization, addon metadata, and read-only Webflow inspection.
The CLI contains no Webflow write or publish commands.

```sh
slicemedia-devkit dev
slicemedia-devkit build
slicemedia-devkit doctor
slicemedia-devkit catalog
slicemedia-devkit explain example
slicemedia-devkit sanitize
slicemedia-devkit webflow components --site "$SLICEMEDIA_WEBFLOW_SITE_ID"
slicemedia-devkit webflow scan --url https://example.webflow.io
```

`slicemedia-devkit build` compiles `src/main.ts` into `dist/project.js` as one ES2018 IIFE. If the entry imports
CSS, it also emits `dist/project.css`. Paths can be changed with `--entry`, `--out-dir`,
`--script-file`, and `--css-file`.

Every command supports `--json`. API-backed inspection accepts `WEBFLOW_OAUTH_ACCESS_TOKEN` or
`WEBFLOW_API_TOKEN` where the endpoint permits it. Site custom-code scanning specifically requires
an OAuth access token.

## Project notice

Licensed under MIT. This package is independently developed by Slice Media and is not affiliated
with, endorsed by, or sponsored by Webflow, Inc. Webflow and related marks belong to their
respective owners. AI tools materially assisted its implementation and documentation; production
use still requires human review, accessibility and security checks, and project-specific testing.
