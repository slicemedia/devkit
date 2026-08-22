import { describe, expect, it, vi } from "vitest";

import {
  AddonDefinitionError,
  AddonLifecycleError,
  createAddon,
  defineAddon,
  getAddonMetadata,
} from "../src/index.js";
import type { AddonSetupContext } from "../src/index.js";

interface Options {
  amount: number;
  enabled: boolean;
}

interface State {
  refreshes: number;
}

interface Events {
  tick: number;
}

describe("addon definitions", () => {
  it("normalizes neutral metadata without running setup", () => {
    const setup = vi.fn(() => ({}));
    const definition = defineAddon<Options, State, Events>({
      name: "number-counter",
      version: "0.1.0",
      description: "Counts a neutral numeric value.",
      attributes: [
        {
          name: "data-wft-count",
          description: "Marks a count target.",
          type: "number",
          option: "amount",
        },
      ],
      options: [{ name: "amount", description: "Target amount.", type: "number" }],
      defaultOptions: { amount: 0, enabled: true },
      entry: "number-counter",
      setup,
    });

    expect(setup).not.toHaveBeenCalled();
    expect(definition.placement).toBe("body-end");
    expect(definition.lifecycle).toEqual([
      "init",
      "refresh",
      "destroy",
      "setOptions",
      "getState",
      "on",
    ]);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(getAddonMetadata(definition)).not.toHaveProperty("setup");
  });

  it("rejects non-neutral and duplicate attribute contracts", () => {
    expect(() =>
      defineAddon({
        name: "invalid-addon",
        version: "0.1.0",
        description: "Invalid metadata.",
        attributes: [
          {
            name: "data-brand-count" as `data-wft-${string}`,
            description: "Invalid attribute.",
            type: "number",
          },
        ],
        defaultOptions: {},
        entry: "invalid-addon",
        setup: () => ({}),
      }),
    ).toThrow(AddonDefinitionError);
  });
});

describe("addon lifecycle", () => {
  it("serializes idempotent lifecycle work, cleans up, and can reinitialize", async () => {
    const init = vi.fn();
    const refresh = vi.fn();
    const destroy = vi.fn();
    const cleanup = vi.fn();
    const setOptions = vi.fn();
    let context: AddonSetupContext<Options, Events> | undefined;
    let refreshes = 0;

    const definition = defineAddon<Options, State, Events>({
      name: "lifecycle-probe",
      version: "0.1.0",
      description: "Exercises the lifecycle contract.",
      defaultOptions: { amount: 1, enabled: true },
      entry: "lifecycle-probe",
      setup(setupContext) {
        context = setupContext;
        setupContext.onCleanup(cleanup);
        return {
          init,
          refresh() {
            refreshes += 1;
            refresh();
            setupContext.emit("tick", refreshes);
          },
          destroy,
          setOptions,
          getState: () => ({ refreshes }),
        };
      },
    });

    const instance = createAddon(definition, { amount: 2 }, { window, document });
    const ticks: number[] = [];
    instance.on("tick", (value) => ticks.push(value));

    await Promise.all([instance.init(), instance.init()]);
    expect(init).toHaveBeenCalledOnce();
    expect(instance.status).toBe("ready");
    expect(instance.options.amount).toBe(2);

    await instance.refresh();
    await instance.setOptions({ amount: 3 });
    expect(ticks).toEqual([1]);
    expect(instance.getState()).toEqual({ refreshes: 1 });
    expect(setOptions).toHaveBeenCalledWith(
      { amount: 3, enabled: true },
      { amount: 2, enabled: true },
    );
    expect(context?.options.amount).toBe(3);

    const firstSignal = context?.signal;
    await Promise.all([instance.destroy(), instance.destroy()]);
    expect(destroy).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(firstSignal?.aborted).toBe(true);
    expect(instance.status).toBe("destroyed");

    await instance.init();
    expect(init).toHaveBeenCalledTimes(2);
    expect(context?.signal).not.toBe(firstSignal);
    expect(context?.signal.aborted).toBe(false);
  });

  it("rolls back partial initialization and reports refresh-before-init", async () => {
    const cleanup = vi.fn();
    const destroy = vi.fn();
    const definition = defineAddon({
      name: "failing-probe",
      version: "0.1.0",
      description: "Fails after allocating a resource.",
      defaultOptions: {},
      entry: "failing-probe",
      setup(context) {
        context.onCleanup(cleanup);
        return {
          init() {
            throw new Error("expected init failure");
          },
          destroy,
        };
      },
    });
    const instance = createAddon(definition, {}, { window, document });

    await expect(instance.refresh()).rejects.toBeInstanceOf(AddonLifecycleError);
    await expect(instance.init()).rejects.toThrow("expected init failure");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    expect(instance.status).toBe("error");
    await instance.destroy();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
