import { afterEach, expect, it, vi } from "vitest";

import { createCounter } from "../docs/examples/on-demand-counter/counter.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it("the documentation counter defers frames, pauses offscreen, resumes elapsed time and restores authored text", async () => {
  const observers: IntersectionObserverCallback[] = [];
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push(callback);
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  let nextFrame = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  document.body.innerHTML = '<span data-wft-counter data-wft-counter-to="250">250</span>';
  const target = document.querySelector("span")!;
  const counter = createCounter();
  await counter.init();
  expect(frames.size).toBe(0);
  const intersect = (visible: boolean): void =>
    observers[0]!(
      [
        {
          target,
          isIntersecting: visible,
          intersectionRatio: visible ? 1 : 0,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
  const tick = (time: number): void => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(time));
  };
  intersect(true);
  tick(0);
  tick(600);
  expect(target.textContent).toBe("125");
  intersect(false);
  expect(frames.size).toBe(0);
  intersect(true);
  tick(3000);
  expect(target.textContent).toBe("125");
  tick(3600);
  expect(target.textContent).toBe("250");
  expect(frames.size).toBe(0);
  await counter.destroy();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(target.textContent).toBe("250");
});
