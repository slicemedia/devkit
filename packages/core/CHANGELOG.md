# @slicemedia/devkit-core

## 0.5.1

## 0.5.0

### Minor Changes

- 885dbac: Share on-demand vendor JavaScript and CSS across standalone addon bundles, with declared vendor builds and asynchronous generated integrations. Restore window-load settling and refresh diagnostics; fix pending asset readiness, cross-bundle caching, stale breakpoint subscriptions, mobile viewport lengths, build-accurate CSS guides, and explicit local-development origins. Align slider and deployment documentation with Swiper defaults and the complete deployable artifact tree.

### Patch Changes

- 56d2ae0: Discover marked browser entries recursively and preserve their folder paths in standalone JavaScript, CSS, manifests, and setup guides. Calculate shared vendor URLs for each output depth and for local development. Retain legacy entry conventions and document the entry marker, naming, and deployment rules in generated projects.

## 0.4.0

### Minor Changes

- 68f7010: Extract the inspector into the optional, independently versioned `@slicemedia/devtools` package
  with ESM exports, TypeScript declarations, package documentation, and a standalone browser build.
  Select it during project creation or install it later; existing project addon/CDN hosting continues
  to work without a local server. Move the earlier development DevTools subpaths out of core and the
  convenience package, while keeping shared inspection contracts and helpers in core.

  Preserve legal notices in standalone builds, including the DevTools icon licenses.

- 68f7010: Expose conditional markup requirements, count and key relationships, shared per-root option
  resolution, and read-only runtime diagnostics. Keep failed initialization inspectable with
  initializeAddon, and show unknown or failing providers as unverified. Share constraints with
  explain/catalog and report missing contracts in doctor.

  Ship a standalone devtools.global.js browser artifact in the separate DevTools package with production opt-in, add an optional
  DevTools creator capability, and include inert authoring templates for future addons.

- 68f7010: Add the optional `@slicemedia/devtools` package with an explicitly mounted on-page inspector, addon and attribute
  inventories, scoped markup checks, read-only element highlighting, and a bottom-center Webflow
  launcher that rises on hover and tucks away after two seconds. The draggable panel includes
  an opacity control, Lucide toolbar icons, independent addon navigation and detail scrolling,
  and a collapsible, resizable unclaimed-attribute inventory. Existing root imports and generated project
  behavior are unchanged.

  Warn about repeated addon registrations with matching or overlapping scopes and repeated external
  script URLs, while allowing independent component instances and reporting include evidence without
  claiming that scripts executed twice.

  Resize the window from all edges and corners and remember its dimensions and opacity after explicit
  interaction. Initialize automatically on Webflow staging domains, with a persistent
  `window.DevKitDevTools.enabled` flag for other origins. Dormant production startup only registers
  the console API and reads existing preferences: no inspector UI, scans, listeners, timers, or
  storage writes. Allow lazy registration sources and discover inspectable runtime APIs on each scan
  so a standalone inspector does not depend on addon script order.

- 68f7010: Share optional structured markup requirements between addon metadata, CLI setup guides, and the
  on-page inspector. Validate nested element roles per parent, resolve explicitly mapped instance
  selector options, and show required/optional attributes and live findings in a connected tree.
  Include setup instructions and inert markup examples, preserve disclosure state during rescans,
  and keep legacy contracts and the dormant production activation policy compatible.

## 0.3.0

### Minor Changes

- Add opt-in element visibility and layout-refresh helpers, cancellable window-facing `whenReady`
  callbacks, complete metadata-driven Webflow setup guides and catalog exports, and private
  production JavaScript sourcemaps outside deployable output. Keep the worked counter example
  under repository documentation and leave generated project behavior neutral.

  Build each discovered addon as an independent browser script with its own optional CSS and
  private sourcemap. Discover addons alongside configured project entries, write an output manifest,
  and update starter commands, script guides, and architecture guidance. Existing projects should
  switch their build script to `slicemedia-devkit build`, split browser initialization into
  `src/addons/<name>.ts`, and replace universal script tags with the required per-addon tags.
  Retain `build --entry` for deliberate single-entry builds. Expose registered APIs directly on the
  window runtime and add named `init`, `refresh`, and `destroy` completion events.

## 0.2.0

## 0.1.1
