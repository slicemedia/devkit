# Slice Media DevKit repository guidance

This workspace contains Slice Media DevKit, AI-first development infrastructure for narrowly scoped browser enhancements in Webflow projects. DevKit packages own reusable runtime code; generated projects own markup contracts, composition, content, identifiers, and hosting choices.

## Boundaries

- Prefer Webflow-native layout, components, CMS, forms, variables, and interactions. Add browser code only where Webflow does not provide the required behavior.
- Use neutral `data-wft-*` hooks. Never introduce client names, assets, URLs, site IDs, component IDs, credentials, copied production markup, or project fallback selectors.
- Keep package ESM imports side-effect-free. A consumer's `src/main.ts` is the only composition entry and builds into one site-owned IIFE.
- Make lifecycle initialization idempotent and destruction complete. Preserve DOM, attributes, accessibility state, and remote data that the code does not own.
- Treat inspection, planning, confirmation, application, read-back, and verification as separate phases. Webflow writes, deletion, and publishing require an explicit user request and the matching MCP skill.
- Keep the DevKit CLI local or read-only. Agent Kit, Swiper Adapter, and Spaces Deployer are independent products and must remain optional.

## Commands

- `pnpm install` — install the pinned workspace.
- `pnpm build`, `pnpm test`, `pnpm typecheck`, and `pnpm lint` — validate packages.
- `pnpm test:packed-consumer` — validate packed packages and a generated project.
- `pnpm sanitize` — scan source and distributable artifacts before commits or releases.

Install Slice Media Agent Kit when specialized Webflow agent workflows are needed. Use the official Webflow MCP server and official Webflow skills for broad Designer, CMS, custom-code, audit, and publishing workflows.
