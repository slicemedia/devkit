# Webflow project guidance

Webflow owns editable structure, components, styles, CMS content, forms, and native interactions.
This project owns only the browser enhancements explicitly composed in `src/main.ts`.

- Prefer native Webflow features before adding code.
- Use documented, scoped `data-wft-*` hooks instead of generated classes or guessed identifiers.
- Keep optional files under `src/integrations/` disconnected until their markup contract is ready.
- Make initialization idempotent and restore owned DOM, attributes, listeners, observers, and timers
  during teardown.
- Inspect before remote work. Webflow writes and publishing require an explicit request, review,
  read-back, and verification through the official Webflow MCP server.

Install Slice Media Agent Kit only when this project needs platform-specific agent instructions.
Generate only the targets used by the team.
