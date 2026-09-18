import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLayoutRefreshGuard,
  observeElementVisibility,
  observeViewportEntryOnce,
} from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function intersectionMock() {
  let deliver: IntersectionObserverCallback;
  const disconnect = vi.fn();
  const observe = vi.fn();
  const Constructor = vi.fn(
    class {
      constructor(callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
        deliver = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("IntersectionObserver", Constructor);
  return {
    Constructor,
    disconnect,
    observe,
    send(target: Element, visible: boolean) {
      deliver(
        [
          {
            target,
            isIntersecting: visible,
            intersectionRatio: visible ? 1 : 0,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    },
  };
}

describe("opt-in visibility", () => {
  it("activates a group once near the viewport and ignores deliveries after cleanup", async () => {
    const observer = intersectionMock();
    const first = document.createElement("div");
    const second = document.createElement("div");
    const activate = vi.fn();
    const stop = observeViewportEntryOnce([first, first, second], activate, {
      rootMargin: "800px",
    });
    await Promise.resolve();
    expect(activate).not.toHaveBeenCalled();
    expect(observer.observe).toHaveBeenCalledTimes(2);
    expect(observer.Constructor.mock.calls[0]?.[1]).toMatchObject({ rootMargin: "800px" });
    observer.send(second, true);
    observer.send(first, true);
    stop();
    expect(activate).toHaveBeenCalledExactlyOnceWith(second);
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it("pauses offscreen and in background tabs, without restarting an offscreen target", async () => {
    const observer = intersectionMock();
    const target = document.createElement("div");
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const listener = vi.fn();
    const stop = observeElementVisibility([target], listener);
    await Promise.resolve();
    observer.send(target, true);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    observer.send(target, false);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(listener.mock.calls.map(([change]) => change.visible)).toEqual([false, true, false]);
    stop();
    observer.send(target, true);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("falls back to eager initialization without IO and supports abort before activation", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const target = document.createElement("div");
    const enter = vi.fn();
    observeViewportEntryOnce([target], enter);
    await Promise.resolve();
    expect(enter).toHaveBeenCalledOnce();
    const controller = new AbortController();
    const cancelled = vi.fn();
    observeViewportEntryOnce([target], cancelled, { signal: controller.signal });
    controller.abort();
    await Promise.resolve();
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe("layout refresh guard", () => {
  it("coalesces late image events and CMS changes and does not observe its own refresh mutations", async () => {
    vi.useFakeTimers();
    const root = document.createElement("section");
    document.body.append(root);
    const refresh = vi.fn(() => root.append(document.createElement("div")));
    const guard = createLayoutRefreshGuard(refresh, {
      root,
      observeFonts: false,
      debounceMs: 30,
      refreshOnWindowLoad: false,
    });
    const image = document.createElement("img");
    root.append(image);
    image.dispatchEvent(new Event("load"));
    image.dispatchEvent(new Event("error"));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30);
    expect(refresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(300);
    expect(refresh).toHaveBeenCalledOnce();
    guard.destroy();
    guard.destroy();
    image.dispatchEvent(new Event("load"));
    guard.schedule();
    await vi.advanceTimersByTimeAsync(300);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refreshes after font readiness and cancels pending refreshes on abort", async () => {
    vi.useFakeTimers();
    const fonts = new EventTarget();
    let ready!: () => void;
    Object.assign(fonts, {
      ready: new Promise<void>((resolve) => {
        ready = resolve;
      }),
    });
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
    const refresh = vi.fn();
    const abort = new AbortController();
    const guard = createLayoutRefreshGuard(refresh, {
      signal: abort.signal,
      observeMutations: false,
      refreshOnWindowLoad: false,
    });
    ready();
    await vi.advanceTimersByTimeAsync(80);
    expect(refresh).toHaveBeenCalledOnce();
    fonts.dispatchEvent(new Event("loadingdone"));
    abort.abort();
    await vi.advanceTimersByTimeAsync(100);
    expect(refresh).toHaveBeenCalledOnce();
    guard.destroy();
    Reflect.deleteProperty(document, "fonts");
  });

  it.each(["loading", "complete"] as const)(
    "runs settling passes for %s documents and exposes refresh diagnostics",
    async (readyState) => {
      vi.useFakeTimers();
      vi.spyOn(document, "readyState", "get").mockReturnValue(readyState);
      const diagnostic = vi.fn();
      const refresh = vi
        .fn<() => boolean | void>()
        .mockReturnValueOnce(false)
        .mockImplementationOnce(() => {
          throw new Error("Refresh failed");
        });
      const guard = createLayoutRefreshGuard(refresh, {
        observeFonts: false,
        observeImages: false,
        observeMutations: false,
        debounceMs: 10,
        onRefresh: diagnostic,
      });
      if (readyState === "loading") {
        await vi.advanceTimersByTimeAsync(20);
        expect(refresh).not.toHaveBeenCalled();
        window.dispatchEvent(new Event("load"));
      }
      await vi.advanceTimersByTimeAsync(10);
      expect(guard.getState()).toMatchObject({
        skippedCount: 1,
        pendingLoadPasses: 3,
        lastRefresh: { status: "skipped", reasons: ["window-load"] },
      });
      await vi.advanceTimersByTimeAsync(300);
      expect(guard.getState()).toMatchObject({
        errorCount: 1,
        lastRefresh: { status: "error", reasons: ["window-load+300ms"] },
      });
      await vi.advanceTimersByTimeAsync(700);
      expect(guard.getState().refreshCount).toBe(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(guard.getState().refreshCount).toBe(2);
      expect(diagnostic).toHaveBeenCalledTimes(4);
      guard.destroy();
    },
  );

  it("coalesces reasons and cancels every load timer on abort", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
    const abort = new AbortController();
    const refresh = vi.fn();
    const guard = createLayoutRefreshGuard(refresh, {
      signal: abort.signal,
      observeFonts: false,
      observeImages: false,
    });
    guard.schedule("cms");
    guard.schedule("slider");
    await vi.advanceTimersByTimeAsync(80);
    expect(guard.getState().lastRefresh?.reasons).toEqual(["window-load", "cms", "slider"]);
    abort.abort();
    await vi.advanceTimersByTimeAsync(3000);
    guard.refreshNow();
    expect(refresh).toHaveBeenCalledOnce();
    expect(guard.getState()).toMatchObject({
      active: false,
      pendingLoadPasses: 0,
      pendingReasons: [],
    });
  });
});
