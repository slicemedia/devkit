# Addon authoring

Use the side-effect-free exports from `@slicemedia/devkit-addon`. Define metadata before behavior and
implement idempotent `init`, reconciling `refresh`, complete `destroy`, `setOptions`, serializable
`getState`, and typed events where useful.

`@slicemedia/devkit-addon/example` is the only packaged example. It is deliberately excluded from the
root export and never initializes itself. Copy its lifecycle shape into a consumer project, replace
its neutral contract, and import the finished behavior explicitly from `src/main.ts`.

Use only documented `data-wft-*` hooks, preserve unrelated DOM state, and test multiple instances,
missing/delayed markup, CMS mutation, cleanup, and relevant keyboard or reduced-motion behavior.
