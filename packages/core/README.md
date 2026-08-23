# `@slicemedia/devkit-core`

Side-effect-free addon lifecycle, event, DOM, breakpoint, viewport, asset, and CSS utilities for
Webflow browser code.

Install the `0.1.0` release candidate through the npm `next` tag:

```sh
npm install @slicemedia/devkit-core@next
pnpm add @slicemedia/devkit-core@next
yarn add @slicemedia/devkit-core@next
```

`defineAddon()` declares serializable metadata and lifecycle hooks. `createAddon()` returns an inert
instance with `init`, `refresh`, `destroy`, `setOptions`, `getState`, and `on`. Consumer projects
decide what to initialize and bundle. Importing the package never registers a global; the queue and
duplicate-version runtime is available only through an explicit `installDevKitRuntime()`
call and no standalone global build is shipped.

## Support and security

See Slice Media's [support policy](https://github.com/slicemedia/.github/blob/main/SUPPORT.md) for
help and maintenance expectations. Report vulnerabilities through the
[DevKit security policy](../../SECURITY.md), not a public issue.

## Project notice

Licensed under MIT. This package is independently developed by Slice Media and is not affiliated
with, endorsed by, or sponsored by Webflow, Inc. Webflow and related marks belong to their
respective owners. AI tools materially assisted its implementation and documentation; production
use still requires human review, accessibility and security checks, and project-specific testing.
