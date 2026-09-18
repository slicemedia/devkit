---
"@slicemedia/devkit-core": minor
"@slicemedia/devkit-cli": minor
"@slicemedia/devkit-addon": minor
"@slicemedia/create-devkit": minor
---

Add opt-in element visibility and layout-refresh helpers, cancellable window-facing `whenReady`
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
