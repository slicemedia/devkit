# Webflow project

This project owns its Webflow markup, composition, configuration, and deployment choices. The base
starter is deliberately neutral: no optional capability is imported by `src/main.ts`.

## Local development

1. Run `pnpm install`.
2. Run `pnpm dev` for the CORS-enabled local development server.
3. Author the Webflow markup contract with `data-wft-*` behavior hooks.
4. Import only the generated files under `src/integrations/` that the project is ready to compose.
5. Run `pnpm typecheck` and `pnpm build`.

The build emits one project-owned ES2018 IIFE at `dist/project.js` and, when styles are imported,
`dist/project.css`. `pnpm catalog -- --json` inspects the single project entry. Use
`pnpm devkit -- <command>` for other DevKit commands.

The project-owned `WEBFLOW_PROJECT.md` is always present. If agent targets were selected, run
`pnpm agents:generate` after installation. Slice Media Agent Kit preserves that guide and creates
only the requested Codex, Claude, Cursor, Copilot, or Webflow files; it is maintained in a separate
repository.

Connect an AI client to the official Webflow MCP server at `https://mcp.webflow.com/mcp`. Generated
Agent Kit guidance directs most page, component, style, CMS, asset, and script work through
headless tools. Open the Webflow MCP Bridge App only for live selection, canvas, mode, branch,
breakpoint, or visual snapshot context. Remote writes and publishing require an explicit request
and the matching generated skill.

Copy `.env.example` to an ignored local file only when needed, and load it through your shell or CI.
Never commit site IDs, domains, tokens, deployment credentials, or client fixtures.
