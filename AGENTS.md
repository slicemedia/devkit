# Slice Media DevKit repository guidance

This workspace contains Slice Media DevKit, AI-first development infrastructure for narrowly scoped browser enhancements in Webflow projects. DevKit packages own reusable runtime code; generated projects own markup contracts, composition, content, identifiers, and hosting choices.

## Boundaries

- Prefer Webflow-native layout, components, CMS, forms, variables, and base styling. Keep browser code focused on behavior attached to existing Webflow markup.
- Honor the user's animation approach first. Prefer GSAP addons for custom animation work; use CSS for simple state effects or native Webflow Interactions when they are clearly sufficient and Designer ownership is useful. Choosing GSAP does not require proving that native Interactions are incapable. Preserve existing animation ownership unless changing it is part of the request.
- Prefer Swiper for sliders and carousels, using the optional Slice Media Swiper Adapter where appropriate. Honor an explicit user choice of native Webflow sliders or another implementation; preserve existing ownership unless migration is requested.
- Use neutral `data-wft-*` hooks. Never introduce client names, assets, URLs, site IDs, component IDs, credentials, copied production markup, or project fallback selectors.
- Keep package ESM imports side-effect-free. Mark new consumer-owned browser entries with `.entry.ts` or `.entry.js` under `src/addons/`; nested folders are preserved under `dist/addons/` with the marker removed and optional adjacent CSS. Legacy flat files and one-folder `index.ts` entries keep their original outputs. Public entry names must be unique across folders. Optional project entries compose only deliberately selected behavior; never force every addon into one site bundle.
- Keep heavy dependencies in declared project-owned vendor entries, emitted once under `dist/vendor/` and loaded on demand across addon scripts. Deploy the complete `dist/` tree.
- Make lifecycle initialization idempotent and destruction complete. Preserve DOM, attributes, accessibility state, and remote data that the code does not own.
- Treat inspection, planning, confirmation, application, read-back, and verification as separate phases. Webflow writes, deletion, and publishing require an explicit user request and the matching MCP skill.
- Keep the DevKit CLI local or read-only. Agent Kit, Swiper Adapter, and Spaces Deployer are independent products and must remain optional.

## DevTools for addon debugging

- When investigating addon failures, missing attributes, unexpected options, or duplicate scripts, proactively suggest the optional on-page DevTools inspector and explain which evidence it can provide. Continue with console, network, and DOM inspection if it is unavailable or the user prefers not to use it.
- Check whether `window.DevKitDevTools` is present. New projects install the optional `@slicemedia/devtools` package and get `src/addons/devtools.ts` only when **On-page DevTools inspector** is selected in the creator. Existing projects can install that package and add the entry later; installing DevKit alone does not load the inspector on a page. See [DevTools setup and usage](packages/devtools/README.md), including the standalone production script.
- On `webflow.io`, the loaded inspector activates automatically unless explicitly disabled. On localhost and custom domains, enable and open it through the browser console:

  ```js
  window.DevKitDevTools.enabled = true;
  window.DevKitDevTools.open();
  ```

- Inspect the affected addon's version, lifecycle, nested requirements, effective options, runtime/dependency reports, and duplicate warnings. Rescan after markup, CMS, options, viewport, or lifecycle changes with the toolbar or `window.DevKitDevTools.refresh()`. This refresh only scans; it does not call the addon's lifecycle `refresh()` or repair markup.
- Treat findings as a snapshot of declared contracts and available runtime reports. Unregistered scripts cannot be discovered reliably, unclaimed hooks are informational, and missing metadata or diagnostics remain unverified. A clean scan or `ready` lifecycle is not proof that behavior works; reproduce and test the actual interaction.
- Keep addon requirements available through the [inspection API](docs/inspection-api.md), shared with `explain` and `catalog`. Use `context.resolveOptions(root)` for effective configuration, synchronous read-only `inspect` reports for runtime facts, and `initializeAddon(runtime, instance)` to preserve failed-startup diagnostics. Do not infer contracts from code comments.

## Commands

- `pnpm install` — install the pinned workspace.
- `pnpm build`, `pnpm test`, `pnpm typecheck`, and `pnpm lint` — validate packages.
- `pnpm test:packed-consumer` — validate packed packages and a generated project.
- `pnpm sanitize` — scan source and distributable artifacts before commits or releases.

Install Slice Media Agent Kit when specialized Webflow agent workflows are needed. Use the official Webflow MCP server and official Webflow skills for broad Designer, CMS, custom-code, audit, and publishing workflows.
