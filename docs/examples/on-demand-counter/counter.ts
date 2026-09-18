import { createAddon, defineAddon, observeElementVisibility } from "@slicemedia/devkit-core";

interface CounterOptions {
  selector: string;
  duration: number;
}

export const counterDefinition = defineAddon<CounterOptions, { instances: number }>({
  name: "counter",
  version: "0.1.0",
  description: "Documentation example: animate a Webflow-authored number only near the viewport.",
  entry: "./src/counter.ts",
  attributes: [
    {
      name: "data-wft-counter",
      description: "Marks the number element.",
      type: "boolean",
      required: true,
    },
    {
      name: "data-wft-counter-to",
      description: "Finite number to count towards.",
      type: "number",
      required: true,
    },
  ],
  options: [
    { name: "selector", description: "Elements owned by this example.", type: "selector" },
    { name: "duration", description: "Animation duration in milliseconds.", type: "number" },
  ],
  defaultOptions: { selector: "[data-wft-counter]", duration: 1200 },
  usage: {
    setup: [
      "Create an accessible Webflow text wrapper containing the final number.",
      "Add data-wft-counter and data-wft-counter-to to its decorative number span.",
      "Compose createCounter in src/addons/counter.entry.ts, then initialize and register its public API.",
    ],
    markup:
      '<p aria-label="250 projects completed"><span aria-hidden="true" data-wft-counter data-wft-counter-to="250">250</span> projects completed</p>',
    notes: [
      "This is a documentation example, not a packaged addon. Webflow owns the layout and final fallback text.",
    ],
  },
  setup(context) {
    const instances = new Map<HTMLElement, () => void>();

    function attach(element: HTMLElement): () => void {
      const target = Number(element.getAttribute("data-wft-counter-to"));
      if (!Number.isFinite(target)) return () => {};
      const authored = element.textContent;
      let frame: number | undefined;
      let elapsed = 0;
      let previous: number | undefined;
      let visible = false;
      let done = false;
      const reducedMotion = context.window.matchMedia("(prefers-reduced-motion: reduce)");

      const pause = (): void => {
        if (frame !== undefined) context.window.cancelAnimationFrame(frame);
        frame = undefined;
        previous = undefined;
      };
      const finish = (): void => {
        done = true;
        pause();
        element.textContent = authored;
      };
      const tick = (time: number): void => {
        frame = undefined;
        if (!visible || done) return;
        if (reducedMotion.matches || context.options.duration <= 0) {
          finish();
          return;
        }
        if (previous !== undefined) elapsed += time - previous;
        previous = time;
        const progress = Math.min(1, elapsed / context.options.duration);
        element.textContent = String(Math.round(target * progress));
        if (progress === 1) {
          finish();
          return;
        }
        frame = context.window.requestAnimationFrame(tick);
      };
      const motionChanged = (): void => {
        if (reducedMotion.matches) finish();
      };
      reducedMotion.addEventListener("change", motionChanged);
      const stop = observeElementVisibility(
        [element],
        (change) => {
          visible = change.visible;
          if (!visible) pause();
          else if (!done && frame === undefined) frame = context.window.requestAnimationFrame(tick);
        },
        { rootMargin: "300px 0px", signal: context.signal },
      );
      return () => {
        stop();
        pause();
        reducedMotion.removeEventListener("change", motionChanged);
        element.textContent = authored;
      };
    }

    function reconcile(): void {
      const roots = new Set(
        context.document.querySelectorAll<HTMLElement>(context.options.selector),
      );
      for (const [element, destroy] of instances) {
        if (!roots.has(element)) {
          destroy();
          instances.delete(element);
        }
      }
      for (const element of roots)
        if (!instances.has(element)) instances.set(element, attach(element));
    }

    return {
      init: reconcile,
      refresh: reconcile,
      setOptions: reconcile,
      getState: () => ({ instances: instances.size }),
      destroy() {
        for (const destroy of instances.values()) destroy();
        instances.clear();
      },
    };
  },
});

export function createCounter(options: Partial<CounterOptions> = {}) {
  return createAddon(counterDefinition, options);
}
