import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBreakpointService,
  getViewportSnapshot,
  getWebflowBreakpoint,
  observeViewport,
  onDomReady,
  resolveCssLength,
} from "../src/index.js";

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

function setViewport(width: number, height = window.innerHeight): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

afterEach(() => {
  setViewport(originalWidth, originalHeight);
});

describe("DOM readiness", () => {
  it("runs asynchronously for a ready document and supports cancellation", async () => {
    const ready = vi.fn();
    const cancelled = vi.fn();
    onDomReady(ready, document);
    const cancel = onDomReady(cancelled, document);
    cancel();

    expect(ready).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(ready).toHaveBeenCalledOnce();
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("waits for DOMContentLoaded while the document is loading", () => {
    const readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const callback = vi.fn();
    onDomReady(callback, document);

    expect(callback).not.toHaveBeenCalled();
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(callback).toHaveBeenCalledOnce();
    readyState.mockRestore();
  });
});

describe("Webflow breakpoints", () => {
  it("uses the native tiny, small, medium, and main boundaries", () => {
    expect(getWebflowBreakpoint(479).name).toBe("tiny");
    expect(getWebflowBreakpoint(480).name).toBe("small");
    expect(getWebflowBreakpoint(768).name).toBe("medium");
    expect(getWebflowBreakpoint(992).name).toBe("main");
  });

  it("notifies only when the active breakpoint changes and tears down safely", () => {
    setViewport(400);
    const service = createBreakpointService({ window });
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    setViewport(450);
    window.dispatchEvent(new Event("resize"));
    setViewport(500);
    window.dispatchEvent(new Event("resize"));

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]?.[0].name).toBe("small");
    unsubscribe();
    unsubscribe();
    service.destroy();
    service.destroy();
  });
});

describe("viewport observation", () => {
  it("reports changed dimensions and has idempotent cleanup", () => {
    setViewport(800, 600);
    expect(getViewportSnapshot(window)).toMatchObject({ width: 800, height: 600, scale: 1 });
    const listener = vi.fn();
    const cleanup = observeViewport(listener, { window });

    setViewport(900, 650);
    window.dispatchEvent(new Event("resize"));
    cleanup();
    cleanup();
    setViewport(1000, 700);
    window.dispatchEvent(new Event("resize"));

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]?.[0]).toMatchObject({ width: 900, height: 650 });
  });
});

describe("CSS length resolution", () => {
  it("resolves common relative and absolute units", () => {
    setViewport(1_000, 800);
    expect(resolveCssLength("12px")).toBe(12);
    expect(resolveCssLength("2rem", { rootFontSize: 10 })).toBe(20);
    expect(resolveCssLength("1.5em", { fontSize: 20 })).toBe(30);
    expect(resolveCssLength("50vw", { window })).toBe(500);
    expect(resolveCssLength("25vh", { window })).toBe(200);
    expect(resolveCssLength("25%", { relativeTo: 400 })).toBe(100);
    expect(resolveCssLength("1in")).toBe(96);
    expect(resolveCssLength("calc(100% - 1rem)")).toBeNull();
    expect(resolveCssLength("2")).toBeNull();
  });
});
