# Standalone addon builds

`slicemedia-devkit build` builds each public addon separately. Paste only the script tags needed
on a Webflow page. A shared project script is optional; it is never required to load an addon.

```text
src/
  addons/
    counter.ts           -> dist/addons/counter.js
    slider/index.ts      -> dist/addons/slider.js
  projects/
    landing.ts           -> dist/projects/landing.js
  shared/                # imported helpers, not public entries
dist/
  addons/
    counter.js
    slider.js
    slider.css           # only if this entry imports CSS
  projects/
    landing.js
  webflow-scripts.json
```

The same conventions support `.js`, `.mjs`, and `.tsx`, as well as `.entry.ts` filenames.
Files/directories beginning with `_` or `.` and test/type declaration files are excluded. Put
helper modules outside the public entry paths, or prefix their names with `_`. Each entry is a
browser bootstrap: it imports reusable behavior, explicitly installs/reuses the runtime,
initializes its addon, and registers the public API. Importing an inert definition alone does not
initialize anything. See the [counter walkthrough](examples/on-demand-counter/README.md).

Every script bundles its own imports and needs no shared chunk or separate runtime script.
This can duplicate a vendor when several standalone addons use it. An optional project entry can
deliberately combine selected behaviors when that tradeoff is useful. Avoid loading both that
combined entry and the individual entries for the same behavior. All public bootstraps should
check for an existing registration before initializing and use the runtime queue to serialize
initialization. Runtime version conflicts are reported rather than silently replaced.

## Explicit entries and outputs

`devkit.config.json` entries can add metadata, select an inert definition export, or declare
browser entries elsewhere. Discovered addons/projects are included alongside configured entries;
a configured browser input overrides the same discovered input. Entry names and output files must
be unique. Names are lower-case kebab-case. A configured `kind` of `addon` or `project` also selects
the conventional output directory for an entry outside those folders.

```json
{
  "entries": [
    {
      "name": "counter",
      "input": "src/addons/counter.ts",
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
directory, so do not loop that command over addons sharing a destination; use the default build.
An empty project succeeds with an empty manifest and no invented example addon.

## Migrating an earlier generated project

1. Change the package's build script to `slicemedia-devkit build`.
2. Split each addon's browser initialization into `src/addons/<name>.ts`; keep reusable definitions
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
point it at `dist/`, which now contains multiple scripts and optional stylesheets.

The earlier single-bundle rule was present in foundation commit `621f55c`. This architecture
replaces it with independently selectable addons while preserving side-effect-free packages.
