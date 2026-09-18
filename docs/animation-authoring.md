# Animation authoring

Prefer GSAP addons for custom animation work on Webflow projects. Webflow owns editable markup,
layout, content, and base styles; the addon owns the animation behavior on that markup.

## Choose the owner

1. Follow the user's chosen animation approach first. An explicit request for a GSAP addon is
   sufficient reason to use one. Likewise, honor requests for CSS, native Interactions, or another
   approach.
2. Otherwise, use GSAP addons for custom sequences, reveals, scroll-linked effects, measured
   movement, responsive recalculation, or motion that benefits from runtime APIs and repeatable
   testing. GSAP is a normal choice even when native Interactions could reproduce the effect.
3. Use CSS for simple hover, focus, or state transitions without orchestration or runtime geometry.
   Native Interactions are suitable when the motion is straightforward, clearly sufficient, and
   useful for the team to maintain visually in Designer.
4. Preserve existing animation owners unless the requested work includes changing them. Identify
   competing owners before animating the same properties or triggers.

Keep libraries optional. The creator's animations capability supplies a project-owned GSAP
integration and a shared GSAP/ScrollTrigger vendor. Projects call `await loadProjectAnimations()`
only after matching markup needs animation; multiple addon files reuse one download and module. Do not add GSAP to core,
automatically load it on every page, or create an unused example addon.

## Build an animation addon

- Use scoped `data-wft-*` hooks on existing Webflow elements. Keep base styling and layout editable
  in Webflow, with meaningful content visible and usable when motion is absent.
- Keep reusable definitions inert. Initialize and register the public API from the addon's own
  `src/addons/<name>.ts` or `src/addons/<name>/index.ts`; it builds independently to
  `dist/addons/<name>.js` with optional CSS. See [standalone builds](standalone-builds.md).
- Give each root its own animation state. Own the timeline, ScrollTriggers, responsive conditions,
  refresh behavior, and teardown. Use a GSAP context or match-media lifecycle where appropriate,
  and clean up separately owned listeners, observers, timers, and DOM changes too.
- Keep `init()` idempotent, make `refresh()` reconcile changed geometry, and make `destroy()`
  restore owned state. Expose pause/resume controls when the behavior needs them. Register readiness
  only after initialization, as described in [runtime helpers](runtime-helpers.md).
- Coalesce scroll refreshes after layout changes such as fonts, lazy images, CMS updates, tabs,
  or sliders. Opt into the layout-refresh guard when needed; avoid observer/refresh loops.
- Opt into initialization near the viewport and offscreen pause/resume when useful. These are
  behavior-specific choices, and must respect manual pause state and reduced-motion preferences.
- Document dependencies, required plugins, markup hooks, options, public methods/events, and each
  script's placement through the [setup guide](setup-guides.md).

Test missing and delayed markup, multiple instances, image/font layout shifts, responsive changes,
reduced motion, refresh, destroy, and reinitialization. Local addon authoring does not by itself
change or publish a Webflow site.
