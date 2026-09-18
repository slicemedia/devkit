import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAddon,
  defineAddon,
  getAddonMetadata,
  initializeAddon,
  installDevKitRuntime,
} from "@slicemedia/devkit-core";
import { inspectDevKit, type InspectableAddon } from "../src/index.js";
import { runtimeAddons } from "../src/runtime-addons.js";

interface Options {
  selector: string;
  enabled: boolean;
  itemSelector: string;
  count: number;
}
const definition = () =>
  defineAddon<Options>({
    name: "inspection-fixture",
    version: "1.0.0",
    description: "Contract fixture",
    entry: "fixture",
    defaultOptions: {
      selector: "[data-wft-root]",
      enabled: true,
      itemSelector: "[data-wft-item]",
      count: 2,
    },
    attributes: [
      { name: "data-wft-root", type: "boolean", description: "Root" },
      { name: "data-wft-enabled", type: "boolean", option: "enabled", description: "Enabled" },
      {
        name: "data-wft-selector",
        type: "selector",
        option: "itemSelector",
        description: "Items",
        target: "root",
      },
      {
        name: "data-wft-count",
        type: "number",
        option: "count",
        min: 1,
        max: 5,
        integer: true,
        description: "Count",
      },
      { name: "data-wft-item", type: "string", required: true, description: "Item key" },
      { name: "data-wft-control", type: "string", required: true, description: "Target key" },
    ],
    options: [
      { name: "count", type: "number", min: 1, max: 5, integer: true, description: "Count" },
    ],
    structure: {
      id: "root",
      label: "Root",
      selector: "[data-wft-root]",
      selectorOption: "selector",
      attributes: [
        { name: "data-wft-root" },
        { name: "data-wft-enabled" },
        { name: "data-wft-count" },
        { name: "data-wft-selector" },
      ],
      children: [
        {
          id: "item",
          label: "Items",
          selector: "[data-wft-item]",
          selectorOption: "itemSelector",
          min: 2,
          max: 3,
          when: { option: "enabled", equals: true },
          uniqueBy: "data-wft-item",
          attributes: [{ name: "data-wft-item" }],
        },
        {
          id: "control",
          label: "Controls",
          selector: "[data-wft-control]",
          scopeSelector: ".component",
          required: false,
          when: { option: "enabled", equals: true },
          attributes: [{ name: "data-wft-control" }],
          references: {
            attribute: "data-wft-control",
            target: "item",
            targetAttribute: "data-wft-item",
          },
        },
      ],
    },
    setup: () => ({}),
  });
const scan = (addon: InspectableAddon = createAddon(definition())) =>
  inspectDevKit({ document, addons: [{ addon }] }).addons[0]!;

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "slicemediaDevKit");
});

describe("conditional inspection contracts", () => {
  it("resolves each root's overrides, ignores inactive roles and validates active counts", () => {
    document.body.innerHTML =
      '<div data-wft-root data-wft-enabled="false"></div><div data-wft-root data-wft-selector=".card"><i class="card" data-wft-item="a"></i><i class="card" data-wft-item="b"></i></div>';
    const result = scan();
    expect(result.issues).toEqual([]);
    expect(result.structure?.children[0]?.inactiveCount).toBe(1);
    expect(result.instances?.map((instance) => instance.options.enabled)).toEqual([false, true]);
    document.querySelector(".card")!.remove();
    expect(scan().issues).toContainEqual(
      expect.objectContaining({
        code: "invalid-count",
        element: document.querySelectorAll("[data-wft-root]")[1],
      }),
    );
  });
  it("checks matching keys in shared scopes without borrowing from another component", () => {
    document.body.innerHTML =
      '<div class="component"><section data-wft-root><i data-wft-item="a"></i><i data-wft-item="a"></i></section><button data-wft-control="b"></button></div><div class="component"><section data-wft-root><i data-wft-item="b"></i><i data-wft-item="c"></i></section><button data-wft-control="b"></button></div>';
    const result = scan();
    expect(result.issues.map(({ code }) => code)).toEqual(["duplicate-key", "missing-reference"]);
    expect(result.issues[1]?.element).toBe(document.querySelector("button"));
  });
  it("reports orphan hooks, actual selector targets, invalid values and effective options", () => {
    document.body.innerHTML =
      '<div data-wft-item="orphan"></div><section data-wft-root data-wft-enabled="false" data-wft-count="-1" data-wft-selector=".absent"></section>';
    const result = scan();
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["orphan-attribute", "invalid-value", "invalid-option"]),
    );
    expect(result.issues.some((issue) => issue.message.includes("no target"))).toBe(true);
    expect(result.instances?.[0]?.options.count).toBe(-1);
  });
  it("supports media, composed conditions, self roles and conditional required attributes", () => {
    const matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList);
    vi.stubGlobal("matchMedia", matchMedia);
    document.body.innerHTML = '<div data-wft-root class="self"></div>';
    const base = definition();
    const addon = createAddon(
      defineAddon({
        ...base,
        structure: {
          id: "root",
          label: "Root",
          selector: "[data-wft-root]",
          attributes: [],
          children: [
            {
              id: "same",
              label: "Same",
              selector: ".self",
              relationship: "self-or-descendant",
              attributes: [
                {
                  name: "data-wft-count",
                  required: true,
                  when: {
                    all: [
                      { media: "(min-width: 900px)" },
                      { not: { attribute: "data-wft-enabled", equals: "false" } },
                    ],
                  },
                },
              ],
            },
          ],
        },
      }),
    );
    expect(scan(addon).issues.filter((issue) => issue.severity === "error")).toEqual([]);
    matchMedia.mockReturnValue({ matches: true } as MediaQueryList);
    expect(scan(addon).issues[0]?.code).toBe("missing-attribute");
    vi.unstubAllGlobals();
  });
  it("rejects invalid constraints, cyclic conditions and undeclared reference targets", () => {
    const base = definition();
    expect(() =>
      defineAddon({ ...base, structure: { ...base.structure!, min: 3, max: 1 } }),
    ).toThrow("min");
    expect(() =>
      defineAddon({
        ...base,
        structure: {
          ...base.structure!,
          references: {
            attribute: "data-wft-item",
            target: "unknown",
            targetAttribute: "data-wft-item",
          },
        },
      }),
    ).toThrow("referenced role");
    const recursive: { not?: unknown } = {};
    recursive.not = recursive;
    expect(() =>
      defineAddon({ ...base, structure: { ...base.structure!, when: recursive as never } }),
    ).toThrow("finite tree");
  });
});

describe("read-only runtime reports", () => {
  it("isolates accidental async providers and consumes their rejected promises", async () => {
    document.body.innerHTML = "<section data-wft-root></section>";
    const badReport = {
      definition: definition(),
      inspect: () => Promise.reject(new Error("async report failed")),
    } as unknown as InspectableAddon;
    const badOptions = {
      definition: definition(),
      resolveOptions: () => Promise.reject(new Error("async options failed")),
    } as unknown as InspectableAddon;
    const result = inspectDevKit({
      document,
      addons: [{ addon: badReport }, { addon: badOptions }],
    });
    expect(
      result.addons.every((addon) =>
        addon.issues.some((issue) => issue.code === "inspection-failed"),
      ),
    ).toBe(true);
    await Promise.resolve(); // Vitest also fails this test run on an unhandled rejection.
  });
  it("shares a custom resolver with runtime setup and excludes functions from metadata", async () => {
    document.body.innerHTML = '<div data-wft-root data-wft-enabled="false"></div>';
    let fromSetup: object | undefined;
    const inspect = vi.fn(() => ({ state: "inactive" as const, message: "Opted out" }));
    const base = definition();
    const custom = defineAddon({
      ...base,
      resolveOptions: ({ options, root }) => ({
        ...options,
        enabled: root?.getAttribute("data-wft-enabled") !== "false",
      }),
      inspect,
      setup(context) {
        fromSetup = context.resolveOptions(document.querySelector("div")!);
        return {};
      },
    });
    expect(getAddonMetadata(custom)).not.toHaveProperty("resolveOptions");
    expect(getAddonMetadata(custom)).not.toHaveProperty("inspect");
    const addon = createAddon(custom);
    await addon.init();
    expect(scan(addon).instances?.[0]?.options).toEqual(fromSetup);
    expect(scan(addon).instances?.[0]?.diagnostics.state).toBe("inactive");
    await addon.destroy();
  });
  it("never calls lifecycle or getState, and isolates malformed metadata and failing providers", () => {
    const initialize = vi.fn();
    const getState = vi.fn();
    const good = createAddon(
      defineAddon({
        name: "service",
        version: "1",
        description: "Service",
        entry: "service",
        defaultOptions: {},
        scope: "global",
        inspect: () => ({ state: "active" }),
        setup: initialize,
      }),
    );
    const throwing = {
      ...good,
      definition: good.definition,
      init: initialize,
      getState,
      inspect: () => {
        throw new Error("report unavailable");
      },
    };
    const malformed = {
      definition: { ...good.definition, name: "bad", attributes: [null] },
    } as unknown as InspectableAddon;
    const results = inspectDevKit({
      document,
      addons: [{ addon: malformed }, { addon: throwing }, { addon: good }],
    }).addons;
    expect(results[0]?.issues[0]?.code).toBe("inspection-failed");
    expect(results[1]?.instances?.[0]?.diagnostics.state).toBe("unverified");
    expect(results[2]?.coverage).toBe("global");
    expect(results[2]?.instances?.[0]?.diagnostics.state).toBe("active");
    expect(initialize).not.toHaveBeenCalled();
    expect(getState).not.toHaveBeenCalled();
  });
  it("reports explicit dependency presence, conditional inactivity, and runtime loading without guessing", () => {
    const addon = createAddon(
      defineAddon({
        name: "service",
        version: "1",
        description: "Service",
        entry: "service",
        defaultOptions: { enabled: false },
        scope: "global",
        dependencies: [
          { name: "native", global: "document" },
          { name: "bundled" },
          { name: "missing", global: "absentLibrary" },
          { name: "optional", global: "absentLibrary", when: { option: "enabled", equals: true } },
          { name: "lazy" },
        ],
        inspect: () => ({
          state: "waiting",
          dependencies: [
            { name: "lazy", state: "loading" },
            { name: "optional", state: "available" },
          ],
        }),
        setup: () => ({}),
      }),
    );
    const result = scan(addon);
    expect(result.instances?.[0]?.dependencies.map(({ state }) => state)).toEqual([
      "available",
      "unverified",
      "missing",
      "inactive",
      "loading",
    ]);
    expect(result.issues.map(({ code }) => code)).toEqual(["dependency-missing"]);
  });
  it("tracks failed startup before readiness, supports retry and rejects reserved names before setup", async () => {
    const { runtime } = installDevKitRuntime({ version: "1.0.0", window });
    const setup = vi.fn().mockRejectedValueOnce(new Error("startup failed")).mockResolvedValue({});
    const addon = createAddon(
      defineAddon({
        name: "service",
        version: "1",
        description: "Service",
        entry: "service",
        defaultOptions: {},
        scope: "global",
        setup,
      }),
    );
    const ready = vi.fn();
    runtime.whenReady("service", ready);
    await expect(initializeAddon(runtime, addon)).rejects.toThrow();
    expect(runtime.getAddon("service")).toBeUndefined();
    expect(ready).not.toHaveBeenCalled();
    const result = inspectDevKit({ document, addons: runtimeAddons(window) }).addons[0]!;
    expect(result.instances?.[0]?.diagnostics).toEqual({
      state: "error",
      message: "startup failed",
    });
    await initializeAddon(runtime, addon);
    await runtime.ready;
    expect(ready).toHaveBeenCalledOnce();
    expect(runtime.getAddon("service")?.value).toBe(addon);
    const reserved = { definition: { name: "trackAddon", version: "1" }, init: vi.fn() };
    await expect(initializeAddon(runtime, reserved)).rejects.toThrow("reserved");
    expect(reserved.init).not.toHaveBeenCalled();
    await addon.destroy();
  });
});
