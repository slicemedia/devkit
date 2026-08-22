import { describe, expect, it, vi } from "vitest";

import { createEmitter } from "../src/index.js";

interface Events {
  value: number;
  message: string;
}

describe("createEmitter", () => {
  it("subscribes, snapshots listeners, and cleans up idempotently", () => {
    const emitter = createEmitter<Events>();
    const second = vi.fn();
    let unsubscribeSecond: () => void = () => undefined;
    const first = vi.fn(() => unsubscribeSecond());

    emitter.on("value", first);
    unsubscribeSecond = emitter.on("value", second);
    emitter.emit("value", 1);
    emitter.emit("value", 2);
    unsubscribeSecond();

    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(1);
    expect(emitter.listenerCount("value")).toBe(1);
  });

  it("supports once, off, and clear", () => {
    const emitter = createEmitter<Events>();
    const once = vi.fn();
    const regular = vi.fn();

    emitter.once("message", once);
    emitter.on("message", regular);
    emitter.emit("message", "first");
    emitter.emit("message", "second");
    emitter.off("message", regular);
    emitter.clear();

    expect(once).toHaveBeenCalledOnce();
    expect(regular).toHaveBeenCalledTimes(2);
    expect(emitter.listenerCount("message")).toBe(0);
  });
});
