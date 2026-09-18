# On-page DevTools

The optional inspector adds a small Webflow mark at the bottom center of the viewport. Hovering
raises the tab from the bottom edge; clicking it opens a movable
read-only panel with registered addon versions and lifecycle status, a nested markup requirements
tree, attribute counts, missing
requirements, invalid values, and unclaimed `data-wft-*` hooks. Locate buttons temporarily outline
the relevant page element without changing its attributes or styles.

The launcher follows [Vue DevTools' bottom dock](https://github.com/vuejs/devtools/tree/main/packages/overlay/src):
a 32-pixel collapsed tab, 30-pixel height, 15-pixel lift, and two-second idle delay before it
tucks back down. The mark and primary blue (`#146EF5`) come from
[Webflow's official brand assets](https://brand.webflow.com/brand-assets). This remains an
independent Slice Media DevKit inspector.

A stationary 44-pixel button target keeps the small tab easy to activate while its face moves.
Keyboard focus and an open panel keep it raised. Touch devices show it raised by default and
respect the screen's safe area. Reduced-motion preferences disable the transitions.

Install the optional `@slicemedia/devtools` package and import it explicitly. Its ESM root stays inert. The starter emits a separate inspector entry only when the DevTools capability is selected.
Importing the subpath and calling `createDevTools()` are inert. `init()` registers
`window.DevKitDevTools` and applies the activation policy below.

## Production script without a local environment

The DevTools package ships `dist/devtools.global.js`, a self-contained browser IIFE with embedded UI
styles. Host that file on your CDN and paste its actual URL into a deferred script tag. It has no
runtime package imports or external assets. This file is included in the package build; a new
release must be published before a public package CDN can serve it. Use a pinned published version.
The source workspace does not publish or deploy it automatically.

```html
<script defer src="https://assets.example.test/devtools.global.js"></script>
```

The script installs `window.DevKitDevTools`. Production activation follows the policy below.
Loading it twice preserves the existing controller. A nonce on the script is passed to the UI's
style element. This optional artifact is separate from normal addon scripts; selecting the
creator's DevTools capability also builds a site-owned `dist/addons/devtools.js`.

## Include as a standalone addon

Create a consumer-owned `src/addons/devtools.ts` entry:

```ts
import { createDevTools } from "@slicemedia/devtools";

const devtools = createDevTools();
devtools.init();

// Optional in a Vite development entry with vite/client types:
import.meta.hot?.dispose(() => devtools.destroy());
```

The CLI builds it to `dist/addons/devtools.js`. Host it with the project's other standalone
addons and include it once in Webflow's site-wide head custom code, using the actual hosted URL:

```html
<script defer src="https://assets.example.test/addons/devtools.js"></script>
```

A footer include before `</body>` also works. Webflow documents both locations in its
[custom code guide](https://help.webflow.com/hc/en-us/articles/33961357265299-Custom-code-in-head-and-body-tags).
`defer` lets HTML parsing finish before a head script runs; deferred scripts preserve document
order. Avoid `async` when the project needs ordering between its scripts.

The inspector does **not** need to precede other addons. With no `addons` option it reads the
existing `window.slicemediaDevKit.inspectionAddons` registry on each scan, falling back to
`addons` on older runtimes. A registration with `definition` metadata can be validated. Registered
APIs without metadata are listed as unverified. Use `initializeAddon()` to retain startup failures. It does not install
a runtime, subscribe to it, initialize addons, or infer packages from arbitrary bundles. Addons
registered after the inspector loads appear on opening or Rescan. A runtime that reuses a
registration by name exposes only that retained registration; duplicate script includes are
checked independently in the current document.

Projects can supply a registration array or a callback evaluated on each scan. Use explicit
contracts to override placement checks. Addons with shared `structure` metadata supply their own
required element hierarchy automatically; see [shared markup requirements](https://github.com/slicemedia/devkit/blob/main/docs/markup-structure.md).

```ts
const devtools = createDevTools({
  addons: () => [
    {
      addon: example, // An existing, project-owned instance.
      contract: {
        root: example.options.selector,
        attributes: [{ name: "data-wft-example", on: "root" }],
      },
    },
  ],
});
devtools.init();
```

## Activation and storage

On `webflow.io` and its subdomains, initialization mounts the launcher automatically. On all
other hosts, including localhost and custom production domains, it stays disabled by default.
Open the browser console to enable it, then click the launcher or open the panel directly:

```js
window.DevKitDevTools.enabled = true;
window.DevKitDevTools.open();
```

Disable it and remove the UI, scans, listeners, timers, highlights, and retained snapshot:

```js
window.DevKitDevTools.enabled = false;
```

The boolean flag is remembered for that origin and overrides the hostname default on the next
load, including an explicit disable on staging. The console API remains available while disabled.
`open()` and `refresh()` do not bypass a disabled flag. Include the inspector bundle on production
if console activation is required; wrapping its installation in `import.meta.env.DEV` removes
that ability from a production build.

Initialization only reads an existing `slicemedia.devtools.v1` localStorage entry to restore a
previous choice. With no saved opt-in on a production origin, it creates no DOM, runs no scans,
reads no addon registry, attaches no inspector listeners or observers, and starts no timers.
It writes no localStorage, sessionStorage, cookies, or other browser storage. The script still
needs to download and execute its small registration/activation bootstrap.

The first explicit flag assignment, window resize gesture, keyboard size adjustment, or opacity
change writes the versioned localStorage entry. Mounting, opening, closing, scanning, moving,
restoring preferences, and adapting to viewport changes never write it. Size, opacity, and the
explicit flag share this entry; position and drawer height remain temporary UI state. Preferences
are per origin, so staging does not enable a custom production domain. Invalid saved values are
ignored without repairing storage. If localStorage is blocked or full, the controls still work
for that visit without writing elsewhere. No data is sent to a server.

## Panel controls

The inspector takes a snapshot when opened and when **Rescan** is clicked. The Rescan button
briefly fades green after a completed scan, then returns to its normal color. This confirms the
scan completed; any markup issues remain visible in the results. It does not watch the
page continuously. Rescan after addon initialization, an option change, or delayed CMS content.
The addon list and selected addon's details scroll independently. Unclaimed attributes are
collapsed by default below the split view, with their own scroll area when expanded. Rescanning
preserves the selected addon and the unclaimed section's expanded state.

The open unclaimed drawer has a small grabber centered on its top edge. Drag it up or down to
resize the scroll area, or focus it and use Up/Down (Shift moves farther) and Home/End. Its initial
height still fits the content up to 180px or 28% of the viewport height, whichever is smaller.
Double-click the grabber or press Enter to restore that default. The chosen height survives
collapsing, reopening, and rescanning until the inspector is destroyed. Resizing leaves space for
the addon panes and stays within the panel on smaller screens.

Drag the title/toolbar to move the panel, or focus the toolbar and use arrow keys (Shift moves
farther). The panel stays inside the viewport and is constrained again when the viewport changes.
All four edges and four corners resize the window. Focus a resize edge/corner and use arrow keys
(Shift moves farther) for keyboard resizing. The default window remains 760 by 580 pixels, limited
by the viewport. Resizing keeps the opposite edge anchored, preserves space for the launcher, and
reflows the sidebar in narrow windows. Each pane remains independently scrollable, and an expanded
unclaimed drawer adapts to the available window height.

The opacity icon beside Rescan opens a slider from 20% to 100%, so page content can show through.
Window size and opacity survive reloads in localStorage after interaction. A smaller viewport
clamps the display without overwriting the preferred size. Position survives closing and rescanning,
and resets when the inspector is destroyed.
The three toolbar buttons use [Lucide icons](https://lucide.dev/icons/); their license notices are
included with the embedded SVG definitions. The panel supports keyboard activation and touch.
Escape dismisses the opacity popover first, then closes the inspector.

## What can be checked universally

Every registered addon provides its existing `definition` metadata. When that definition includes
`structure`, the inspector and CLI setup guides share the same nested element roles and attribute
requirements. The inspector resolves explicitly declared selector options from the current instance. DevKit instances already
satisfy this interface; third-party integrations can supply an adapter with `definition` and an
optional `status` getter, `resolveOptions(root)`, and `inspect(root?)` diagnostic provider. The
inspector never calls lifecycle or `getState` methods. See the [inspection API](https://github.com/slicemedia/devkit/blob/main/docs/inspection-api.md).

- Without a structure or contract, declared attributes are inventoried across the current document. A required
  attribute without a location rule produces an informational finding, never a guessed error.
- A contract's `root` selects the actual component instances. Zero roots means **not used on this
  page**, unless `contract.required` explicitly says the addon must be present.
- `on: "root"` checks an attribute on each root. `on: "descendant"` checks for at least one owned
  descendant with the attribute inside each root. Descendants of nested roots belong to that
  nested root and cannot accidentally satisfy the outer root's requirement.
- A rule's `required` overrides the metadata flag. Optional missing attributes are counted but
  are not errors. Rules must reference attributes declared in the addon's metadata.
- Present values are checked against explicit `values`, finite numbers, boolean markers
  (`""`, `"true"`, or `"false"`), or CSS selector syntax. Declare `values` for other boolean
  conventions. Add `target: "root"` or `"document"` to require an actual selector match. Numeric
  constraints and CSS length, URL, and JSON formats can also be declared.
- Unclaimed hooks have no owner in the supplied registry. They may belong to project code or an
  unregistered addon, so the panel presents them as information.

For example, an addon declaring `data-wft-carousel` and `data-wft-carousel-item` could use:

```ts
const contract = {
  root: "[data-wft-carousel]",
  attributes: [
    { name: "data-wft-carousel", on: "root", required: true },
    { name: "data-wft-carousel-item", on: "descendant", required: true },
  ],
} as const;
```

The tree distinguishes direct children from descendants and checks each matched parent separately.
It keeps multiple attributes on the same element role together. Missing parents suppress downstream
missing-element errors; optional roles are checked when present. Required/optional and finding badges
remain visible on attribute rows, which expand for descriptions, allowed values, and Locate actions.
Branches can be collapsed, and their expansion state survives rescans and addon switching. A Setup
guide disclosure displays the same instructions and inert example HTML used by `explain`/`catalog`.
Older metadata without element roles appears under Placement not documented.

Contract selectors are project-owned. Keep them aligned with the addon's configured selectors;
the inspector cannot infer those selectors from arbitrary options or JavaScript. Recreate the
registration if those selectors change.

This is an audit of the current DOM, not source-code static analysis. It cannot discover arbitrary
bundled packages, infer undocumented requirements, prove behavior works, or inspect other documents
and shadow trees. Declared conditions, counts, key relationships, and custom semantic diagnostics
are supported through the [inspection API](https://github.com/slicemedia/devkit/blob/main/docs/inspection-api.md). Use addon-specific tests for behavior. A lifecycle status of `ready` is separate from a valid markup contract.

## Runtime and configuration

The right pane includes a disclosure for each matched component (or one for a global service),
showing the authored runtime report, dependency readiness, and effective options. Missing runtime
reports are explicitly unverified. Malformed metadata and failed providers are isolated to their
addon. Known hooks outside every registered owning root produce orphan warnings; unclaimed hooks
remain informational. CLI guides include declared conditions and constraints but do not execute
runtime diagnostic providers.

## Duplicate warnings

The inspector adds amber warnings to addon entries when the same addon is registered repeatedly
for the same selector or overlapping roots. Repeated names with undeclared scopes are marked as
possible duplicates because the inspector cannot prove that those instances are independent.
Warnings identify the other registrations and their versions. Separate, non-overlapping root
scopes are allowed, including multiple components handled by a single registration. A warning
does not prove that initialization ran twice or change the addon's lifecycle status.

The inspector also checks external JavaScript `<script src>` tags in the current document.
Repeated resolved URLs appear under **Page script warnings** in the detail pane, with the URL,
include count, and head/body locations. Queries and fragments remain significant; different
URLs are not guessed to contain the same addon. Inert data blocks, inline scripts, templates,
and `nomodule` fallbacks are excluded. The scanner follows the
[HTML script types](https://html.spec.whatwg.org/multipage/scripting.html#the-script-element).

These are duplicate _include_ warnings, not execution tracking. Modules can share one execution;
the DOM cannot prove successful loading, identify packages inside a bundle, or recover script tags
that were removed after running. No scripts are fetched, evaluated, disabled, or removed. Fix the
registration or include, then Rescan to clear the warning. Programmatic consumers receive addon
warnings in `addons[].issues` and page script warnings in `scriptWarnings`.

## Programmatic inspection and cleanup

`inspectDevKit({ document, addons })` returns the same snapshot without mounting UI. Snapshots
include element references so tooling can locate findings; they are not JSON reports. All findings
are returned, while the panel displays the first 50 findings per addon.

`createDevTools()` exposes the `enabled` flag plus `init`, `open`, `close`, `refresh`, `getSnapshot`, and `destroy`. Repeated
initialization of the same controller is harmless; a second controller in the same document is
rejected to avoid conflicting panels. Destruction removes the inspector and highlight, cancels
highlight timers/listeners, releases the snapshot, and leaves addon lifecycle and page state alone.
It also removes its own console API, but preserves saved preferences. It can be initialized again
after destruction. Use `enabled = false` for a persistent disable with the console API retained.
While disabled, `refresh()` and `getSnapshot()` return `undefined`.

The panel uses Shadow DOM to isolate its styles. For a Content Security Policy requiring a nonce
on style elements, pass the project's `nonce` option. All metadata is rendered as text. No page
data is sent anywhere.
