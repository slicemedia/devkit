# `@slicemedia/devkit-core`

Side-effect-free addon lifecycle, event, DOM, breakpoint, viewport, asset, and CSS utilities for
Webflow browser code.

Install the current release candidate through the npm `next` tag:

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

Opt-in `observeViewportEntryOnce`, `observeElementVisibility`, and `createLayoutRefreshGuard`
support deferred work, visibility-based animation control, and refreshes after late layout changes.
The guard supports optional window-load settling passes and reason/count diagnostics.
`loadSharedModule()` and `registerSharedModule()` share project vendor APIs across independent
addon bundles; `loadAssetOnce()` shares pending loads and security checks per document.
See [shared dependencies](../../docs/shared-dependencies.md).
An explicitly installed window runtime exposes cancellable `whenReady(name, callback)` subscribers;
registered APIs are available directly as `window.slicemediaDevKit.counter`, for example.
Addon instances emit named `init`, `refresh`, and `destroy` completion events alongside
`status`, `options`, `error`, and authored custom events. The existing `ready` promise still waits
for its queue. See [runtime helpers](../../docs/runtime-helpers.md).

The separate optional [`@slicemedia/devtools` package](../devtools/README.md) provides
`createDevTools()` and `inspectDevKit()`: an on-page addon inspector and a read-only attribute audit.
Core does not install or bundle it. See the [DevTools guide](../../docs/devtools.md)
for standalone setup, staging activation, console opt-in on production, saved window preferences,
and scoped markup contracts.

## Support and security

See Slice Media's [support policy](https://github.com/slicemedia/.github/blob/main/SUPPORT.md) for
help and maintenance expectations. Report vulnerabilities through the
[DevKit security policy](../../SECURITY.md), not a public issue.

## Project notice

Licensed under MIT. This package is independently developed by Slice Media and is not affiliated
with, endorsed by, or sponsored by Webflow, Inc. Webflow and related marks belong to their
respective owners. AI tools materially assisted its implementation and documentation; production
use still requires human review, accessibility and security checks, and project-specific testing.

The [inspection API](../../docs/inspection-api.md) exposes conditional markup requirements, shared
per-root option resolution, and read-only diagnostics. `initializeAddon(runtime, instance)` keeps
failed startup visible to inspection while preserving public API readiness. The side-effect-free
`@slicemedia/devkit-core/inspection` entry exposes contract validation and resolution helpers for
independent inspectors. The separate DevTools package owns the standalone browser artifact; see
[production inclusion](../devtools/README.md#use-without-a-local-server).
