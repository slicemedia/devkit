---
"@slicemedia/devtools": patch
"@slicemedia/devkit-core": minor
"@slicemedia/devkit": minor
"@slicemedia/devkit-cli": patch
"@slicemedia/create-devkit": minor
---

Extract the inspector into the optional, independently versioned `@slicemedia/devtools` package
with ESM exports, TypeScript declarations, package documentation, and a standalone browser build.
Select it during project creation or install it later; existing project addon/CDN hosting continues
to work without a local server. Move the earlier development DevTools subpaths out of core and the
convenience package, while keeping shared inspection contracts and helpers in core.

Preserve legal notices in standalone builds, including the DevTools icon licenses.
