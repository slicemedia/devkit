# Webflow project guidance

Webflow owns editable structure, components, styles, CMS content, forms, and native interactions.
This project owns only explicitly authored browser enhancements. Put each public addon entry in
`src/addons/<name>.ts` or `src/addons/<name>/index.ts`; each builds to its own
`dist/addons/<name>.js` and optional stylesheet. Load only the scripts needed on each Webflow page.
Use `src/main.ts` or `src/projects/` only for optional, deliberately composed project behavior.

- Prefer native Webflow features before adding code.
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
