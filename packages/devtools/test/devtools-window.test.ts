// @vitest-environment-options {"url":"https://inspector.webflow.io/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDevTools, type DevToolsController } from "../src/index.js";
import { preferencesKey, readPreferences } from "../src/preferences.js";

const controllers: DevToolsController[] = [];
function mount() {
  const controller = createDevTools();
  controllers.push(controller);
  controller.open();
  const shadow = document.querySelector("[data-wft-devtools]")!.shadowRoot!;
  const panel = shadow.querySelector<HTMLElement>(".panel")!;
  vi.spyOn(panel, "getBoundingClientRect").mockImplementation(
    () =>
      new DOMRect(
        Number.parseFloat(panel.style.left) || 100,
        Number.parseFloat(panel.style.top) || 80,
        Number.parseFloat(panel.style.width) || 500,
        Number.parseFloat(panel.style.height) || 400,
      ),
  );
  return { controller, panel, shadow };
}
function pointer(type: string, x: number, y: number): Event {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    composed: true,
  });
  Object.defineProperties(event, { pointerId: { value: 7 }, isPrimary: { value: true } });
  return event;
}

beforeEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
});
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.destroy();
});

describe("desktop window resizing", () => {
  it.each([
    ["n", 0, -40, 100, 40, 500, 440],
    ["ne", 40, -40, 100, 40, 540, 440],
    ["e", 40, 0, 100, 80, 540, 400],
    ["se", 40, 40, 100, 80, 540, 440],
    ["s", 0, 40, 100, 80, 500, 440],
    ["sw", -40, 40, 60, 80, 540, 440],
    ["w", -40, 0, 60, 80, 540, 400],
    ["nw", -40, -40, 60, 40, 540, 440],
  ] as const)(
    "resizes from %s while keeping the opposite edges anchored",
    (edge, dx, dy, left, top, width, height) => {
      const { panel, shadow } = mount();
      const write = vi.spyOn(Storage.prototype, "setItem");
      const handle = shadow.querySelector<HTMLButtonElement>(`.window-resize-${edge}`)!;
      handle.dispatchEvent(pointer("pointerdown", 200, 200));
      handle.dispatchEvent(pointer("pointermove", 200 + dx, 200 + dy));
      expect(panel.getBoundingClientRect()).toMatchObject({ left, top, width, height });
      expect(write).not.toHaveBeenCalled();
      handle.dispatchEvent(pointer("pointerup", 200 + dx, 200 + dy));
      expect(readPreferences(window)).toEqual({ width, height });
      expect(write).toHaveBeenCalledTimes(1);
    },
  );

  it("returns to the starting size during a gesture and supports keyboard resizing", () => {
    const { panel, shadow } = mount();
    const handle = shadow.querySelector<HTMLButtonElement>(".window-resize-e")!;
    handle.dispatchEvent(pointer("pointerdown", 600, 200));
    handle.dispatchEvent(pointer("pointermove", 700, 200));
    expect(panel.getBoundingClientRect().width).toBe(600);
    handle.dispatchEvent(pointer("pointermove", 600, 250));
    expect(panel.getBoundingClientRect().width).toBe(500);
    handle.dispatchEvent(pointer("pointerup", 600, 250));
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }),
    );
    expect(panel.getBoundingClientRect().width).toBe(540);
    expect(readPreferences(window)).toEqual({ width: 540, height: 400 });
  });

  it("bounds size and preserves the saved preference through viewport changes", () => {
    const { panel, shadow } = mount();
    const handle = shadow.querySelector<HTMLButtonElement>(".window-resize-se")!;
    handle.dispatchEvent(pointer("pointerdown", 600, 480));
    handle.dispatchEvent(pointer("pointermove", -1000, -1000));
    expect(panel.getBoundingClientRect()).toMatchObject({ width: 360, height: 240 });
    handle.dispatchEvent(pointer("pointermove", 10000, 10000));
    expect(panel.getBoundingClientRect()).toMatchObject({
      right: window.innerWidth - 8,
      bottom: window.innerHeight - 50,
    });
    handle.dispatchEvent(pointer("pointerup", 10000, 10000));
    const saved = window.localStorage.getItem(preferencesKey);
    const write = vi.spyOn(Storage.prototype, "setItem");
    const width = window.innerWidth;
    const height = window.innerHeight;
    try {
      Object.assign(window, { innerWidth: 320, innerHeight: 400 });
      window.dispatchEvent(new Event("resize"));
      expect(panel.getBoundingClientRect()).toMatchObject({
        left: 8,
        top: 8,
        width: 304,
        height: 342,
      });
      Object.assign(window, { innerWidth: width, innerHeight: height });
      window.dispatchEvent(new Event("resize"));
      expect(panel.getBoundingClientRect()).toMatchObject({
        width: width - 108,
        height: height - 130,
      });
      expect(window.localStorage.getItem(preferencesKey)).toBe(saved);
      expect(write).not.toHaveBeenCalled();
    } finally {
      Object.assign(window, { innerWidth: width, innerHeight: height });
    }
  });

  it("does not write on startup, clicks without resizing, scans, or toolbar moves", () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    const { controller, shadow } = mount();
    const handle = shadow.querySelector<HTMLButtonElement>(".window-resize-se")!;
    handle.dispatchEvent(pointer("pointerdown", 600, 480));
    handle.dispatchEvent(pointer("pointerup", 600, 480));
    shadow
      .querySelector<HTMLElement>(".heading")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    controller.refresh();
    controller.close();
    controller.open();
    controller.destroy();
    expect(write).not.toHaveBeenCalled();
  });

  it("cancels captures and detaches resize controls when disabled", () => {
    const { controller, panel, shadow } = mount();
    const handle = shadow.querySelector<HTMLButtonElement>(".window-resize-e")!;
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);
    handle.releasePointerCapture = vi.fn();
    handle.dispatchEvent(pointer("pointerdown", 600, 200));
    handle.dispatchEvent(pointer("pointermove", 700, 200));
    controller.enabled = false;
    expect(handle.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    const saved = window.localStorage.getItem(preferencesKey);
    handle.dispatchEvent(pointer("pointerup", 700, 200));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(panel.style.width).toBe("600px");
    expect(window.localStorage.getItem(preferencesKey)).toBe(saved);
    expect(document.querySelector("[data-wft-devtools]")).toBeNull();
  });
});

describe("appearance persistence", () => {
  it("restores size and opacity after destruction without writing on restoration", () => {
    const { controller, shadow } = mount();
    const handle = shadow.querySelector<HTMLButtonElement>(".window-resize-e")!;
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }),
    );
    const opacity = shadow.querySelector<HTMLInputElement>(".opacity-slider")!;
    opacity.value = "45";
    opacity.dispatchEvent(new Event("input", { bubbles: true }));
    expect(readPreferences(window)).toEqual({ width: 540, height: 400, opacity: 0.45 });
    controller.destroy();
    const write = vi.spyOn(Storage.prototype, "setItem");
    const restored = mount();
    expect(restored.panel.style.width).toBe("540px");
    expect(restored.panel.style.height).toBe("400px");
    expect(restored.panel.style.opacity).toBe("0.45");
    expect(restored.shadow.querySelector<HTMLInputElement>(".opacity-slider")!.value).toBe("45");
    expect(write).not.toHaveBeenCalled();
  });

  it("honors an explicit saved disable on a Webflow staging domain", () => {
    window.localStorage.setItem(
      preferencesKey,
      JSON.stringify({ version: 1, enabled: false, opacity: 0.4 }),
    );
    const write = vi.spyOn(Storage.prototype, "setItem");
    const controller = createDevTools();
    controllers.push(controller);
    controller.open();
    expect(controller.enabled).toBe(false);
    expect(document.querySelector("[data-wft-devtools]")).toBeNull();
    expect(write).not.toHaveBeenCalled();
    controller.enabled = true;
    controller.open();
    expect(
      document
        .querySelector("[data-wft-devtools]")!
        .shadowRoot!.querySelector<HTMLElement>(".panel")!.style.opacity,
    ).toBe("0.4");
  });
});
