# Addon inspection API

Requirements are declared as typed, executable metadata in `defineAddon()`. They are available
through `instance.definition` and serializable `getAddonMetadata(definition)`. They are not
extracted from comments. DevTools, `explain`, and `catalog` share this contract; live diagnostics
are a separate, explicitly read-only API.

These contracts remain in `@slicemedia/devkit-core`. The optional inspector is installed separately
as [`@slicemedia/devtools`](../packages/devtools/README.md); core does not depend on its UI.
Independent inspection tools can use `@slicemedia/devkit-core/inspection` for contract validation,
condition evaluation, and option resolution.

## Requirements

Extend the [markup structure](markup-structure.md) with these optional fields:

| Field                                | Meaning                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `when`                               | Apply a role or attribute rule only when its condition matches.                                                                   |
| `min`, `max`                         | Number of matching elements per parent; equal values require an exact count. On the root role, these count roots in the document. |
| `uniqueBy`                           | Attribute whose values must be unique within each component.                                                                      |
| `references`                         | Match an attribute value to another role's key within the same component.                                                         |
| `relationship: "self"`               | Match the parent element itself.                                                                                                  |
| `relationship: "self-or-descendant"` | Prefer a matching parent; otherwise match its descendants.                                                                        |
| `scopeSelector`                      | Search descendants of the closest declared shared wrapper, such as controls outside the root.                                     |

Conditions support `{ option: "enabled", equals: true }`,
`{ attribute: "data-wft-enabled", equals: "false" }`, and `{ media: "(min-width: 900px)" }`.
Combine them using `all`, `any`, and `not`. Option equality is typed; attribute equality uses
strings, or `null` for absence. Attribute conditions always read the component root. Media
conditions read the current viewport on each scan and do not install listeners.

A role whose condition is false is shown as inactive and does not require its attributes or
children. A missing parent suppresses downstream errors. `required` retains its old defaults:
roots are optional on a page, nested roles require one match unless declared otherwise. Explicit
`min` overrides that minimum. Disabled roots can still count as present roots; inactivity controls
which requirements are evaluated inside them.

```ts
{
  id: "control",
  label: "Item control",
  selector: "[data-wft-control]",
  scopeSelector: ".component",
  when: { option: "navigation", equals: true },
  min: 1,
  uniqueBy: "data-wft-control",
  references: {
    attribute: "data-wft-control",
    target: "item", // Another role ID in this definition.
    targetAttribute: "data-wft-item",
  },
  attributes: [{ name: "data-wft-control", required: true }],
}
```

All referenced attributes must be declared. Repeated keys across different component roots are
allowed. Shared wrappers should identify one component; ambiguous external controls produce a
warning. Arbitrary ownership algorithms belong in a custom diagnostic provider.

Attributes and option metadata support numeric `min`, `max`, and `integer`, `format` values
`"css-length"`, `"url"`, and `"json"`, and `target: "root" | "document"` for selectors that must
match an element. CSS lengths follow the browser's parser; URL checks accept relative or absolute
HTTP(S) URLs without making requests. `values` retains the existing explicit string whitelist
semantics, including custom boolean conventions. Use a custom diagnostic for domain rules that
these primitives cannot express.

## Effective options

`instance.resolveOptions(root)` starts with current instance options and applies present root
attributes whose metadata declares `option`. Numbers and standard boolean markers are parsed;
missing attributes preserve the current option. Invalid values remain inspectable and produce
validation findings rather than silently falling back.

Use **the same resolver in addon behavior** with `context.resolveOptions(root)`. Existing addons
keep their original behavior until they opt into this helper. For custom parsing or nested
settings, declare a synchronous `resolveOptions(context)` on the definition and return the full
options object. The custom resolver replaces automatic attribute mapping. Both runtime behavior
and DevTools then call this resolver. It must only read state and return options; do not mutate
markup, initialize behavior, load assets, or make requests inside it.

`selectorOption` reads current options for root selection and resolved per-root options for nested
roles. CLI guides show defaults; DevTools' **Runtime & configuration** section shows effective
options separately for each root. Nested option paths in conditions are supported. Automatic
attribute-to-option mapping targets top-level option keys; a custom resolver can handle nested
configuration.

## Runtime diagnostics

Provide `inspect(context)` on the definition for diagnostics available before setup, or return
an `inspect` hook from `setup()` to report the closure's actual instance state. The setup hook
takes precedence while it exists. `instance.inspect(root?)` exposes that report in the console.

```ts
setup(context) {
  const activeRoots = new Set<Element>();
  // The real lifecycle implementation maintains activeRoots and its owned controllers.
  return {
    inspect({ root, options, status }) {
      if (!options.enabled) return { state: "inactive", message: "Disabled for this root." };
      if (status !== "ready") return { state: "waiting", message: `Lifecycle: ${status}` };
      return {
        state: root && activeRoots.has(root) ? "active" : "waiting",
        message: "Report the state recorded by the lifecycle implementation.",
        issues: [],
        dependencies: [{ name: "animation-engine", state: "available" }],
      };
    },
  };
}
```

States are `active`, `inactive`, `waiting`, `error`, and `unverified`. Issues contain `code`,
`severity` (`info`, `warning`, or `error`), `message`, and an optional `element` for Locate.
Dependency states are `available`, `loading`, `missing`, `inactive`, and `unverified`. A declared
dependency can specify an explicit browser `global` path and a `when` condition. Global presence
checks only establish existence; bundled modules and remote services need an authored runtime
report to establish readiness. Inspection never fetches a dependency.

For a service without component markup, declare `scope: "global"`. Its diagnostic provider runs
once per scan without a root. For a component contract it runs once per matched root. No provider
means **unverified**, independently of lifecycle `ready` or zero markup errors. A failed provider
or malformed addon metadata produces a warning and does not abort other addons' inspections.
DevTools never invokes `setup`, `init`, `refresh`, `destroy`, or `getState`. Explicit inspection
providers are trusted addon code: they must be synchronous and read-only.

## Registration and failed startup

Use the shared helper in the browser entry:

```ts
import {
  CORE_VERSION,
  initializeAddon,
  installDevKitRuntime,
  onDomReady,
} from "@slicemedia/devkit-core";
import { createFeature } from "../features/feature.js";

const installation = installDevKitRuntime({ version: CORE_VERSION });
if (installation.status === "conflict") throw new Error("DevKit runtime version conflict.");
const { runtime } = installation;
onDomReady(() => {
  runtime.queue.push(async () => {
    await initializeAddon(runtime, createFeature());
  });
  void runtime.ready.catch(console.error);
});
```

`initializeAddon` tracks the instance in `runtime.inspectionAddons` before starting it. Failed
startup remains visible, including the lifecycle error. The public API and `whenReady` are still
exposed only after successful initialization. The helper reuses the retained instance when the
same name and version are loaded again; use distinct names for deliberately separate APIs. Older
`registerAddon` code remains supported but cannot reveal an instance that failed before it was
registered. An older runtime without `trackAddon` must be upgraded before using this helper.

## New projects and adoption

The creator's optional **On-page DevTools inspector** capability installs `@slicemedia/devtools` and adds `src/addons/devtools.ts`
and production setup metadata. The inspector is built as its own script. Every starter also
contains ignored `_template.ts` files under `src/features/` and `src/addons/`: copy and rename
both, implement the behavior and diagnostics, and keep the inert definition separate from startup.
Map that definition to the public browser entry so CLI documentation uses it:

```json
{
  "name": "feature",
  "input": "src/addons/feature.ts",
  "definition": { "module": "src/features/feature.ts", "export": "featureDefinition" }
}
```

Place this entry in the existing `devkit.config.json` entries array. `doctor` warns about discovered
addons without component structure or global scope. Definitions loaded for CLI discovery must
remain inert; providers and lifecycle code are not executed by documentation generation.

Legacy APIs registered in DevKit without metadata are listed as unverified. Unregistered scripts
or a different global registry require an explicit adapter/migration. No universal inspector can
infer arbitrary JavaScript behavior, undocumented selectors, server state, or intent from markup.
The extension API lets authors expose those facts without teaching DevTools each addon by name.
