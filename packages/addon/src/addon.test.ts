import { afterEach, describe, expect, it, vi } from "vitest";

import { createExampleAddon, exampleAddonDefinition } from "./example/index.js";
import * as addonApi from "./index.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("addon authoring package", () => {
  it("exposes only the side-effect-free core authoring API from its root", () => {
    expect(Object.keys(addonApi).sort()).toEqual([
      "AddonDefinitionError",
      "AddonLifecycleError",
      "createAddon",
      "defineAddon",
      "getAddonMetadata",
    ]);
    expect("exampleAddonDefinition" in addonApi).toBe(false);
    expect("slicemediaDevKit" in window).toBe(false);
  });

  it("keeps the explicit example inert until initialization", async () => {
    document.body.innerHTML = '<div data-wft-example data-wft-example-state="authored"></div>';
    const instance = createExampleAddon({}, { window, document });

    expect(exampleAddonDefinition.entry).toBe("@slicemedia/devkit-addon/example");
    expect(
      document.querySelector("[data-wft-example]")?.getAttribute("data-wft-example-state"),
    ).toBe("authored");
    expect(instance.status).toBe("idle");

    await instance.init();
    expect(
      document.querySelector("[data-wft-example]")?.getAttribute("data-wft-example-state"),
    ).toBe("ready");
    expect(instance.getState()).toEqual({ instances: 1 });
    await instance.destroy();
    expect(
      document.querySelector("[data-wft-example]")?.getAttribute("data-wft-example-state"),
    ).toBe("authored");
  });

  it("reconciles multiple and later CMS roots, option changes, events, and cleanup", async () => {
    document.body.innerHTML = `
      <div data-wft-example></div>
      <div data-other-example data-wft-example-state="custom"></div>
    `;
    const instance = createExampleAddon({}, { window, document });
    const reconcile = vi.fn();
    const unsubscribe = instance.on("reconcile", reconcile);

    await instance.init();
    document.body.insertAdjacentHTML("beforeend", "<div data-wft-example></div>");
    await instance.refresh();
    expect(instance.getState()).toEqual({ instances: 2 });

    await instance.setOptions({ selector: "[data-other-example]" });
    expect(instance.getState()).toEqual({ instances: 1 });
    expect(
      document.querySelector("[data-wft-example]")?.hasAttribute("data-wft-example-state"),
    ).toBe(false);
    expect(
      document.querySelector("[data-other-example]")?.getAttribute("data-wft-example-state"),
    ).toBe("ready");
    expect(reconcile).toHaveBeenCalledTimes(3);

    unsubscribe();
    await instance.destroy();
    expect(
      document.querySelector("[data-other-example]")?.getAttribute("data-wft-example-state"),
    ).toBe("custom");

    await instance.init();
    expect(instance.getState()).toEqual({ instances: 1 });
    await instance.destroy();
  });
});
