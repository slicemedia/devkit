# `@slicemedia/devkit`

The optional convenience package for Slice Media DevKit. Its root re-exports the side-effect-free
browser runtime from `@slicemedia/devkit-core`; the `@slicemedia/devkit/addon` subpath exposes addon
authoring primitives.

Install the current release candidate through the npm `next` tag:

```sh
npm install @slicemedia/devkit@next
pnpm add @slicemedia/devkit@next
yarn add @slicemedia/devkit@next
```

```ts
import { createBreakpointService, whenDomReady } from "@slicemedia/devkit";
import { defineAddon } from "@slicemedia/devkit/addon";
```

Importing either entry does not install a global runtime, initialize behavior, or load the optional
addon example. Applications that want the smallest dependency surface may continue to install and
import `@slicemedia/devkit-core` or `@slicemedia/devkit-addon` directly.

## Support and security

See Slice Media's [support policy](https://github.com/slicemedia/.github/blob/main/SUPPORT.md) for
help and maintenance expectations. Report vulnerabilities through the
[DevKit security policy](../../SECURITY.md), not a public issue.

## Project notice

Licensed under MIT. This package is independently developed by Slice Media and is not affiliated
with, endorsed by, or sponsored by Webflow, Inc. Webflow and related marks belong to their
respective owners. AI tools materially assisted its implementation and documentation; production
use still requires human review, accessibility and security checks, and project-specific testing.
