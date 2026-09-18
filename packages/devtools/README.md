# Slice Media DevTools

`@slicemedia/devtools` is an optional on-page inspector for Webflow addons using the DevKit
inspection contract. Its bottom-center launcher opens a movable, resizable panel with addon
versions, nested markup requirements, effective options, runtime diagnostics, and duplicate
warnings. The inspector has its own package version and can be installed or updated independently.

## Install during project setup

Select **On-page DevTools inspector** in the DevKit wizard. It adds this dependency and creates
`src/addons/devtools.ts`. Building the project produces `dist/addons/devtools.js`, ready to host
alongside the other addon scripts. Projects that skip the option do not install or bundle DevTools.

## Add to an existing project

Install the preview release with your package manager:

```sh
pnpm add @slicemedia/devtools@next
# or: npm install @slicemedia/devtools@next
# or: yarn add @slicemedia/devtools@next
```

Create `src/addons/devtools.ts`:

```ts
import { createDevTools } from "@slicemedia/devtools";

const devtools = createDevTools();
devtools.init();

const hot = (
  import.meta as ImportMeta & {
    hot?: { dispose(callback: () => void): void };
  }
).hot;
hot?.dispose(() => devtools.destroy());
```

The module import and factory are inert. `init()` installs the console controller and applies the
host activation policy. DevKit builds this entry to `dist/addons/devtools.js`; include its hosted
URL once on the page. No separate CSS file is needed.

## Use without a local server

The package also includes a self-contained `dist/devtools.global.js`. Upload this one file to your
addon hosting or CDN, or use a pinned npm CDN URL after publication:

```html
<script defer src="https://assets.example.test/addons/devtools.global.js"></script>
```

For npm CDN hosting, the URL pattern is
`https://cdn.jsdelivr.net/npm/@slicemedia/devtools@VERSION/dist/devtools.global.js`.
Replace `VERSION` with an actually published version. Building or packing locally does not publish
the package. The browser file embeds its dependencies and styles: no npm installation, local
server, bundler, or separate core script is needed on the inspected page. Load either the generated
project addon or this browser file once. Both can load before or after the other addons.

The inspected addons must expose DevKit registrations and inspection metadata, or be supplied
through explicit adapters. An arbitrary legacy script cannot be identified from its bundle alone.

## Open and disable

A loaded inspector activates automatically on `webflow.io` unless explicitly disabled. On custom
domains and localhost, enable it from the browser console:

```js
window.DevKitDevTools.enabled = true;
window.DevKitDevTools.open();
```

Use **Rescan** or `window.DevKitDevTools.refresh()` after markup, configuration, CMS, or viewport
changes. This takes a new snapshot without calling addon lifecycle methods or fixing attributes.

```js
window.DevKitDevTools.enabled = false;
```

Explicit activation choices, resized dimensions, and opacity are remembered per origin. Fresh
custom-domain visits only register the console controller and read any existing preference; they
perform no scans, mount no UI, and write no storage. See the [full usage guide](docs/usage.md) for
controls, storage, CSP, duplicate checks, diagnostic limits, and cleanup.

## API and compatibility

The root exports `createDevTools`, `inspectDevKit`, and their TypeScript types. ESM consumers use
the declared `@slicemedia/devkit-core` dependency for shared contract helpers. The browser build
bundles those helpers and reads the page's existing runtime without installing another one.
Runtime reports and metadata remain owned by addons and DevKit core.

The earlier development imports `@slicemedia/devkit-core/devtools` and
`@slicemedia/devkit/devtools` have moved to `@slicemedia/devtools`. Install the new package and update
the import; `window.DevKitDevTools`, the activation policy, and saved preferences are unchanged.

## Maintenance and releases

Source, tests, documentation, and browser packaging live together in this package. It is outside
DevKit's fixed Changesets version group. Record DevTools changes in a Changeset for
`@slicemedia/devtools`; compatible releases can advance independently of DevKit. The wizard's
accepted range is maintained in `config/devtools-compatibility.json` at the repository root.

From the repository root:

```sh
pnpm --filter @slicemedia/devtools... build
pnpm --filter @slicemedia/devtools test
pnpm --filter @slicemedia/devtools pack --out artifacts/devtools.tgz
```

The archive includes ESM, types, the browser script, license, changelog, and these docs. The
**Publish npm prerelease** workflow publishes this package separately when `release_target` is
`devtools`; the default `devkit` target publishes only the five DevKit packages. Both targets use
the protected `npm-next` environment, npm trusted publishing, provenance, and archive read-back.
DevTools requires its own npm trusted-publisher registration for this workflow. The workflow
checks that the compatible core release, including its inspection exports, is already on npm.
See the repository's [release process](../../docs/release-process.md).

Releases use the `next` tag until the public-readiness review. Pin an actual version in production
CDN links. Uploading the browser script to project hosting remains a separate deployment step;
neither publication nor deployment is performed by the build.

Licensed under MIT. Slice Media DevTools is independently developed by Slice Media and is not
affiliated with, endorsed by, or sponsored by Webflow, Inc. The embedded Lucide icon license is
retained in the distributed source and browser artifact.
