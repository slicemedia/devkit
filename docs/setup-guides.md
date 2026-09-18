# Generated Webflow setup guides

`explain` renders a complete Markdown setup guide in the terminal. `catalog` combines those guides.
Both preserve machine-readable output with `--json`.

```sh
slicemedia-devkit explain counter
slicemedia-devkit explain counter --out docs/setup.md --public-base-url https://assets.example.com/project/assets
slicemedia-devkit catalog --out docs/addons.md --manifest dist/webflow-scripts.json
```

The asset base URL is explicitly supplied by the consuming project. Generated production snippets
are instructions, not evidence that an asset is already deployed. No command writes to Webflow.
`--out` and `--manifest` intentionally replace the named generated files. Build writes a minimal
`dist/webflow-scripts.json` manifest of actual outputs. Run `catalog --manifest` after building to
replace it with full contracts/snippets; this documentation manifest uses schema version 1 and an
`entries` array containing the same documented contracts and snippets as the JSON CLI output.

## One authoritative contract

Add `usage: { setup, markup?, notes? }` to an addon's `defineAddon()` metadata. Attribute
descriptions, types, requirements, allowed values, options, defaults, dependencies, and lifecycle
methods come from that same definition. Optional `structure` metadata adds a connected markup tree
shared with the browser inspector; see [shared markup requirements](markup-structure.md). The setup guide does not execute its `setup()` function.

Projects can export an inert `addonDefinitions` array from `src/index.ts`, or explicitly select a
named export in `devkit.config.json`:

```json
{
  "entries": [
    {
      "name": "feature",
      "input": "src/addons/feature.ts",
      "definition": {
        "module": "src/features/feature.ts",
        "export": "featureDefinition"
      }
    }
  ]
}
```

The named export must describe the same addon name. Discovery imports this explicitly selected
module locally, so select only trusted, side-effect-free metadata modules. Never select a browser
composition entry that initializes the site. Existing JSON metadata and `*.addon.json` sidecars
remain supported; they can declare `usage`, `structure`, and `attributeDetails` without executing a module.

Public addon entries automatically receive a build contract pointing to their own
`addons/<name>.js` and optional `addons/<name>.css`; project entries use `projects/`.
An explicit `bundle: { input, scriptFile, cssFile? }` overrides those paths in both the default
build and the guides. `input` is relative to the project; output filenames are relative to `dist`.
Metadata configuration does not disable discovery of other addons. The guide preserves the
entry's declared script placement and permitted script attributes. Head scripts receive `defer`
by default. Include a stylesheet tag only if that entry actually emits CSS; the build manifest
records this.

Reusable source modules outside public entry conventions still need a browser wrapper before
they can run independently. Their guides explain this and omit script tags unless a browser
`bundle` is explicitly declared. The generated starter declares an optional neutral project
entry; each real addon is authored separately.

## Development and custom build paths

Development snippets load Vite's HMR client and that addon's browser entry. CSS imported by that entry
is handled by Vite during development. These snippets are for approved testing pages only.

```sh
slicemedia-devkit explain counter --dev-url http://localhost:5174 --hmr=false
slicemedia-devkit explain feature --entry src/addons/feature.ts --script-file addons/feature.js --css-file addons/feature.css --public-base-url https://assets.example.com/project/assets
```

When overriding paths on `explain`, supply the complete entry's relevant paths. These command-line
overrides affect documentation only; keep them aligned with `devkit.config.json` or the explicit
single-entry build command. Place production CSS in
the head and use the stated script placement after uploading the built files. Remove local/HMR
loaders before production handoff. Do not put account credentials in URLs or metadata.

For an end-to-end example, see [the repository-only counter walkthrough](examples/on-demand-counter/README.md).
