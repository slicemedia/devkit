import { afterEach, describe, expect, it, vi } from "vitest";

import { installDevKitRuntime } from "../src/index.js";
import type { DevKitHost, RuntimeQueueItem } from "../src/index.js";

describe("global runtime installation", () => {
  afterEach(() => {
    delete window.slicemediaDevKit;
  });

  it("does not install anything merely by importing core", () => {
    expect(window.slicemediaDevKit).toBeUndefined();
  });

  it("consumes bootstrap config and queue in order", async () => {
    const calls: string[] = [];
    const bootstrapQueue: RuntimeQueueItem[] = [
      { type: "configure", config: { locale: "en" } },
      (runtime) => {
        calls.push(runtime.config.locale as string);
      },
    ];
    const host: DevKitHost = {
      slicemediaDevKit: { config: { debug: false }, queue: bootstrapQueue },
    };

    const result = installDevKitRuntime({
      version: "0.1.0",
      window: host,
      config: { debug: true },
    });

    expect(result.status).toBe("installed");
    expect(host.slicemediaDevKit).toBe(result.runtime);
    await result.runtime.ready;
    expect(result.runtime.config).toEqual({ debug: true, locale: "en" });
    expect(calls).toEqual(["en"]);
  });

  it("reuses the same version and preserves a different active version", () => {
    const host: DevKitHost = {};
    const first = installDevKitRuntime({ version: "0.1.0", window: host });
    const reused = installDevKitRuntime({
      version: "0.1.0",
      window: host,
      config: { debug: true },
    });
    const conflict = installDevKitRuntime({ version: "0.2.0", window: host });

    expect(reused.status).toBe("reused");
    expect(reused.runtime).toBe(first.runtime);
    expect(reused.runtime.config.debug).toBe(true);
    expect(conflict.status).toBe("conflict");
    expect(conflict.runtime).toBe(first.runtime);
    expect(first.runtime.conflicts).toHaveLength(1);
    expect(host.slicemediaDevKit).toBe(first.runtime);
  });

  it("continues draining after a failed task and exposes the failure through ready", async () => {
    const host: DevKitHost = {};
    const { runtime } = installDevKitRuntime({ version: "0.1.0", window: host });
    const afterFailure = vi.fn();
    const errors = vi.fn();
    runtime.on("error", errors);

    runtime.queue.push(() => {
      throw new Error("queue failure");
    }, afterFailure);
    const ready = runtime.ready;

    await expect(ready).rejects.toThrow("queue failure");
    expect(afterFailure).toHaveBeenCalledOnce();
    expect(errors).toHaveBeenCalledOnce();
    expect(runtime.queue.length).toBe(0);
  });

  it("registers an addon once and rejects incompatible duplicates", async () => {
    const host: DevKitHost = {};
    const { runtime } = installDevKitRuntime({ version: "0.1.0", window: host });
    const value = { init: vi.fn() };

    expect(runtime.registerAddon({ name: "counter", version: "0.1.0", value })).toBe("registered");
    expect(runtime.registerAddon({ name: "counter", version: "0.1.0", value: {} })).toBe("reused");
    expect(() => runtime.registerAddon({ name: "counter", version: "0.2.0", value: {} })).toThrow(
      "already registered",
    );
    expect(runtime.getAddon("counter")?.value).toBe(value);
    expect(runtime.counter).toBe(value);
    expect(Object.getOwnPropertyDescriptor(runtime, "counter")?.writable).toBe(false);
  });

  it("does not allow an addon to replace runtime or prototype properties", () => {
    const { runtime } = installDevKitRuntime({ version: "0.1.0", window: {} });
    for (const name of [
      "ready",
      "queue",
      "configure",
      "getAddon",
      "constructor",
      "__proto__",
      "then",
    ]) {
      expect(() => runtime.registerAddon({ name, version: "0.1.0", value: {} })).toThrow(
        "reserved",
      );
      expect(runtime.getAddon(name)).toBeUndefined();
    }
    expect(runtime.addons).toHaveLength(0);
  });

  it("delivers ready callbacks before and after registration, including a pre-load window queue", async () => {
    const early = vi.fn();
    window.slicemediaDevKit = {
      queue: [
        (runtime) => {
          runtime.whenReady("counter", early);
        },
      ],
    };
    const { runtime } = installDevKitRuntime({ version: "0.1.0" });
    await runtime.ready;
    expect(early).not.toHaveBeenCalled();
    const api = { refresh: vi.fn() };
    runtime.registerAddon({ name: "counter", version: "0.1.0", value: api });
    const late = vi.fn();
    runtime.whenReady("counter", late);
    await runtime.ready;
    expect(early).toHaveBeenCalledExactlyOnceWith(api, runtime);
    expect(late).toHaveBeenCalledExactlyOnceWith(api, runtime);
    runtime.registerAddon({ name: "counter", version: "0.1.0", value: api });
    await runtime.ready;
    expect(early).toHaveBeenCalledOnce();
  });

  it("cancels pending ready callbacks and isolates callback failures", async () => {
    const { runtime } = installDevKitRuntime({ version: "0.1.0", window: {} });
    const cancelled = vi.fn();
    const cancel = runtime.whenReady("counter", cancelled);
    cancel();
    runtime.registerAddon({ name: "counter", version: "0.1.0", value: {} });
    const cancelQueued = runtime.whenReady("counter", cancelled);
    cancelQueued();
    runtime.whenReady("counter", async () => {
      throw new Error("consumer failed");
    });
    const healthy = vi.fn();
    runtime.whenReady("counter", healthy);
    await expect(runtime.ready).rejects.toThrow("consumer failed");
    expect(cancelled).not.toHaveBeenCalled();
    expect(healthy).toHaveBeenCalledOnce();
  });
});
