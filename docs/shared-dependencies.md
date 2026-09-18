# Shared dependencies without a universal addon bundle

Keep each addon independently selectable under `dist/addons/`, including nested category folders. Put heavy dependency imports
in project-owned vendor entries so multiple addons download and execute one copy of a library.
Selecting the slider, animations, or tooltips capability creates both a typed asynchronous loader
under `src/integrations/` and its vendor entry under `src/vendors/`. The neutral starter adds none.

```text
dist/
  addons/hero.js
  addons/cards.js
  vendor/animations.js       # GSAP and ScrollTrigger, shared by animation addons
  vendor/slider.js           # Swiper and the optional Swiper Adapter
  vendor/slider.css
  vendor/tooltips.js         # Tippy and its dependency
  vendor/tooltips.css
  webflow-scripts.json
```

Only selected capabilities emit these vendors. No vendor downloads just because an integration
module is imported. Call its loader after matching markup needs the behavior, optionally when a
root approaches the viewport. Scripts remain independent IIFEs; no project entry must load first.
The small core helper code is still bundled with each entry. Sharing the heavy libraries is what
avoids repeated vendor bytes and execution; it is not a guarantee of a particular Lighthouse score.

## Build and author

Declare vendor entries explicitly in `devkit.config.json`:

```json
{
  "vendors": [{ "name": "animations", "input": "src/vendors/animations.ts" }]
}
```

Merge this field with existing `entries`. Each vendor builds once to `vendor/<name>.js`, with CSS
only when its entry imports CSS. The build validates vendor and addon output collisions together.
The manifest has separate `entries` and `vendors` arrays containing actual emitted files.

The animations vendor imports GSAP and ScrollTrigger and calls `registerSharedModule({ gsap,
ScrollTrigger })` after plugin registration. Add or remove plugins in that vendor and update the
integration's type contract together. Swiper CSS and optional `/webflow` helpers also belong in the
slider vendor; include only the module styles the project uses. Never import vendor entry files
from addon entries: they are separate build inputs.

Use the generated integrations from an addon's lifecycle:

```ts
// After finding the applicable markup, and optionally after viewport entry:
const { gsap, ScrollTrigger } = await loadProjectAnimations();
const slider = await createProjectSlider({ target: root });
slider?.init();
const tooltips = await createProjectTooltips("[data-wft-tooltip]");
```

Import these functions from the matching `src/integrations/` modules. Slider/tooltip selector calls
return without loading a vendor when no matching element exists. Animation callers check their own
markup. Keep async initialization owned by the addon: handle load failures, respect teardown,
and destroy returned controllers, tooltips, animations, and observers on cleanup.

`loadSharedModule()` uses a lazily installed document registry shared across independently built
addons. `loadAssetOnce()` shares pending script/style promises and rejects conflicting uses of an
asset key. The shared loader waits for both script registration and stylesheet completion. Failed
network loads can be retried; no timer retries or external CDN choices are imposed.

Existing Webflow-provided GSAP can be used deliberately after checking its version and required
plugins; do not also request the project vendor in that branch. The generated integration defaults
to the project's own pinned dependency so an unrelated global cannot silently change its API.

## URLs, development, and deployment

Capture `import.meta.url` at module scope in the loader and pass it to `resolveVendorAsset()`.
For production IIFEs, the build captures the executing script URL before asynchronous work and
supplies the relative vendor directory for that output. Nested addon/project folders and custom
`bundle.scriptFile` paths resolve `vendor/` on the same host and deployment prefix automatically.
The default build emits vendors alongside entries even with a custom `--out-dir`.
In local development, source modules at any depth resolve vendors at the dev server's `/vendor/`.
Only a separately hosted vendor tree needs an explicit `vendorBaseUrl` ending in `/`.

The CLI replaces the internal `__SLICEMEDIA_VENDOR_DIRECTORY__` constant while compiling the core
helper. Outside the CLI, the unmodified ESM helper retains the `../vendor/` fallback; a custom
bundler must supply its own directory through that define or pass an explicit vendor base URL.

`slicemedia-devkit dev --origin https://testing.example.com` builds the selected vendors on startup
and serves them at `/src/vendor/` and `/vendor/`; normal source modules keep Vite HMR. Restart the
server after editing vendor entries or dependencies. Only loopback origins and explicitly supplied
testing origins are allowed; repeat `--origin` for additional approved testing pages.

Deploy **all of `dist/`** through any provider or GitHub Action, preserving the directory tree.
Do not select only `dist/addons/`, manually add every vendor tag to every page, or copy all of
`public/` into the deployment as an undocumented workaround. Unlisted `public/` assets are not
automatically copied by this build. Private maps stay in `.slicemedia/sourcemaps/`.
See [deployment](deployment.md).

## Migrating earlier generated integrations

Move runtime imports of GSAP, Swiper/adapter, and Tippy into vendor entries; keep type-only imports
in the integration. Replace synchronous GSAP exports with `await loadProjectAnimations()`, and
await slider/tooltip factories. A dynamic `import()` inside a standalone IIFE alone is inlined;
it does not create a shared network resource. Rebuild all related addons and vendors together.
