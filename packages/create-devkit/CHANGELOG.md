# @slicemedia/create-devkit

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
