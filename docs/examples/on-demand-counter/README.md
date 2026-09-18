# First enhancement: an on-demand counter

This worked example lives only in repository documentation. It is not a package export, starter
feature, or member of the addon library. Copy it deliberately into a disposable generated project
when learning the workflow. Use native Webflow behavior when it already meets the requirement.

## 1. Prepare a project and its Webflow contract

Create a neutral DevKit project and install its dependencies. Copy `counter.ts` into the project's
`src/` and `addons/counter.ts` into `src/addons/counter.ts`; copy `devkit.config.json` to its root. The included
`tsconfig.json` checks this example inside the DevKit repository; keep the generated project's own
TypeScript configuration when copying the example.

In Webflow, create this structure through Designer. The final number remains available before
JavaScript runs and when it is unavailable. The changing number is decorative; the wrapper supplies
the complete accessible text. Adapt both authored values together.

```html
<p aria-label="250 projects completed">
  <span aria-hidden="true" data-wft-counter data-wft-counter-to="250">250</span>
  projects completed
</p>
```

Webflow owns appearance, spacing, layout, and content. The code only changes the number text while
animating and restores the authored value on completion or destruction. Put another counter well
below the fold to exercise deferred work. Each counter starts within 300px of the viewport, pauses
outside that area or while the document is hidden, and respects reduced motion.

## 2. Test against Webflow markup

Run the generated project's dev command. Generate its local tags and full setup guide with:

```sh
pnpm devkit -- explain counter
```

Use the development snippet only on an approved Webflow testing page. It contains Vite's HMR client
and the standalone `src/addons/counter.ts` entry. Importing the counter definition alone does not initialize it.
Local HTML is only a smoke test; verify the actual rendered Webflow page too.

Check multiple counters, desktop/mobile widths, scrolling away and back, background tabs, reduced
motion, and content added after load followed by `refresh()`. Test teardown and reinitialization.
The example uses whole-number interpolation; localization and richer number formatting belong to
the consuming project.

## 3. Call the public API from a small Webflow script

This works before or after the project script loads:

```html
<script>
  window.slicemediaDevKit = window.slicemediaDevKit || { queue: [] };
  window.slicemediaDevKit.queue.push(function (runtime) {
    runtime.whenReady("counter", function (counter) {
      console.log(counter.getState());
    });
  });
</script>
```

The project registers the counter after `init()` completes. Ready means its public API is usable;
individual elements still animate only when near the viewport. Later CMS changes can be reconciled
with `window.slicemediaDevKit.counter.refresh()` after readiness. Use `counter.on("refresh", callback)`
or `counter.on("destroy", callback)` inside the ready callback to subscribe to lifecycle events.

## 4. Build and hand off

Run the project's typecheck and build scripts. Add `--sourcemap` to the build command when private
debugging artifacts are needed. Deploy only `dist/` through the project's selected hosting workflow.
Publishing or changing Webflow code is a separate explicitly requested operation.

Once the asset base URL is known, generate the production handoff and optional catalog artifacts:

```sh
pnpm devkit -- explain counter --public-base-url https://assets.example.com/project/assets
pnpm catalog -- --out docs/addons.md --manifest dist/webflow-scripts.json --public-base-url https://assets.example.com/project/assets
```

Replace the example URL with the project's actual asset base URL. Generate the manifest after the
build, since building clears `dist/`. This example emits `dist/addons/counter.js`; load that file
only on pages using counters. Other addons get their own files and tags. Remove localhost/HMR
snippets before production handoff and verify the deployed page.
