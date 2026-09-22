# @slicemedia/create-devkit

## 0.5.1

### Patch Changes

- a943c2e: Place official Swiper CSS in a lower-priority cascade layer in generated slider vendors so Webflow component classes retain visual styling. Document attribute-based markup preparation, adapter version requirements, shared loading, and reversible CMS grid layouts.

  Select Swiper Adapter ^0.2.0 and Agent Kit ^0.2.4 in generated projects so the new structure API and matching agent guidance are available together.

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

### Patch Changes

- 68f7010: Teach starter project guidance to suggest optional DevTools during addon debugging, explain activation and rescanning, and distinguish inspection findings from verified behavior.
- 68f7010: Align generated project guidance with the GSAP addon workflow for custom animation. Preserve
  Webflow ownership of markup and base styling, honor explicit animation choices, and keep simple
  CSS effects and Designer-owned Interactions as suitable alternatives.

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

### Patch Changes

- Use Agent Kit 0.2.x for generated projects so installed agent instructions follow the
  standalone per-addon build structure.

## 0.2.0

### Minor Changes

- Generate a Spaces deployment integration that selects stable URLs and scoped CDN invalidation.
  Require a project-supplied CDN endpoint ID and add the separate DigitalOcean API token to the
  ignored environment template. Raise the optional Spaces Deployer dependency to ^0.2.0; release
  that product version before publishing this creator change. Deployment stays in the independent
  Spaces Deployer package and is never imported into the browser entry.

## 0.1.1

### Patch Changes

- 38dd3b4: Clarify the wizard multi-select keyboard controls and rename the ambiguous Webflow AI target to Webflow Agent Instructions with an importable-ZIP explanation.
