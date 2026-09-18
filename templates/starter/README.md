# Webflow project

This project owns its Webflow markup, composition, configuration, and deployment choices. The base
starter is deliberately neutral: no optional capability is imported by `src/main.ts`.

## Local development

1. Run `pnpm install`.
2. Run `pnpm dev` for the CORS-enabled local development server.
3. Author the Webflow markup contract with `data-wft-*` behavior hooks.
4. Import only the generated files under `src/integrations/` that the project is ready to compose.
5. Run `pnpm typecheck` and `pnpm build`.

Create each public browser entry in `src/addons/<name>.ts` or `src/addons/<name>/index.ts`.
The build emits separate standalone ES2018 scripts at `dist/addons/<name>.js` and optional
`dist/addons/<name>.css`. Shared helpers belong outside these entry paths or in `_`-prefixed files.
New addons are discovered automatically alongside entries configured in `devkit.config.json`.
`pnpm catalog -- --json` inspects all public entries. Use
`pnpm devkit -- <command>` for other DevKit commands.

Run `pnpm devkit -- explain <name>` for an addon's Webflow setup guide and local testing tags. Add
`--public-base-url` with the deployed asset base URL for production JS/CSS tags. Load only the
scripts needed on each page. The optional neutral `src/main.ts` entry builds separately to
`dist/projects/project.js` and optional CSS; remove its config entry if no shared project script
is needed. It does not import or collect addon entries.

Each addon entry explicitly initializes its behavior and registers its API with the shared
DevKit runtime. Inline scripts can then use `window.slicemediaDevKit.counter.refresh()` or
`window.slicemediaDevKit.whenReady("counter", callback)`. Keep package definitions inert; put
browser initialization in the public entry. The build also writes `dist/webflow-scripts.json`
with the actual script and stylesheet paths.

`pnpm build -- --sourcemap` generates private JavaScript maps in `.slicemedia/sourcemaps/`, outside
`dist/`. Deploy only `dist/`; keep debugging artifacts private. The production bundle contains no
map references. Browser JavaScript itself remains publicly inspectable.

The repository documentation includes an optional worked example at
[`docs/examples/on-demand-counter`](https://github.com/slicemedia/devkit/tree/main/docs/examples/on-demand-counter).
Example features are not copied into generated projects.

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

## Animation ownership

Prefer GSAP addons for custom animation requests while keeping structure and base styling in
Webflow. Follow an explicit user choice of GSAP, CSS, native Interactions, or another approach.
For unspecified choices, simple state effects can use CSS, and straightforward motion maintained
visually by designers can use native Interactions. A GSAP addon does not need proof that native
Interactions cannot reproduce the effect.

When the animations capability is selected, import the optional `src/integrations/animations.ts`
module only from the addon or project entry that needs it. Scope animation state to each root,
implement refresh and complete teardown, and respect reduced motion. Preserve existing animation
owners unless a migration is requested. See
[animation authoring](https://github.com/slicemedia/devkit/blob/main/docs/animation-authoring.md).

## Inspection contracts and optional DevTools

Copy and rename the ignored `src/features/_template.ts` and `src/addons/_template.ts` files for a
new enhancement. Implement its behavior and read-only diagnostics; the templates themselves never
run or become build entries. Use the same `context.resolveOptions(root)` for runtime behavior and
inspection, and `initializeAddon(runtime, instance)` to keep failed initialization inspectable.
Map the inert definition module/export in `devkit.config.json` so explain/catalog share its rules.
See the [inspection API](https://github.com/slicemedia/devkit/blob/main/docs/inspection-api.md).

Selecting the DevTools capability installs the optional `@slicemedia/devtools` package and adds
`src/addons/devtools.ts`, built as `dist/addons/devtools.js`. It can also be installed and imported later.
Deploy and include this script once with defer in the head. It automatically activates on webflow.io;
on custom domains use `window.DevKitDevTools.enabled = true` and click the launcher. The flag,
window size, and opacity persist only after interaction. Normal production visitors get no storage
writes or scans. The `@slicemedia/devtools` package's `dist/devtools.global.js` is also a standalone
hosting option. Addons need registered metadata for full inspection; load order does not matter
when opening the panel or choosing Rescan.
