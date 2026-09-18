# Opt-in runtime helpers

Importing DevKit starts no observers, loads no vendors, and installs no globals. Compose these
helpers explicitly in a project or addon. Register their cleanup with `context.onCleanup()` or
call it from the owning project's destroy lifecycle.

## Activate near the viewport

```ts
import { observeViewportEntryOnce } from "@slicemedia/devkit-core";

const stop = observeViewportEntryOnce(
  document.querySelectorAll("[data-wft-feature]"),
  () => {
    // Initialize the applicable project enhancement here.
  },
  { rootMargin: "600px 0px" },
);

// If the owner is destroyed before activation:
stop();
```

The callback runs once when the first target enters the expanded viewport, then all observations
are released. To activate each element separately, call the helper once per element. Missing
IntersectionObserver falls back to eager activation; no polling is installed. An optional
`signal` cancels pending observation. The target list is a snapshot: reconcile later CMS elements
through the addon's refresh lifecycle.

This defers initialization and animation work. It does not by itself remove a statically imported
library from the initial download, change Webflow's DOM rendering, or guarantee a Lighthouse score.

## Pause while offscreen

```ts
import { observeElementVisibility } from "@slicemedia/devkit-core";

const stop = observeElementVisibility([root], ({ visible }) => {
  if (visible && !manuallyPaused) animation.resume();
  else animation.pause();
});
```

Supply the project's existing `root`, animation, and manual pause state. The callback first reports
paused while intersection is unknown, then reports visibility transitions. Background documents
are paused by default. Set `respectDocumentVisibility: false` only when that is intentional.
Use `rootMargin` to choose the activation area, and `threshold` for the minimum visible fraction.
Cleanup stops notifications; the caller owns the animation's final state. Manual pause controls,
reduced-motion preferences, and animation destruction remain the integration's responsibility.

## Refresh after images, fonts, or content change layout

```ts
import { createLayoutRefreshGuard } from "@slicemedia/devkit-core";

// ScrollTrigger is provided by the project's optional GSAP integration.
const guard = createLayoutRefreshGuard(() => ScrollTrigger.refresh(), {
  root: document,
  debounceMs: 80,
});

// Explicit changes not covered by image/font/content observation:
guard.schedule();

// Project/addon teardown:
guard.destroy();
```

The guard coalesces image load/error/decode, font readiness/loading, and child/text mutations. It
observes only after creation and disconnects while invoking the callback, so synchronous pinning
changes do not trigger a feedback loop. Set `observeImages`, `observeFonts`, or `observeMutations`
to `false` when the project already handles that source. Prefer a narrow root when possible.

It does not watch every style/attribute change or replace GSAP's normal load/resize behavior.
Call `schedule()` after a known class-driven layout change, such as opening a panel. Destruction
cancels queued refreshes and prevents late promises from scheduling new work.

## Window-facing ready callbacks

```ts
import { CORE_VERSION, installDevKitRuntime } from "@slicemedia/devkit-core";

const installation = installDevKitRuntime({ version: CORE_VERSION });
if (installation.status === "conflict") throw new Error("Runtime version conflict");
const { runtime } = installation;
await addon.init();
runtime.registerAddon({ name: "feature", version: addon.definition.version, value: addon });
```

Register only an initialized API. A consumer can subscribe before or after its registration:

```html
<script>
  window.slicemediaDevKit = window.slicemediaDevKit || { queue: [] };
  window.slicemediaDevKit.queue.push(function (runtime) {
    runtime.whenReady("feature", function (addon) {
      addon.on("change", function (state) {
        console.log(state);
      });
    });
  });
</script>
```

After installation, `window.slicemediaDevKit.whenReady(name, callback)` is available directly.
It returns an unsubscribe function, fires once asynchronously, and supplies the registered API and
runtime. Subscribe again for another one-shot callback. An unknown name remains pending until it
is registered or the subscription is cancelled. This means API availability, not completion of
every deferred animation. Callback failures use the existing runtime error event/queue handling.

The existing `runtime.ready` promise retains its meaning: await the current queue drain. Do not
await that same queue from inside one of its callbacks. A ready callback should return a promise
for its own async work if that failure should be included in queue handling.

## Direct addon APIs and lifecycle events

Registration also exposes the exact same API directly on the window runtime:

```js
// After the counter is ready:
window.slicemediaDevKit.counter.refresh();
window.slicemediaDevKit.counter.setOptions({ duration: 1800 });

// Before or after addon registration (after runtime installation):
window.slicemediaDevKit.whenReady("counter", function (counter) {
  counter.on("refresh", function () {
    console.log(counter.getState());
  });
  counter.on("destroy", function () {
    console.log("Counter cleaned up");
  });
});
```

Use bracket access for kebab-case names: `window.slicemediaDevKit["number-counter"]`.
Runtime/prototype member names such as `ready`, `queue`, `configure`, `constructor`, and `then`
are reserved. Registration rejects collisions instead of overwriting infrastructure. Direct
properties are read-only; `getAddon(name)` still returns the registration metadata and API.
Same-version duplicate registration preserves the original API and does not initialize another
instance. Browser entries must check for an existing registration before doing their own work.

Addon instances emit `init`, `refresh`, and `destroy` once after each successful corresponding
operation, with `{ status }`. Repeated idempotent `init()`/`destroy()` calls emit no duplicate
completion event. `status` reports transitions, `options` reports successful `setOptions()` calls,
and `error` reports lifecycle failures. Custom events are still authored by the addon. These are
addon `.on()` subscriptions, not DOM events dispatched on `window`; `.on()` returns an unsubscribe
function. Core event names are reserved for lifecycle notifications.

Events are not replayed: because the public API is registered after initialization, `whenReady`
handles the initial ready moment; a later `on("init")` observes subsequent reinitialization.
Separately built addons reuse the same runtime when their core versions match. No universal
site script is required.

See the repository-only [counter walkthrough](examples/on-demand-counter/README.md) for complete
composition, teardown, metadata, Webflow markup, testing, and handoff.
