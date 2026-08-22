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
  });
});
