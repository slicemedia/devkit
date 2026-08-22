# `@slicemedia/devkit-addon`

Side-effect-free primitives for authoring a Webflow enhancement with the shared DevKit lifecycle.
The root package re-exports the addon contract from `@slicemedia/devkit-core`; importing it never
queries the DOM or starts an addon.

```ts
import { createAddon, defineAddon } from "@slicemedia/devkit-addon";
```

An intentionally small demonstration is available through an explicit subpath:

```ts
import { createExampleAddon, exampleAddonDefinition } from "@slicemedia/devkit-addon/example";

const example = createExampleAddon();
await example.init();
```

The example owns only `data-wft-example-state` on elements marked with `data-wft-example`, restores
the authored value on teardown, and discovers later CMS content when refreshed. It is a reference
for people and AI agents, not a behavior included by the root import.

Licensed under MIT.
