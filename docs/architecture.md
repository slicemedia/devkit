# Architecture

The default generated project contains the core runtime, local CLI, an optional neutral `src/main.ts`, and no
feature behavior. Wizard choices add independent branches:

```text
slider              -> Slice Media Swiper Adapter -> upstream Swiper
animations          -> GSAP
tooltips             -> Tippy.js
DigitalOcean Spaces -> Slice Media Spaces Deployer
agent target         -> Slice Media Agent Kit -> only the selected platform files
```

Existing projects may install the `@slicemedia/devkit` convenience entry, which re-exports the core
runtime and exposes addon authoring through `@slicemedia/devkit/addon`. It adds no initialization or
global behavior; projects that prefer the narrowest dependency surface may keep importing core and
addon packages directly.

DevKit package imports are ESM and side-effect-free. Consumer browser entries explicitly initialize
and register their selected behavior. Each public addon under `src/addons/` builds into its own
standalone ES2018 IIFE at `dist/addons/<name>.js`, with `dist/addons/<name>.css` when needed.
Shared imports are bundled into each script so a Webflow page can load any addon independently.
No separate shared runtime script or universal site bundle is required. All entries on a page reuse
the version-checked `window.slicemediaDevKit` runtime when explicitly installed, exposing named APIs
such as `window.slicemediaDevKit.counter` and readiness callbacks through `whenReady()`.

Optional entries under `src/projects/` build to `dist/projects/<name>.js`; they compose only the
behavior deliberately selected for that entry. The starter's `src/main.ts` is an explicitly
configured neutral project entry, not a collector of addons. The default build discovers new addons
even when project entries are configured. The build clears output once, emits each script and its
optional CSS independently, then writes an artifact manifest. Production sourcemaps remain outside
the deployable tree. See [standalone builds](standalone-builds.md) for conventions and migration.

The three optional products
are maintained in independent repositories and versions; DevKit references them only when selected.
No package installs globals on import, chooses hosting, or writes Webflow state.

Webflow remains responsible for editable structure, components, CMS, and base styles. Custom
animation work normally belongs to a GSAP addon with its own timeline, scroll coordination, and
lifecycle. Explicit user choices take precedence; simple CSS effects and straightforward
Designer-owned Interactions remain suitable alternatives. Selecting GSAP does not depend on
native Interactions being unable to reproduce the effect. See
[animation authoring](animation-authoring.md).

The official Webflow MCP server handles explicitly requested remote inspection and changes; the
DevKit CLI remains local or read-only.
