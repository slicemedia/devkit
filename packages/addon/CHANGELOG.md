# @slicemedia/devkit-addon

## 0.4.0

### Minor Changes

- 68f7010: Expose conditional markup requirements, count and key relationships, shared per-root option
  resolution, and read-only runtime diagnostics. Keep failed initialization inspectable with
  initializeAddon, and show unknown or failing providers as unverified. Share constraints with
  explain/catalog and report missing contracts in doctor.

  Ship a standalone devtools.global.js browser artifact in the separate DevTools package with production opt-in, add an optional
  DevTools creator capability, and include inert authoring templates for future addons.

- 68f7010: Share optional structured markup requirements between addon metadata, CLI setup guides, and the
  on-page inspector. Validate nested element roles per parent, resolve explicitly mapped instance
  selector options, and show required/optional attributes and live findings in a connected tree.
  Include setup instructions and inert markup examples, preserve disclosure state during rescans,
  and keep legacy contracts and the dormant production activation policy compatible.

### Patch Changes

- Updated dependencies [68f7010]
- Updated dependencies [68f7010]
- Updated dependencies [68f7010]
- Updated dependencies [68f7010]
  - @slicemedia/devkit-core@0.4.0

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

- Updated dependencies
  - @slicemedia/devkit-core@0.3.0

## 0.2.0

### Patch Changes

- @slicemedia/devkit-core@0.2.0

## 0.1.1

### Patch Changes

- @slicemedia/devkit-core@0.1.1
