# Webflow project guidance

Webflow owns editable structure, components, base styles, CMS content, and forms. This project owns
explicitly authored browser enhancements and custom animation addons. Put each public addon entry in
`src/addons/<name>.ts` or `src/addons/<name>/index.ts`; each builds to its own
`dist/addons/<name>.js` and optional stylesheet. Load only the scripts needed on each Webflow page.
Use `src/main.ts` or `src/projects/` only for optional, deliberately composed project behavior.

- Prefer native Webflow layout, content, forms, and base styling. Animate existing markup.
- Honor the user's animation approach first. Prefer GSAP addons for custom animation work; use CSS
  for simple state effects or native Interactions when they are clearly sufficient and Designer
  ownership is useful. Choosing GSAP does not require proving native Interactions are incapable.
  Preserve existing animation ownership unless changing it is part of the request.
- Use documented, scoped `data-wft-*` hooks instead of generated classes or guessed identifiers.
- Keep optional files under `src/integrations/` disconnected until their markup contract is ready.
- Make initialization idempotent and restore owned DOM, attributes, listeners, observers, and timers
  during teardown.
- Install the shared DevKit runtime explicitly and register each public addon API after successful
  initialization. Inline scripts can use `window.slicemediaDevKit.whenReady(name, callback)` and
  direct named access such as `window.slicemediaDevKit.counter.refresh()`.
- Inspect before remote work. Webflow writes and publishing require an explicit request, review,
  read-back, and verification through the official Webflow MCP server.

Install Slice Media Agent Kit only when this project needs platform-specific agent instructions.
Generate only the targets used by the team.
