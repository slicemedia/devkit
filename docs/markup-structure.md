# Shared markup requirements

The optional `structure` in an addon definition describes the element roles needed by the addon.
DevTools renders that hierarchy as a connected, collapsible tree and checks it against the current
page. `explain` and `catalog` render the same tree in their setup guides and retain it in JSON and
the documentation manifest. Neither tool infers requirements by parsing example HTML or running
the addon's behavior.

```ts
import { defineAddon } from "@slicemedia/devkit-core";

const galleryDefinition = defineAddon({
  name: "gallery",
  version: "1.0.0",
  description: "A neutral gallery contract example.",
  entry: "gallery",
  defaultOptions: { selector: "[data-wft-gallery]" },
  attributes: [
    {
      name: "data-wft-gallery",
      type: "boolean",
      required: true,
      description: "Gallery container.",
    },
    { name: "data-wft-gallery-list", type: "boolean", required: true, description: "Item list." },
    {
      name: "data-wft-gallery-item",
      type: "boolean",
      required: true,
      description: "Gallery item.",
    },
    { name: "data-wft-label", type: "string", description: "Optional item label." },
  ],
  structure: {
    id: "gallery",
    label: "Gallery container",
    selector: "[data-wft-gallery]",
    selectorOption: "selector",
    attributes: [{ name: "data-wft-gallery" }],
    children: [
      {
        id: "list",
        label: "Item list",
        selector: "[data-wft-gallery-list]",
        relationship: "child",
        attributes: [{ name: "data-wft-gallery-list" }],
        children: [
          {
            id: "item",
            label: "Gallery item",
            selector: "[data-wft-gallery-item]",
            attributes: [{ name: "data-wft-gallery-item" }, { name: "data-wft-label" }],
          },
        ],
      },
    ],
  },
  usage: {
    setup: ["Create a gallery container, add its list directly inside, then add gallery items."],
    markup:
      "<section data-wft-gallery><div data-wft-gallery-list><div data-wft-gallery-item></div></div></section>",
  },
  setup: () => ({}), // Contract example only; real addon behavior is separately authored.
});
```

The resulting hierarchy is:

```text
Gallery container
   data-wft-gallery · required
└─ Item list · direct child · required
      data-wft-gallery-list · required
   └─ Gallery item · descendant · required
         data-wft-gallery-item · required
         data-wft-label · optional
```

Each role represents an element, not an attribute. Multiple attributes on one role must be on
that same element. A nested role defaults to a descendant anywhere inside each matched parent;
`relationship: "child"` requires an immediate child. Nested roles default to required, meaning
at least one match **per parent**, while the root is optional on a given page unless explicitly
marked `required: true`. Mark optional child roles `required: false`; their own attributes and
children are still checked whenever they exist.

Attribute references inherit their descriptions, types, allowed values, and required flags from
`attributes`. A role can override an attribute's requirement with `{ name, required }`. IDs must
be unique within the tree, selectors and labels non-empty, and attribute references declared in
the same addon. `defineAddon()` validates, copies, and freezes the tree without touching the DOM.
CSS selector syntax is validated later in the browser.

`selector` is a neutral default. `selectorOption` explicitly connects a role to a string option:
the inspector reads the instance's current option on every scan, and the CLI shows its documented
default. This supports configured selectors without guessing which option names represent roots.
Project-specific selectors, composition, and markup remain owned by the consuming project.

## Inspector behavior

Register an addon instance exposing this definition in `window.slicemediaDevKit`, or pass it to
`createDevTools({ addons: [{ addon }] })`. No second structure declaration is needed. Each branch
shows its relationship, presence, and findings, including errors in collapsed descendants.
Attribute rows show required/optional and present/missing/invalid status; expand an attribute for
its description, type, allowed values, and Locate action. The Setup guide disclosure shows the
definition's instructions, inert example HTML, and notes. Branch and attribute expansion survives
Rescan and addon switching for the current inspector session.

Matching is scoped per parent and per component root. One valid list cannot satisfy another empty
list, and a nested component cannot supply a missing child for its enclosing component. A missing
role points Locate at its existing parent. Missing ancestors suppress downstream missing-element
errors until those ancestors exist; this prevents cascades of guessed errors. Optional missing
roles are informational. Finding valid markup does not prove the addon's behavior works.

The tree is the **expected structure**, with observed counts. It does not clone the whole page DOM
or identify which unmarked element the author intended to use. Conditional requirements, exact
counts, matching keys, shared scopes, and custom diagnostics are available through the
[inspection API](inspection-api.md). Iframe documents and shadow trees are outside the document scan.

## Project overrides and older addons

The inspector accepts `contract: { root, required?, structure? }` for a project-owned root selector
or a complete replacement structure. Existing `contract.attributes` root/descendant rules remain
supported and explicitly take precedence over structure metadata for that registration. Their UI
shows only the declared root/descendant relationships, without guessing deeper nesting.

Attributes without a declared location appear under **Placement not documented**. Required
attributes in that group receive informational findings instead of invented placement errors.
Metadata without a tree remains compatible with `explain`, `catalog`, and the inspector.

CLI metadata selected through `definition.module` / `definition.export`, exported `addonDefinitions`,
and JSON sidecars can all carry the same `structure` object. Runtime instance options may differ
from the CLI's documented defaults; the inspector displays the resolved selector when it differs
from a simple attribute hook.
