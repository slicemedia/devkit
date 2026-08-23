# `@slicemedia/devkit-core`

Side-effect-free addon lifecycle, event, DOM, breakpoint, viewport, asset, and CSS utilities for
Webflow browser code.

`defineAddon()` declares serializable metadata and lifecycle hooks. `createAddon()` returns an inert
instance with `init`, `refresh`, `destroy`, `setOptions`, `getState`, and `on`. Consumer projects
decide what to initialize and bundle. Importing the package never registers a global; the queue and
duplicate-version runtime is available only through an explicit `installDevKitRuntime()`
call and no standalone global build is shipped.

## Project notice

Licensed under MIT. This package is independently developed by Slice Media and is not affiliated
with, endorsed by, or sponsored by Webflow, Inc. Webflow and related marks belong to their
respective owners. AI tools materially assisted its implementation and documentation; production
use still requires human review, accessibility and security checks, and project-specific testing.
