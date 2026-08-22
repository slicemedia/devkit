import { CORE_VERSION, createAddon, defineAddon } from "@slicemedia/devkit-core";
import type { AddonEnvironmentInput, AddonInstance } from "@slicemedia/devkit-core";

const ROOT_ATTRIBUTE = "data-wft-example";
const STATE_ATTRIBUTE = "data-wft-example-state";

export interface ExampleAddonOptions {
  /** Selector used to discover example roots. Keep project-specific selectors in consumer code. */
  selector: string;
}

export interface ExampleAddonState {
  instances: number;
}

export interface ExampleAddonEventMap {
  reconcile: ExampleAddonState;
}

/**
 * A deliberately small lifecycle reference. Importing this module defines metadata but performs no
 * DOM work; browser behavior begins only after `createExampleAddon().init()`.
 */
export const exampleAddonDefinition = defineAddon<
  ExampleAddonOptions,
  ExampleAddonState,
  ExampleAddonEventMap
>({
  name: "example",
  version: CORE_VERSION,
  description: "Demonstrates neutral discovery, reconciliation, events, and complete DOM cleanup.",
  attributes: [
    {
      name: ROOT_ATTRIBUTE,
      description: "Marks an element as an example addon root.",
      type: "boolean",
    },
  ],
  options: [
    {
      name: "selector",
      description: "Selects the elements managed by this addon instance.",
      type: "selector",
    },
  ],
  defaultOptions: {
    selector: `[${ROOT_ATTRIBUTE}]`,
  },
  dependencies: [{ name: "@slicemedia/devkit-core", kind: "package" }],
  placement: "body-end",
  entry: "@slicemedia/devkit-addon/example",
  setup(context) {
    const authoredState = new Map<HTMLElement, string | null>();

    const restore = (element: HTMLElement): void => {
      if (!authoredState.has(element)) return;
      const value = authoredState.get(element);
      if (value === null || value === undefined) element.removeAttribute(STATE_ATTRIBUTE);
      else element.setAttribute(STATE_ATTRIBUTE, value);
      authoredState.delete(element);
    };

    const getState = (): ExampleAddonState => ({ instances: authoredState.size });

    const reconcile = (): void => {
      const roots = new Set(
        context.document.querySelectorAll<HTMLElement>(context.options.selector),
      );

      for (const element of authoredState.keys()) {
        if (!element.isConnected || !roots.has(element)) restore(element);
      }

      for (const element of roots) {
        if (!authoredState.has(element)) {
          authoredState.set(element, element.getAttribute(STATE_ATTRIBUTE));
        }
        element.setAttribute(STATE_ATTRIBUTE, "ready");
      }

      context.emit("reconcile", getState());
    };

    return {
      init: reconcile,
      refresh: reconcile,
      setOptions: reconcile,
      getState,
      destroy() {
        for (const element of [...authoredState.keys()]) restore(element);
      },
    };
  },
});

/** Creates an inert example instance. Call `init()` explicitly to begin browser work. */
export function createExampleAddon(
  options: Partial<ExampleAddonOptions> = {},
  environment: AddonEnvironmentInput = {},
): AddonInstance<ExampleAddonOptions, ExampleAddonState, ExampleAddonEventMap> {
  return createAddon(exampleAddonDefinition, options, environment);
}
