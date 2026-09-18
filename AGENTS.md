# Slice Media DevKit repository guidance

This workspace contains Slice Media DevKit, AI-first development infrastructure for narrowly scoped browser enhancements in Webflow projects. DevKit packages own reusable runtime code; generated projects own markup contracts, composition, content, identifiers, and hosting choices.

## Boundaries

- Prefer Webflow-native layout, components, CMS, forms, variables, and base styling. Keep browser code focused on behavior attached to existing Webflow markup.
- Honor the user's animation approach first. Prefer GSAP addons for custom animation work; use CSS for simple state effects or native Webflow Interactions when they are clearly sufficient and Designer ownership is useful. Choosing GSAP does not require proving that native Interactions are incapable. Preserve existing animation ownership unless changing it is part of the request.
- Use neutral `data-wft-*` hooks. Never introduce client names, assets, URLs, site IDs, component IDs, credentials, copied production markup, or project fallback selectors.
- Keep package ESM imports side-effect-free. Consumer-owned entries under `src/addons/` build into separate standalone IIFEs at `dist/addons/<name>.js`, with optional per-addon CSS. Optional project entries compose only deliberately selected behavior; never force every addon into one site bundle.
- Make lifecycle initialization idempotent and destruction complete. Preserve DOM, attributes, accessibility state, and remote data that the code does not own.
- Treat inspection, planning, confirmation, application, read-back, and verification as separate phases. Webflow writes, deletion, and publishing require an explicit user request and the matching MCP skill.
- Keep the DevKit CLI local or read-only. Agent Kit, Swiper Adapter, and Spaces Deployer are independent products and must remain optional.

## Commands

- `pnpm install` — install the pinned workspace.
- `pnpm build`, `pnpm test`, `pnpm typecheck`, and `pnpm lint` — validate packages.
- `pnpm test:packed-consumer` — validate packed packages and a generated project.
- `pnpm sanitize` — scan source and distributable artifacts before commits or releases.

Install Slice Media Agent Kit when specialized Webflow agent workflows are needed. Use the official Webflow MCP server and official Webflow skills for broad Designer, CMS, custom-code, audit, and publishing workflows.
