import { createInspector, type InspectorController } from "./inspector.js";
import {
  isWebflowStaging,
  readPreferences,
  writePreferences,
  type DevToolsPreferences,
} from "./preferences.js";
import { runtimeAddons } from "./runtime-addons.js";
import type { DevToolsController, DevToolsOptions } from "./types.js";

export { inspectDevKit } from "./inspect.js";
export type {
  DevToolsAddonInspection,
  DevToolsAttributeInspection,
  DevToolsAttributeRule,
  DevToolsContract,
  DevToolsController,
  DevToolsIssue,
  DevToolsInstanceInspection,
  DevToolsOptions,
  DevToolsRegistration,
  DevToolsScanOptions,
  DevToolsScriptWarning,
  DevToolsSnapshot,
  DevToolsStructureInspection,
  InspectableAddon,
} from "./types.js";

declare global {
  interface Window {
    DevKitDevTools?: DevToolsController;
  }
}

const installed = new WeakMap<Document, DevToolsController>();

/** Inert until init(): register console controls, then apply the origin's activation policy. */
export function createDevTools(options: DevToolsOptions = {}): DevToolsController {
  let targetDocument: Document | undefined;
  let targetWindow: Window | undefined;
  let inspector: InspectorController | undefined;
  let preferences: DevToolsPreferences = {};
  let enabled = false;
  let openWhenReady = false;
  let cancelReady = (): void => {};

  const savePreferences = (changes: DevToolsPreferences): void => {
    preferences = { ...preferences, ...changes };
    if (targetWindow) writePreferences(targetWindow, preferences);
  };

  const stop = (): void => {
    openWhenReady = false;
    cancelReady();
    inspector?.destroy();
    inspector = undefined;
  };

  const start = (): void => {
    if (!enabled || inspector || !targetDocument || !targetWindow) return;
    const document = targetDocument;
    const window = targetWindow;
    if (!document.body) {
      cancelReady();
      const ready = (): void => {
        cancelReady();
        start();
      };
      document.addEventListener("DOMContentLoaded", ready, { once: true });
      cancelReady = () => {
        document.removeEventListener("DOMContentLoaded", ready);
        cancelReady = () => {};
      };
      return;
    }
    inspector = createInspector({
      document,
      addons: () =>
        typeof options.addons === "function"
          ? options.addons()
          : (options.addons ?? runtimeAddons(window)),
      ...(options.nonce ? { nonce: options.nonce } : {}),
      preferences,
      savePreferences,
    });
    try {
      inspector.init();
      if (openWhenReady) {
        openWhenReady = false;
        inspector.open();
      }
    } catch (error) {
      inspector.destroy();
      inspector = undefined;
      throw error;
    }
  };

  const install = (): void => {
    if (targetDocument) return;
    const document =
      options.document ??
      (typeof globalThis.document === "undefined" ? undefined : globalThis.document);
    if (!document) throw new Error("DevKit DevTools requires a browser document.");
    const window = document.defaultView;
    if (!window) throw new Error("DevKit DevTools requires a browser window.");
    if (installed.has(document))
      throw new Error("A DevKit inspector is already mounted in this document.");
    if ("DevKitDevTools" in window)
      throw new Error("window.DevKitDevTools already exists; it cannot be replaced.");
    Object.defineProperty(window, "DevKitDevTools", { configurable: true, value: controller });
    installed.set(document, controller);
    targetDocument = document;
    targetWindow = window;
    preferences = readPreferences(window);
    enabled = preferences.enabled ?? isWebflowStaging(window.location.hostname);
  };

  const controller: DevToolsController = {
    get enabled() {
      return enabled;
    },
    set enabled(value: boolean) {
      if (typeof value !== "boolean")
        throw new TypeError("DevKitDevTools.enabled must be true or false.");
      install();
      enabled = value;
      savePreferences({ enabled });
      if (enabled) start();
      else stop();
    },
    init() {
      install();
      if (enabled) start();
    },
    open() {
      controller.init();
      if (!enabled) return;
      start();
      if (inspector) inspector.open();
      else openWhenReady = true;
    },
    close() {
      openWhenReady = false;
      inspector?.close();
    },
    refresh() {
      return enabled ? inspector?.refresh() : undefined;
    },
    getSnapshot() {
      return inspector?.getSnapshot();
    },
    destroy() {
      stop();
      if (targetDocument) installed.delete(targetDocument);
      const descriptor =
        targetWindow && Object.getOwnPropertyDescriptor(targetWindow, "DevKitDevTools");
      if (descriptor?.value === controller && descriptor.configurable) {
        Reflect.deleteProperty(targetWindow!, "DevKitDevTools");
      }
      targetDocument = undefined;
      targetWindow = undefined;
      preferences = {};
      enabled = false;
    },
  };
  return controller;
}
