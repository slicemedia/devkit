// @vitest-environment-options {"url":"https://production.example.test/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDevTools,
  type DevToolsController,
  type DevToolsRegistration,
} from "../src/index.js";
import { isWebflowStaging, preferencesKey, readPreferences } from "../src/preferences.js";
import { installDevKitRuntime, type DevKitHost } from "@slicemedia/devkit-core";

const controllers: DevToolsController[] = [];
function create(addons?: () => readonly DevToolsRegistration[]): DevToolsController {
  const controller = createDevTools(addons ? { addons } : {});
  controllers.push(controller);
  return controller;
}
const registration: DevToolsRegistration = {
  addon: {
    definition: { name: "probe", version: "1.0.0", description: "Late addon", attributes: [] },
  },
};

beforeEach(() => {
  document.body.innerHTML = "<main>Production content</main>";
  window.localStorage.clear();
});
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
  Reflect.deleteProperty(window, "slicemediaDevKit");
  vi.useRealTimers();
});

describe("production activation", () => {
  it("only installs the console API and reads preferences until explicitly enabled", () => {
    vi.useFakeTimers();
    const addons = vi.fn(() => [registration]);
    const controller = create(addons);
    const markup = document.documentElement.outerHTML;
    const read = vi.spyOn(Storage.prototype, "getItem");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const elements = vi.spyOn(document, "createElement");
    const query = vi.spyOn(document, "querySelectorAll");
    const documentListeners = vi.spyOn(document, "addEventListener");
    const windowListeners = vi.spyOn(window, "addEventListener");
    controller.init();
    controller.init();
    controller.open();
    controller.close();
    expect(controller.refresh()).toBeUndefined();
    expect(controller.getSnapshot()).toBeUndefined();
    expect(window.DevKitDevTools).toBe(controller);
    expect(controller.enabled).toBe(false);
    expect(read).toHaveBeenCalledExactlyOnceWith(preferencesKey);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(addons).not.toHaveBeenCalled();
    expect(elements).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(documentListeners).not.toHaveBeenCalled();
    expect(windowListeners).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.documentElement.outerHTML).toBe(markup);
    expect(document.cookie).toBe("");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("persists explicit activation, restores it without writes, and tears down on disable", () => {
    const addons = vi.fn(() => [registration]);
    const controller = create(addons);
    controller.init();
    window.DevKitDevTools!.enabled = true;
    expect(document.querySelector("[data-wft-devtools]")).not.toBeNull();
    expect(addons).not.toHaveBeenCalled();
    controller.open();
    expect(controller.getSnapshot()?.addons[0]?.name).toBe("probe");
    expect(readPreferences(window)).toEqual({ enabled: true });
    controller.destroy();
    expect(window.DevKitDevTools).toBeUndefined();
    const write = vi.spyOn(Storage.prototype, "setItem");
    const restored = create(addons);
    restored.init();
    restored.open();
    expect(restored.enabled).toBe(true);
    expect(write).not.toHaveBeenCalled();
    restored.enabled = false;
    expect(document.querySelector("[data-wft-devtools]")).toBeNull();
    expect(restored.getSnapshot()).toBeUndefined();
    expect(window.DevKitDevTools).toBe(restored);
    expect(readPreferences(window)).toEqual({ enabled: false });
    const scanCount = addons.mock.calls.length;
    restored.open();
    restored.refresh();
    expect(addons).toHaveBeenCalledTimes(scanCount);
    restored.destroy();
    const disabled = create();
    disabled.init();
    expect(disabled.enabled).toBe(false);
    expect(document.querySelector("[data-wft-devtools]")).toBeNull();
  });

  it("does not treat stored appearance as an activation flag", () => {
    window.localStorage.setItem(
      preferencesKey,
      JSON.stringify({ version: 1, width: 500, height: 300, opacity: 0.5 }),
    );
    const controller = create();
    const write = vi.spyOn(Storage.prototype, "setItem");
    controller.init();
    expect(controller.enabled).toBe(false);
    expect(document.querySelector("[data-wft-devtools]")).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it("continues to work without persistence when storage access is blocked", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const controller = create();
    expect(() => controller.init()).not.toThrow();
    expect(controller.enabled).toBe(false);
    expect(() => {
      controller.enabled = true;
      controller.open();
    }).not.toThrow();
    expect(document.querySelector("[data-wft-devtools]")).not.toBeNull();
    expect(() => {
      controller.enabled = false;
    }).not.toThrow();
    expect(document.querySelector("[data-wft-devtools]")).toBeNull();
  });

  it("tolerates full storage and never falls back to cookies or session storage", () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const controller = create();
    controller.init();
    controller.enabled = true;
    controller.open();
    expect(controller.enabled).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(document.cookie).toBe("");
    expect(window.sessionStorage.length).toBe(0);
  });

  it("does not overwrite an existing global or delete its replacement during cleanup", () => {
    const foreign = {};
    Object.defineProperty(window, "DevKitDevTools", { value: foreign, configurable: true });
    const controller = create();
    expect(() => controller.init()).toThrow("already exists");
    controller.destroy();
    expect(window.DevKitDevTools).toBe(foreign);
    Reflect.deleteProperty(window, "DevKitDevTools");
    controller.init();
    Object.defineProperty(window, "DevKitDevTools", { value: foreign, configurable: true });
    controller.destroy();
    expect(window.DevKitDevTools).toBe(foreign);
    Reflect.deleteProperty(window, "DevKitDevTools");
  });

  it("requires a boolean flag", () => {
    const controller = create();
    expect(() => Reflect.set(controller, "enabled", "false")).toThrow("true or false");
    expect(window.localStorage.length).toBe(0);
    expect(window.DevKitDevTools).toBeUndefined();
  });

  it("only waits for a body when enabled and cancels that wait on disable", () => {
    const body = document.body;
    body.remove();
    try {
      const listeners = vi.spyOn(document, "addEventListener");
      const controller = create();
      controller.init();
      expect(listeners).not.toHaveBeenCalled();
      controller.enabled = true;
      expect(listeners).toHaveBeenCalledWith("DOMContentLoaded", expect.any(Function), {
        once: true,
      });
      controller.enabled = false;
      document.documentElement.append(body);
      document.dispatchEvent(new Event("DOMContentLoaded"));
      expect(document.querySelector("[data-wft-devtools]")).toBeNull();
    } finally {
      if (!body.isConnected) document.documentElement.append(body);
    }
  });

  it("honors an explicit open before the body exists when DOM readiness arrives", () => {
    const body = document.body;
    body.remove();
    try {
      const controller = create();
      controller.enabled = true;
      controller.open();
      expect(controller.getSnapshot()).toBeUndefined();
      document.documentElement.append(body);
      document.dispatchEvent(new Event("DOMContentLoaded"));
      expect(
        document
          .querySelector("[data-wft-devtools]")!
          .shadowRoot!.querySelector<HTMLElement>(".panel")!.hidden,
      ).toBe(false);
      expect(controller.getSnapshot()).toBeDefined();
    } finally {
      if (!body.isConnected) document.documentElement.append(body);
    }
  });
});

describe("fresh addon sources", () => {
  it("reads a callback on each scan so addons loaded after the inspector are included", () => {
    let registrations: readonly DevToolsRegistration[] = [];
    const source = vi.fn(() => registrations);
    const controller = create(source);
    controller.init();
    controller.enabled = true;
    controller.open();
    expect(controller.getSnapshot()?.addons).toEqual([]);
    registrations = [registration];
    expect(controller.refresh()?.addons[0]?.name).toBe("probe");
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("reads the optional runtime registry only on scans, including a late runtime install", () => {
    const registryRead = vi.fn(() => undefined);
    Object.defineProperty(window, "slicemediaDevKit", { get: registryRead, configurable: true });
    const controller = create();
    controller.init();
    expect(registryRead).not.toHaveBeenCalled();
    controller.enabled = true;
    expect(registryRead).not.toHaveBeenCalled();
    controller.open();
    expect(registryRead).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()?.addons).toEqual([]);
    Reflect.deleteProperty(window, "slicemediaDevKit");
    const { runtime } = installDevKitRuntime({ window: window as DevKitHost, version: "1.0.0" });
    runtime.registerAddon({ name: "probe", version: "1.0.0", value: registration.addon });
    runtime.registerAddon({ name: "unrelated", version: "1.0.0", value: { refresh() {} } });
    expect(controller.refresh()?.addons.map((addon) => addon.name)).toEqual(["probe", "unrelated"]);
    expect(controller.getSnapshot()?.addons[1]?.issues[0]?.message).toContain("unverified");
  });
});

describe("stored preferences and host policy", () => {
  it.each(["webflow.io", "example.webflow.io", "nested.example.webflow.io", "Example.Webflow.IO."])(
    "recognizes staging host %s",
    (hostname) => {
      expect(isWebflowStaging(hostname)).toBe(true);
    },
  );
  it.each([
    "localhost",
    "127.0.0.1",
    "example.test",
    "webflow.io.example.test",
    "fakewebflow.io",
    "webflow.com",
  ])("keeps host %s dormant", (hostname) => {
    expect(isWebflowStaging(hostname)).toBe(false);
  });
  it.each(["broken json", "null", "[]", '{"version":2,"enabled":true}', '{"enabled":true}'])(
    "ignores invalid storage without repairing it: %s",
    (raw) => {
      window.localStorage.setItem(preferencesKey, raw);
      const write = vi.spyOn(Storage.prototype, "setItem");
      expect(readPreferences(window)).toEqual({});
      create().init();
      expect(window.DevKitDevTools?.enabled).toBe(false);
      expect(window.localStorage.getItem(preferencesKey)).toBe(raw);
      expect(write).not.toHaveBeenCalled();
    },
  );
  it("validates each preference and drops unexpected fields", () => {
    window.localStorage.setItem(
      preferencesKey,
      JSON.stringify({
        version: 1,
        enabled: "true",
        width: -1,
        height: 1e20,
        opacity: 0,
        unrelated: "ignore",
      }),
    );
    expect(readPreferences(window)).toEqual({});
    window.localStorage.setItem(
      preferencesKey,
      JSON.stringify({
        version: 1,
        enabled: false,
        width: 640,
        height: 480,
        opacity: 0.2,
        unrelated: "ignore",
      }),
    );
    expect(readPreferences(window)).toEqual({
      enabled: false,
      width: 640,
      height: 480,
      opacity: 0.2,
    });
  });
});
