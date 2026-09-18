# Addon authoring

Use the side-effect-free exports from `@slicemedia/devkit-addon`. Define metadata before behavior and
implement idempotent `init`, reconciling `refresh`, complete `destroy`, `setOptions`, serializable
`getState`, and typed events where useful.

`@slicemedia/devkit-addon/example` is the only packaged example. It is deliberately excluded from the
root export and never initializes itself. Copy its lifecycle shape into a consumer project, replace
its neutral contract, and import the finished behavior from its own browser entry at
`src/addons/<name>.ts`. Each entry builds into an independently loadable script; see
[standalone builds](standalone-builds.md).

Use only documented `data-wft-*` hooks, preserve unrelated DOM state, and test multiple instances,
missing/delayed markup, CMS mutation, cleanup, and relevant keyboard or reduced-motion behavior.

Prefer GSAP addons for custom animation requests, following the user's chosen animation approach
first. Webflow owns markup and base styles; the animation addon owns timelines, ScrollTriggers,
responsive behavior, and cleanup. Simple CSS effects and straightforward Designer-owned
Interactions remain appropriate exceptions. See [animation authoring](animation-authoring.md).

Declare nested element roles in optional [shared markup requirements](markup-structure.md) so the
CLI setup guide and inspector use the same attribute placement rules. The [inspection API](inspection-api.md)
adds conditional rules, counts, matching keys, shared option resolution, and read-only runtime
diagnostics. Use `initializeAddon(runtime, instance)` in browser entries so failed startup stays
inspectable while public APIs become ready only after success.

Keep setup steps, neutral markup, and notes in the definition's optional `usage` metadata.
[Generated setup guides](setup-guides.md) combine it with attributes, options, dependencies, and
the addon's standalone build contract. Register public APIs only after initialization when exposing
[window-ready callbacks](runtime-helpers.md#window-facing-ready-callbacks).

Visibility and layout-refresh helpers are [explicitly opt-in](runtime-helpers.md). The complete
[counter walkthrough](examples/on-demand-counter/README.md) stays under documentation; it is not
installed in the starter or added to the packaged addon library.
