# Standalone addon builds

`slicemedia-devkit build` builds each public addon separately. Paste only the script tags needed
on a Webflow page. A shared project script is optional; it is never required to load an addon.

```text
src/
  addons/
    counter.entry.ts                     -> dist/addons/counter.js
    animations/reveal.entry.js           -> dist/addons/animations/reveal.js
    sliders/gallery/index.entry.ts       -> dist/addons/sliders/gallery/index.js
    sliders/gallery/options.ts          # imported helper, not a public entry
  projects/
    pages/landing.entry.ts               -> dist/projects/pages/landing.js
  shared/                               # imported helpers, not public entries
dist/
  addons/
    counter.js
    animations/reveal.js
    sliders/gallery/index.js
    sliders/gallery/index.css            # only if this entry imports CSS
  projects/
    pages/landing.js
  webflow-scripts.json
```

Use `*.entry.ts`, `*.entry.js`, `*.entry.mjs`, or `*.entry.tsx` for new public entries. Discovery is
recursive under `src/addons/` and `src/projects/`; the compatibility `src/entries/` root emits under
`addons/`. Category folders are preserved, `.entry` is removed, and the extension becomes `.js`.
Top-level entries retain their existing output naming based on the public addon name, including
configured names and conversion to kebab-case.
`index.entry.ts` keeps `index.js` in its own output folder. An entry can contain the entire addon or
import helpers; no additional master file is required. Imported helpers become part of the bundle,
not separate public files. Folder names and explicit output paths must use URL-safe letters,
numbers, hyphens, underscores, or dots, with a letter or number first in each segment.

For compatibility, the original `src/addons/<name>.ts` and `src/addons/<name>/index.ts` formats
(also JS/MJS/TSX) remain public and still emit `addons/<name>.js`. Equivalent legacy project
entries retain `projects/<name>.js`; the legacy `src/entries/` root emits under `addons/`. Ordinary
files elsewhere in nested folders are not public entries. Keep helpers out of those legacy entry
positions, or prefix their filenames with `_`; a plain first-level `index.ts` is still an entry.
Discovery excludes files/directories beginning with `_` or `.`, and test/type declaration files.
Explicit configuration can select a source outside automatic discovery.

Each entry is a browser bootstrap: it imports reusable behavior, explicitly installs/reuses the runtime,
initializes its addon, and registers the public API. Importing an inert definition alone does not
initialize anything. See the [counter walkthrough](examples/on-demand-counter/README.md).

Every addon remains independently selectable. Share heavy libraries through declared vendor entries
and on-demand loaders; they build once under `dist/vendor/`. The small runtime helper code remains
in each addon. Do not statically import the same heavy vendor in multiple entries or rely on a
dynamic import being split out of an IIFE. See [shared dependencies](shared-dependencies.md).
An optional project entry can deliberately combine selected behaviors when useful. Avoid loading both that
combined entry and the individual entries for the same behavior. All public bootstraps should
check for an existing registration before initializing and use the runtime queue to serialize
initialization. Runtime version conflicts are reported rather than silently replaced.

## Explicit entries and outputs

`devkit.config.json` entries can add metadata, select an inert definition export, or declare
browser entries elsewhere. Discovered addons/projects are included alongside configured entries;
a configured browser input overrides the same discovered input. Entry names and output files must
be unique across all folders. Names default to the entry's filename without `.entry` and its
extension, converted to lower-case kebab-case; a nested `index.entry.ts` uses its parent folder's name.
Folders do not namespace runtime registrations. Give entries with the same basename distinct
filenames or explicit config names; changing only a config name does not flatten a marked entry's
output path. Keep the registered runtime name aligned with the documented name.
A configured `kind` of `addon` or `project` also selects
the conventional output directory for an entry outside those folders.

```json
{
  "entries": [
    {
      "name": "counter",
      "input": "src/addons/animations/counter.entry.ts",
      "definition": { "module": "src/features/counter.ts", "export": "counterDefinition" }
    }
  ]
}
```

For custom paths, an entry's `bundle` specifies `input`, `scriptFile`, and optional `cssFile`.
Output paths are relative to `dist`; JavaScript and its CSS must share a directory. With no CSS
override, CSS uses the script's basename. The build validates all entries/output collisions before
clearing output, clears it once, builds sequentially, then writes a manifest of actual outputs.
`--out-dir` changes the output root. Private maps from `--sourcemap` stay outside that root.

`build --entry <file>` remains an explicit single-entry escape hatch. It clears its output
directory and does not build declared vendors, so do not loop that command over addons sharing a
destination; use the default build for a deployable addon/vendor set.
An empty project succeeds with an empty manifest and no invented example addon.

## Migrating an earlier generated project

1. Change the package's build script to `slicemedia-devkit build`.
2. Split each addon's browser initialization into `src/addons/<name>.entry.ts`; keep reusable definitions
   and helpers separate. Remove those addon imports from the old universal `src/main.ts`.
3. Retain a project entry only for deliberately shared behavior. For an older configured entry
   outside `src/projects/`, add `"kind": "project"` or declare its `bundle` explicitly. The current
   starter declares a neutral `src/main.ts` output at `projects/project.js`; remove that config
   entry when unused.
4. Replace old `project.js` Webflow tags with the required `addons/<name>.js` tags and associated
   stylesheets. `explain <name> --public-base-url <url>` generates exact snippets. Rebuild and
   upload `dist/` through the selected hosting workflow before switching live tags.

Changing build output does not delete old CDN objects or update/publish Webflow pages. Those are
separate deployment actions. The independent Spaces Deployer accepts a deployment directory;
point it at all of `dist/`, including declared `vendor/` files as well as addon/project scripts
and optional stylesheets. See [deployment](deployment.md).

Moving a marked entry into a category folder changes its output URL. Rebuild, deploy the complete
tree, and update affected script/CSS tags together. The build computes the path to the shared
`vendor/` directory for every output depth, including custom `bundle.scriptFile` paths and a
custom `--out-dir`. Local development resolves the same vendors from the dev server automatically.

The earlier single-bundle rule was present in foundation commit `621f55c`. This architecture
replaces it with independently selectable addons while preserving side-effect-free packages.
