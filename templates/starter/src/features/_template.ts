import { createAddon, defineAddon } from "@slicemedia/devkit-core";

interface FeatureOptions {
  selector: string;
  enabled: boolean;
}

// Copy, rename, and implement this inert definition for each new enhancement.
export const featureDefinition = defineAddon<FeatureOptions>({
  name: "feature",
  version: "0.1.0",
  description: "Replace with the behavior this enhancement adds to Webflow markup.",
  entry: "./src/features/feature.ts",
  defaultOptions: { selector: "[data-wft-feature]", enabled: true },
  options: [
    { name: "selector", type: "selector", description: "Component roots." },
    { name: "enabled", type: "boolean", description: "Enable this component." },
  ],
  attributes: [
    { name: "data-wft-feature", type: "boolean", required: true, description: "Component root." },
    {
      name: "data-wft-feature-enabled",
      type: "boolean",
      option: "enabled",
      description: "Per-component opt-out.",
    },
    { name: "data-wft-feature-item", type: "string", required: true, description: "Item key." },
  ],
  structure: {
    id: "root",
    label: "Component",
    selector: "[data-wft-feature]",
    selectorOption: "selector",
    attributes: [{ name: "data-wft-feature" }, { name: "data-wft-feature-enabled" }],
    children: [
      {
        id: "item",
        label: "Item",
        selector: "[data-wft-feature-item]",
        min: 1,
        when: { option: "enabled", equals: true },
        uniqueBy: "data-wft-feature-item",
        attributes: [{ name: "data-wft-feature-item" }],
      },
    ],
  },
  usage: {
    setup: ["Replace these instructions with the Webflow element hierarchy and configuration."],
    notes: ["The template has no behavior until implemented."],
  },
  setup(context) {
    // Implement init/refresh/destroy here. Resolve each root's settings with
    // context.resolveOptions(root), and register owned cleanup with context.onCleanup().
    return {
      inspect({ root, status }) {
        const options = root ? context.resolveOptions(root) : context.options;
        if (!options.enabled) return { state: "inactive", message: "Disabled for this component." };
        if (status !== "ready") return { state: "waiting", message: `Lifecycle: ${status}` };
        return {
          state: "unverified",
          message: "Implement a read-only report from the actual runtime state.",
        };
      },
    };
  },
});

export function createFeature(options: Partial<FeatureOptions> = {}) {
  return createAddon(featureDefinition, options);
}
