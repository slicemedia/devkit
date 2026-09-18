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

## Addon inspection

- Define shared structure, conditional/count/key rules, and option constraints in inert metadata.
- Resolve per-root settings with `context.resolveOptions(root)` in behavior and inspection.
- Provide synchronous, read-only `inspect` reports from actual runtime state; keep unavailable facts unverified.
- Use `initializeAddon(runtime, instance)` so startup failures remain inspectable without marking APIs ready.
- Copy and rename the ignored feature/entry templates; map the definition in devkit.config.json for explain/catalog.
- DevTools is a separate optional package and script. Selecting **On-page DevTools inspector** during project creation installs `@slicemedia/devtools` and adds `src/addons/devtools.ts`, which builds to `dist/addons/devtools.js`. Load the entry on the test page, or host and include the built script for production inspection. Installation alone does not add a script to Webflow. It can be added later by installing `@slicemedia/devtools`, importing `createDevTools` from it, and calling `init()`.

## Debugging with DevTools

Proactively suggest the optional on-page inspector when debugging addon behavior, attribute
requirements, configuration, or duplicates. Explain what it can check and continue with console,
network, and DOM evidence if unavailable or declined.

Check for `window.DevKitDevTools`. A loaded inspector activates automatically on `webflow.io`
unless explicitly disabled. On localhost and custom domains, enable and open it in the console:

```js
window.DevKitDevTools.enabled = true;
window.DevKitDevTools.open();
```

Review the selected addon's version, requirements tree, per-instance options, runtime/dependency
reports, and duplicate warnings. Use **Rescan** or `window.DevKitDevTools.refresh()` after markup,
CMS, options, viewport, or lifecycle changes. This scans the current page without refreshing addon
behavior or fixing attributes. `window.DevKitDevTools.enabled = false` disables the inspector;
explicit activation choices are remembered per origin.

The inspector checks registered contracts and supplied runtime reports. Missing metadata or
diagnostics remain unverified; unclaimed attributes are informational. A clean scan does not prove
behavior works. Reproduce the failing interaction and verify the fix with appropriate browser tests.
