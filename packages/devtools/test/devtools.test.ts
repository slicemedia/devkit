// @vitest-environment-options {"url":"https://inspector.webflow.io/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAddon, defineAddon } from "@slicemedia/devkit-core";
import { createDevTools, inspectDevKit } from "../src/index.js";
import type { DevToolsContract, DevToolsController, DevToolsRegistration } from "../src/index.js";

const definition = defineAddon({
  name: "probe",
  version: "0.1.0",
  description: "A neutral inspection fixture.",
  entry: "probe",
  defaultOptions: { selector: "[data-wft-probe]" },
  attributes: [
    { name: "data-wft-probe", type: "boolean", description: "Component root.", required: true },
    { name: "data-wft-item", type: "boolean", description: "Component item.", required: true },
    { name: "data-wft-count", type: "number", description: "Optional count." },
    {
      name: "data-wft-mode",
      type: "enum",
      values: ["auto", "manual"],
      description: "Optional mode.",
    },
    { name: "data-wft-target", type: "selector", description: "Optional selector." },
  ],
  setup: () => ({}),
});

const contract: DevToolsContract = {
  root: "[data-wft-probe]",
  attributes: [
    { name: "data-wft-probe", on: "root" },
    { name: "data-wft-item", on: "descendant" },
  ],
};

const controllers: DevToolsController[] = [];
function mount(addons: readonly DevToolsRegistration[]): DevToolsController {
  const controller = createDevTools({ addons, document });
  controllers.push(controller);
  controller.init();
  return controller;
}

function inspector(): ShadowRoot {
  return document.querySelector("[data-wft-devtools]")!.shadowRoot!;
}

function control(text: string): HTMLButtonElement {
  return [...inspector().querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === text || button.textContent === text,
  )!;
}

beforeEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
});

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
  vi.useRealTimers();
});

describe("read-only addon inspection", () => {
  it("inventories metadata without invoking addon behavior or mutating markup", () => {
    document.body.innerHTML =
      "<section data-wft-probe><span data-wft-item></span></section><aside data-wft-unclaimed></aside>";
    const addon = createAddon(definition);
    const setup = vi.spyOn(addon, "init");
    const state = vi.spyOn(addon, "getState");
    const before = document.body.innerHTML;
    const result = inspectDevKit({ document, addons: [{ addon, contract }] });
    expect(result.addons[0]).toMatchObject({
      name: "probe",
      version: "0.1.0",
      status: "idle",
      issues: [],
    });
    expect(result.addons[0]!.roots).toHaveLength(1);
    expect(result.addons[0]!.attributes[1]!.elements).toHaveLength(1);
    expect(result.unclaimedAttributes.map(({ name }) => name)).toEqual(["data-wft-unclaimed"]);
    expect(document.body.innerHTML).toBe(before);
    expect(setup).not.toHaveBeenCalled();
    expect(state).not.toHaveBeenCalled();
  });

  it("does not guess where a required attribute belongs without a location rule", () => {
    const result = inspectDevKit({ document, addons: [{ addon: createAddon(definition) }] });
    expect(result.addons[0]!.roots).toBeUndefined();
    expect(result.addons[0]!.issues.map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: "unscoped-requirement", severity: "info" },
      { code: "unscoped-requirement", severity: "info" },
    ]);
  });

  it("allows site-wide addons to be absent unless the project requires their roots", () => {
    const addon = createAddon(definition);
    const optional = inspectDevKit({ document, addons: [{ addon, contract }] });
    expect(optional.addons[0]!.roots).toEqual([]);
    expect(optional.addons[0]!.issues).toEqual([]);
    const required = inspectDevKit({
      document,
      addons: [{ addon, contract: { ...contract, required: true } }],
    });
    expect(required.addons[0]!.issues.map(({ code }) => code)).toEqual(["missing-root"]);
  });

  it("checks every root and does not let a nested instance satisfy its parent", () => {
    document.body.innerHTML =
      '<section data-wft-probe id="outer"><section data-wft-probe><span data-wft-item></span></section></section><section data-wft-probe id="empty"></section>';
    const result = inspectDevKit({
      document,
      addons: [{ addon: createAddon(definition), contract }],
    });
    expect(result.addons[0]!.issues.map(({ code, element }) => [code, element?.id])).toEqual([
      ["missing-attribute", "outer"],
      ["missing-attribute", "empty"],
    ]);
  });

  it("checks root attributes on each root and does not borrow descendant values", () => {
    document.body.innerHTML =
      '<section data-wft-probe><span data-wft-item data-wft-count="2"></span></section>';
    const result = inspectDevKit({
      document,
      addons: [
        {
          addon: createAddon(definition),
          contract: {
            ...contract,
            attributes: [
              ...contract.attributes!,
              { name: "data-wft-count", on: "root", required: true },
            ],
          },
        },
      ],
    });
    expect(result.addons[0]!.issues).toMatchObject([
      { code: "missing-attribute", attribute: "data-wft-count" },
    ]);
  });

  it("validates declared value types and keeps optional missing attributes valid", () => {
    document.body.innerHTML =
      '<section data-wft-probe="yes" data-wft-count="" data-wft-mode="surprise" data-wft-target="["><span data-wft-item="false"></span></section>';
    const result = inspectDevKit({
      document,
      addons: [{ addon: createAddon(definition), contract }],
    });
    expect(result.addons[0]!.issues.map(({ code, attribute }) => [code, attribute])).toEqual([
      ["invalid-value", "data-wft-probe"],
      ["invalid-value", "data-wft-count"],
      ["invalid-value", "data-wft-mode"],
      ["invalid-value", "data-wft-target"],
    ]);
    document.body.innerHTML =
      '<section data-wft-probe data-wft-count="2.5" data-wft-mode="auto" data-wft-target="[data-wft-item]"><span data-wft-item></span></section>';
    expect(
      inspectDevKit({ document, addons: [{ addon: createAddon(definition), contract }] }).addons[0]!
        .issues,
    ).toEqual([]);
  });

  it("uses explicit value conventions and allows a requirement override", () => {
    document.body.innerHTML = '<section data-wft-probe="enabled"></section>';
    const custom = createAddon(
      defineAddon({
        ...definition,
        attributes: [
          {
            name: "data-wft-probe",
            type: "boolean",
            values: ["enabled", "disabled"],
            description: "Custom marker.",
          },
          { name: "data-wft-item", type: "boolean", required: true, description: "Item." },
        ],
      }),
    );
    const result = inspectDevKit({
      document,
      addons: [
        {
          addon: custom,
          contract: {
            ...contract,
            attributes: [{ name: "data-wft-item", on: "descendant", required: false }],
          },
        },
      ],
    });
    expect(result.addons[0]!.issues).toEqual([]);
  });

  it("reports invalid selectors and undeclared or duplicate rules without aborting the scan", () => {
    const addon = createAddon(definition);
    const result = inspectDevKit({
      document,
      addons: [
        { addon, contract: { root: "[" } },
        {
          addon,
          contract: {
            ...contract,
            attributes: [
              { name: "data-wft-unknown", on: "root" },
              { name: "data-wft-item", on: "descendant" },
              { name: "data-wft-item", on: "root" },
            ],
          },
        },
      ],
    });
    expect(result.addons[0]!.issues).toMatchObject([{ code: "invalid-contract" }]);
    expect(result.addons[1]!.issues).toMatchObject([
      { code: "invalid-contract" },
      { code: "invalid-contract" },
    ]);
  });

  it("updates delayed markup and lifecycle status on a new scan", async () => {
    const addon = createAddon(definition);
    const before = inspectDevKit({ document, addons: [{ addon, contract }] });
    document.body.innerHTML = "<section data-wft-probe><span data-wft-item></span></section>";
    await addon.init();
    const after = inspectDevKit({ document, addons: [{ addon, contract }] });
    expect(before.addons[0]!.status).toBe("idle");
    expect(before.addons[0]!.roots).toHaveLength(0);
    expect(after.addons[0]!.status).toBe("ready");
    expect(after.addons[0]!.roots).toHaveLength(1);
    await addon.destroy();
  });

  it("keeps separate registrations scoped and does not cross shadow trees", () => {
    document.body.innerHTML =
      '<section id="first" data-wft-probe><span data-wft-item></span></section><section id="second" data-wft-probe></section><div id="shadow"></div>';
    document.querySelector("#shadow")!.attachShadow({ mode: "open" }).innerHTML =
      "<span data-wft-hidden></span>";
    const addon = createAddon(definition);
    const result = inspectDevKit({
      document,
      addons: [
        { addon, label: "First", contract: { ...contract, root: "#first" } },
        { addon, label: "Second", contract: { ...contract, root: "#second" } },
      ],
    });
    expect(result.addons[0]!.issues).toEqual([]);
    expect(result.addons[1]!.issues).toMatchObject([{ code: "missing-attribute" }]);
    expect(result.unclaimedAttributes).toEqual([]);
  });
});

describe("optional inspector panel", () => {
  it("is inert until initialized and mounts once per controller", () => {
    const tools = createDevTools({ addons: [], document });
    controllers.push(tools);
    expect(document.body.childElementCount).toBe(0);
    tools.init();
    tools.init();
    expect(document.querySelectorAll("[data-wft-devtools]")).toHaveLength(1);
    expect(inspector().querySelector<HTMLElement>("[role=dialog]")!.hidden).toBe(true);
    expect(tools.getSnapshot()).toBeUndefined();
    expect(() => createDevTools({ addons: [], document }).init()).toThrow("already mounted");
    tools.destroy();
    tools.destroy();
    tools.init();
    expect(document.querySelectorAll("[data-wft-devtools]")).toHaveLength(1);
  });

  it("opens from the launcher and closes with Escape, returning keyboard focus", () => {
    const tools = mount([]);
    const launcher = inspector().querySelector<HTMLButtonElement>(".launcher")!;
    launcher.click();
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(inspector().activeElement).toBe(control("Close"));
    expect(inspector().textContent).toContain("No addons registered");
    control("Close").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(inspector().activeElement).toBe(launcher);
    expect(inspector().querySelector<HTMLElement>("[role=dialog]")!.hidden).toBe(true);
    tools.open();
    control("Close").click();
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
  });

  it("rescans explicit addon instances without starting or refreshing them", async () => {
    document.body.innerHTML = "<section data-wft-probe></section>";
    const addon = createAddon(definition);
    const init = vi.spyOn(addon, "init");
    const refresh = vi.spyOn(addon, "refresh");
    const tools = mount([{ addon, contract }]);
    tools.open();
    expect(inspector().querySelector(".summary")!.textContent).toContain("1 issue");
    expect(init).not.toHaveBeenCalled();
    document.querySelector("section")!.append(document.createElement("span"));
    document.querySelector("section span")!.setAttribute("data-wft-item", "");
    await addon.init();
    expect(tools.getSnapshot()!.addons[0]!.status).toBe("idle");
    control("Rescan").click();
    expect(inspector().querySelector(".summary")!.textContent).toContain("0 issues");
    expect(tools.getSnapshot()!.addons[0]!.status).toBe("ready");
    expect(tools.getSnapshot()!.unclaimedAttributes).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
    await addon.destroy();
  });

  it("renders metadata as text and ignores only its own host during inspection", () => {
    document.body.innerHTML = '<div data-wft-devtools="authored"></div>';
    const tools = mount([
      { addon: createAddon(definition), label: '<img src=x onerror="alert(1)">' },
    ]);
    tools.open();
    const host = [...document.querySelectorAll("[data-wft-devtools]")].find(
      (element) => element.shadowRoot,
    )!;
    expect(host.shadowRoot!.querySelector("img")).toBeNull();
    expect(host.shadowRoot!.querySelector(".name")!.textContent).toContain("<img");
    expect(tools.getSnapshot()!.unclaimedAttributes[0]!.elements).toEqual([
      document.querySelector("[data-wft-devtools=authored]"),
    ]);
  });

  it("preserves addon selection and the collapsed attribute section across rescans", () => {
    document.body.innerHTML = "<section data-wft-probe data-wft-unclaimed></section>";
    const tools = mount([
      { addon: createAddon(definition), label: "First", contract },
      { addon: createAddon(definition), label: "Second", contract },
    ]);
    tools.open();
    const links = inspector().querySelectorAll<HTMLButtonElement>(".addon-link");
    const content = inspector().querySelector<HTMLElement>(".content")!;
    const unclaimed = inspector().querySelector<HTMLDetailsElement>(".unclaimed")!;
    expect(unclaimed.open).toBe(false);
    expect(links[0]!.getAttribute("aria-current")).toBe("true");
    links[1]!.focus();
    links[1]!.click();
    expect(content.getAttribute("aria-label")).toBe("Second details");
    expect(inspector().activeElement).toBe(links[1]);
    expect(links[0]!.hasAttribute("aria-current")).toBe(false);
    unclaimed.open = true;
    content.scrollTop = 60;
    control("Rescan").click();
    expect(content.getAttribute("aria-label")).toBe("Second details");
    expect(content.scrollTop).toBe(60);
    expect(unclaimed.open).toBe(true);
    document.querySelector("section")!.removeAttribute("data-wft-unclaimed");
    tools.refresh();
    expect(unclaimed.hidden).toBe(true);
  });

  it("adjusts opacity without affecting page content and dismisses its popover before the panel", () => {
    document.body.innerHTML = '<main style="opacity: 0.8">Page content</main>';
    const tools = mount([]);
    tools.open();
    const panel = inspector().querySelector<HTMLElement>(".panel")!;
    const popover = inspector().querySelector<HTMLElement>(".opacity-popover")!;
    const input = inspector().querySelector<HTMLInputElement>(".opacity-slider")!;
    control("Panel opacity").click();
    expect(inspector().activeElement).toBe(input);
    input.value = "45";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(panel.style.opacity).toBe("0.45");
    expect(document.querySelector("main")!.style.opacity).toBe("0.8");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(popover.hidden).toBe(true);
    expect(panel.hidden).toBe(false);
    expect(inspector().activeElement).toBe(control("Panel opacity"));
    tools.close();
    tools.open();
    expect(panel.style.opacity).toBe("0.45");
    control("Panel opacity").click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(popover.hidden).toBe(true);
    tools.destroy();
    input.value = "90";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(panel.style.opacity).toBe("0.45");
  });

  it("drags from the toolbar, excludes controls, clamps movement, and releases captures on destroy", () => {
    const tools = mount([]);
    tools.open();
    const panel = inspector().querySelector<HTMLElement>(".panel")!;
    const toolbar = inspector().querySelector<HTMLElement>(".heading")!;
    vi.spyOn(panel, "getBoundingClientRect").mockImplementation(
      () =>
        new DOMRect(
          Number.parseFloat(panel.style.left) || 20,
          Number.parseFloat(panel.style.top) || 40,
          300,
          200,
        ),
    );
    toolbar.setPointerCapture = vi.fn();
    toolbar.hasPointerCapture = vi.fn(() => true);
    toolbar.releasePointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number): Event => {
      const event = new MouseEvent(type, {
        clientX: x,
        clientY: y,
        button: 0,
        bubbles: true,
        composed: true,
      });
      Object.defineProperties(event, { pointerId: { value: 7 }, isPrimary: { value: true } });
      return event;
    };
    control("Rescan").dispatchEvent(pointer("pointerdown", 30, 50));
    toolbar.dispatchEvent(pointer("pointermove", 130, 150));
    expect(panel.style.left).toBe("");
    toolbar.querySelector("h2")!.dispatchEvent(pointer("pointerdown", 30, 50));
    toolbar.dispatchEvent(pointer("pointermove", 130, 150));
    expect(panel.style.left).toBe("120px");
    expect(panel.style.top).toBe("140px");
    expect(toolbar.setPointerCapture).toHaveBeenCalledWith(7);
    toolbar.dispatchEvent(pointer("pointercancel", 130, 150));
    expect(toolbar.releasePointerCapture).toHaveBeenCalledWith(7);
    toolbar.dispatchEvent(pointer("pointermove", 150, 170));
    expect(panel.style.left).toBe("120px");
    toolbar.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true }),
    );
    expect(panel.style.left).toBe("80px");
    toolbar.dispatchEvent(pointer("pointerdown", 90, 150));
    toolbar.dispatchEvent(pointer("pointermove", -100, 10000));
    expect(panel.style.left).toBe("8px");
    expect(panel.style.top).toBe(`${window.innerHeight - 250}px`);
    tools.destroy();
    expect(toolbar.releasePointerCapture).toHaveBeenCalledTimes(2);
    toolbar.dispatchEvent(pointer("pointermove", 200, 200));
    expect(panel.style.left).toBe("8px");
  });

  it("resizes the drawer, preserves the chosen height, and releases its controls on destroy", () => {
    document.body.innerHTML = "<section data-wft-unclaimed></section>";
    const tools = mount([]);
    tools.open();
    const panel = inspector().querySelector<HTMLElement>(".panel")!;
    const drawer = inspector().querySelector<HTMLDetailsElement>(".unclaimed")!;
    const content = inspector().querySelector<HTMLElement>(".unclaimed-content")!;
    const handle = inspector().querySelector<HTMLElement>(".unclaimed-resize")!;
    const panelHeight = vi.spyOn(panel, "clientHeight", "get").mockReturnValue(578);
    vi.spyOn(
      inspector().querySelector<HTMLElement>(".header")!,
      "offsetHeight",
      "get",
    ).mockReturnValue(110);
    vi.spyOn(drawer.querySelector<HTMLElement>("summary")!, "offsetHeight", "get").mockReturnValue(
      50,
    );
    vi.spyOn(content, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 0, 500, Number.parseFloat(content.style.height) || 180),
    );
    drawer.open = true;
    tools.refresh();
    expect(content.style.height).toBe("");
    expect(handle.getAttribute("aria-valuenow")).toBe("180");
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true }),
    );
    expect(content.style.height).toBe("220px");
    drawer.open = false;
    tools.refresh();
    drawer.open = true;
    tools.refresh();
    expect(content.style.height).toBe("220px");
    panelHeight.mockReturnValue(300);
    window.dispatchEvent(new Event("resize"));
    expect(Number.parseFloat(content.style.height)).toBeLessThan(100);
    panelHeight.mockReturnValue(578);
    window.dispatchEvent(new Event("resize"));
    expect(content.style.height).toBe("220px");
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(content.style.height).toBe("");
    expect(content.classList.contains("resized")).toBe(false);

    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);
    handle.releasePointerCapture = vi.fn();
    const pointer = (type: string, y: number): Event => {
      const event = new MouseEvent(type, { clientY: y, button: 0, bubbles: true, composed: true });
      Object.defineProperties(event, { pointerId: { value: 9 }, isPrimary: { value: true } });
      return event;
    };
    handle.dispatchEvent(pointer("pointerdown", 500));
    handle.dispatchEvent(pointer("pointermove", 430));
    expect(content.style.height).toBe("250px");
    expect(panel.style.top).toBe("");
    expect(handle.setPointerCapture).toHaveBeenCalledWith(9);
    handle.dispatchEvent(pointer("pointercancel", 430));
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(9);
    handle.dispatchEvent(pointer("pointermove", 460));
    expect(content.style.height).toBe("250px");
    handle.dispatchEvent(pointer("pointerdown", 430));
    tools.close();
    expect(handle.releasePointerCapture).toHaveBeenCalledTimes(2);
    tools.open();
    expect(content.style.height).toBe("250px");
    tools.destroy();
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(content.style.height).toBe("250px");
  });

  it("cleans up highlights, timers, listeners, and retained UI without touching the addon", () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<button id="before">Page control</button><section data-wft-probe style="outline: 3px solid red" aria-label="Authored"></section>';
    const baseline = document.body.innerHTML;
    const root = document.querySelector("section")!;
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 40, 200, 100));
    const removeListener = vi.spyOn(window, "removeEventListener");
    const addon = createAddon(definition);
    const destroy = vi.spyOn(addon, "destroy");
    const tools = mount([{ addon, contract }]);
    document.querySelector<HTMLButtonElement>("#before")!.focus();
    tools.open();
    const host = document.querySelector("[data-wft-devtools]")!;
    const oldLauncher = inspector().querySelector<HTMLButtonElement>(".launcher")!;
    // Flush jsdom's queued <details> toggle events before measuring inspector timers.
    vi.runOnlyPendingTimers();
    control("Locate").click();
    expect(inspector().querySelector<HTMLElement>(".highlight")!.hidden).toBe(false);
    expect(root.getAttribute("style")).toBe("outline: 3px solid red");
    tools.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(removeListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(document.body.innerHTML).toBe(baseline);
    expect(document.activeElement).toBe(document.querySelector("#before"));
    expect(destroy).not.toHaveBeenCalled();
    expect(tools.getSnapshot()).toBeUndefined();
    oldLauncher.click();
    expect(host.isConnected).toBe(false);
    expect(document.querySelector("[data-wft-devtools]")).toBeNull();
  });

  it("reports stale elements and closes highlights without editing the page", () => {
    document.body.innerHTML = "<section data-wft-probe></section>";
    const tools = mount([{ addon: createAddon(definition), contract }]);
    tools.open();
    document.querySelector("section")!.remove();
    control("Locate").click();
    expect(inspector().querySelector(".summary")!.textContent).toContain("no longer on this page");
    control("Rescan").click();
    expect(inspector().textContent).toContain("Not used on this page");
  });
});
