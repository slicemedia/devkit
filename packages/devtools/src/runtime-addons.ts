import type { DevKitHost } from "@slicemedia/devkit-core";
import type { DevToolsRegistration, InspectableAddon } from "./types.js";

/** Called only on an enabled scan, so standalone addon load order does not require listeners. */
export function runtimeAddons(window: Window): readonly DevToolsRegistration[] {
  const runtime = (window as DevKitHost).slicemediaDevKit;
  if (!runtime || !("kind" in runtime) || runtime.kind !== "slicemedia-devkit-runtime") return [];
  return (runtime.inspectionAddons ?? runtime.addons).map(({ name, version, value }) => {
    if (
      value &&
      typeof value === "object" &&
      "definition" in value &&
      value.definition &&
      typeof value.definition === "object"
    )
      return { addon: value as InspectableAddon };
    return {
      addon: {
        definition: { name, version, description: "Registered runtime API", attributes: [] },
      },
      metadataError: "This registered API exposes no inspection metadata; its setup is unverified.",
    };
  });
}
