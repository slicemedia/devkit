// @vitest-environment-options {"url":"https://structure.webflow.io/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAddon,
  defineAddon,
  getAddonMetadata,
  type AddonStructureNode,
} from "@slicemedia/devkit-core";
import { createDevTools, inspectDevKit, type DevToolsController } from "../src/index.js";
import { installDevKitRuntime, type DevKitHost } from "@slicemedia/devkit-core";

const structure: AddonStructureNode<"selector"> = {
  id: "gallery",
  label: "Gallery",
  selector: "[data-wft-gallery]",
  selectorOption: "selector",
  attributes: [{ name: "data-wft-gallery" }],
  children: [
    {
      id: "list",
      label: "Item list",
      selector: "[data-wft-list]",
      relationship: "child",
      attributes: [{ name: "data-wft-list" }],
      children: [
        {
          id: "item",
          label: "Gallery item",
          selector: "[data-wft-item]",
          attributes: [{ name: "data-wft-item" }, { name: "data-wft-count" }],
        },
      ],
    },
    {
      id: "controls",
      label: "Controls",
      selector: "[data-wft-controls]",
      required: false,
      attributes: [{ name: "data-wft-controls" }, { name: "data-wft-mode", required: true }],
    },
  ],
};
const input = {
  name: "gallery",
  version: "1.0.0",
  description: "Structured markup fixture.",
  entry: "gallery",
  defaultOptions: { selector: "[data-wft-gallery]" },
  attributes: [
    { name: "data-wft-gallery", description: "Container.", type: "boolean", required: true },
    { name: "data-wft-list", description: "Item wrapper.", type: "boolean", required: true },
    { name: "data-wft-item", description: "Item.", type: "boolean", required: true },
    { name: "data-wft-count", description: "Count.", type: "number", required: true },
    { name: "data-wft-controls", description: "Controls.", type: "boolean" },
    { name: "data-wft-mode", description: "Mode.", type: "enum", values: ["auto", "manual"] },
  ] as const,
  structure,
  usage: {
    setup: ["Create the gallery container.", "Nest the list and items."],
    markup:
      '<div data-wft-gallery><div data-wft-list><div data-wft-item data-wft-count="2"></div></div></div>',
    notes: ["Controls are optional."],
  },
  setup: vi.fn(() => ({})),
};
const valid =
  '<section data-wft-gallery><div data-wft-list><span data-wft-item data-wft-count="2"></span></div></section>';
let tools: DevToolsController | undefined;
beforeEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  input.setup.mockClear();
});
afterEach(() => {
  tools?.destroy();
  tools = undefined;
  Reflect.deleteProperty(window, "slicemediaDevKit");
});

function scan(html: string) {
  document.body.innerHTML = html;
  const addon = createAddon(defineAddon(input));
  return inspectDevKit({ document, addons: [{ addon }] }).addons[0]!;
}

describe("shared structure metadata", () => {
  it("retains immutable, serializable structure in inert metadata without running setup", () => {
    const definition = defineAddon(input);
    const metadata = getAddonMetadata(definition);
    expect(metadata.structure).toEqual(structure);
    expect(metadata.structure).not.toBe(structure);
    expect(Object.isFrozen(metadata.structure!.children![0]!.attributes[0])).toBe(true);
    expect(JSON.parse(JSON.stringify(metadata)).structure.children[0].children[0].id).toBe("item");
    expect(input.setup).not.toHaveBeenCalled();
  });
  it("rejects duplicate roles, unknown attributes, invalid option references, and cycles", () => {
    expect(() =>
      defineAddon({ ...input, structure: { ...structure, children: [structure] } }),
    ).toThrow("unique");
    expect(() =>
      defineAddon({
        ...input,
        structure: { ...structure, attributes: [{ name: "data-wft-unknown" }] },
      }),
    ).toThrow("declared attributes");
    expect(() => defineAddon({ ...input, defaultOptions: { selector: 1 } })).toThrow(
      "string selector option",
    );
    const cyclic = { ...structure, children: [] as AddonStructureNode<"selector">[] };
    cyclic.children.push(cyclic);
    expect(() => defineAddon({ ...input, structure: cyclic })).toThrow("acyclic");
  });
});

describe("per-parent structure inspection", () => {
  it("inspects arbitrary depth and optional branches without mutating DOM or invoking the addon", () => {
    document.body.innerHTML = valid;
    const baseline = document.body.innerHTML;
    const result = scan(valid);
    expect(result.issues).toEqual([]);
    expect(result.structure?.children[0]?.children[0]?.attributes[1]?.elements).toHaveLength(1);
    expect(result.structure?.children[1]?.elements).toHaveLength(0);
    expect(document.body.innerHTML).toBe(baseline);
    expect(input.setup).not.toHaveBeenCalled();
  });
  it("checks every parent separately rather than letting one valid list cover another", () => {
    const result = scan(
      valid.replace("</section>", '<div data-wft-list id="empty"></div></section>'),
    );
    expect(result.issues).toMatchObject([
      { code: "missing-element", structureNode: "item", element: document.querySelector("#empty") },
    ]);
    expect(result.structure?.children[0]?.elements).toHaveLength(2);
    expect(result.structure?.children[0]?.children[0]?.missingParents).toEqual([
      document.querySelector("#empty"),
    ]);
  });
  it("does not let nested component roots satisfy an outer component's requirements", () => {
    const result = scan(
      `<section data-wft-gallery id="outer"><div data-wft-list>${valid}</div></section>`,
    );
    expect(result.roots).toHaveLength(2);
    expect(result.issues).toMatchObject([
      {
        code: "missing-element",
        structureNode: "item",
        element: document.querySelector("#outer > div"),
      },
    ]);
    expect(
      result.attributes.find((attribute) => attribute.name === "data-wft-item")?.elements,
    ).toHaveLength(1);
  });
  it("enforces direct-child relationships and avoids cascading errors under a missing role", () => {
    const result = scan(
      '<section data-wft-gallery><aside><div data-wft-list><span data-wft-item data-wft-count="2"></span></div></aside></section>',
    );
    expect(result.issues).toMatchObject([{ code: "missing-element", structureNode: "list" }]);
    expect(result.structure?.children[0]?.children[0]?.issues).toEqual([]);
  });
  it("checks required attributes on every matched element and validates allowed values", () => {
    const result = scan(
      valid
        .replace('data-wft-count="2"', "")
        .replace("</section>", '<div data-wft-controls data-wft-mode="invalid"></div></section>'),
    );
    expect(
      result.issues.map((issue) => [issue.code, issue.attribute, issue.structureNode]),
    ).toEqual([
      ["missing-attribute", "data-wft-count", "item"],
      ["invalid-value", "data-wft-mode", "controls"],
    ]);
    expect(result.structure?.children[1]?.attributes[1]?.required).toBe(true);
  });
  it("requires attributes in optional roles only when those roles are present", () => {
    expect(scan(valid).issues).toEqual([]);
    const result = scan(valid.replace("</section>", "<div data-wft-controls></div></section>"));
    expect(result.issues).toMatchObject([
      { code: "missing-attribute", attribute: "data-wft-mode" },
    ]);
  });
  it("uses current instance selectors and permits project contract root overrides", async () => {
    document.body.innerHTML =
      '<section class="custom" data-wft-gallery><div data-wft-list><span data-wft-item data-wft-count="2"></span></div></section>';
    const addon = createAddon(defineAddon(input), { selector: ".custom" });
    const first = inspectDevKit({ document, addons: [{ addon }] }).addons[0]!;
    expect(first.rootSelector).toBe(".custom");
    expect(first.issues).toEqual([]);
    await addon.setOptions({ selector: ".elsewhere" });
    expect(inspectDevKit({ document, addons: [{ addon }] }).addons[0]?.roots).toEqual([]);
    expect(
      inspectDevKit({ document, addons: [{ addon, contract: { root: ".custom" } }] }).addons[0]
        ?.issues,
    ).toEqual([]);
  });
  it("retains legacy flat contract overrides and flags unplaced required metadata", () => {
    document.body.innerHTML = valid;
    const addon = createAddon(defineAddon(input));
    const result = inspectDevKit({
      document,
      addons: [
        {
          addon,
          contract: {
            root: "[data-wft-gallery]",
            attributes: [{ name: "data-wft-count", on: "root" }],
          },
        },
      ],
    }).addons[0]!;
    expect(result.structure).toBeUndefined();
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "missing-attribute", attribute: "data-wft-count" }),
    );
    const partial = createAddon(
      defineAddon({ ...input, structure: { ...structure, children: [] } }),
    );
    expect(
      inspectDevKit({ document, addons: [{ addon: partial }] }).addons[0]?.issues,
    ).toContainEqual(
      expect.objectContaining({ code: "unscoped-requirement", attribute: "data-wft-item" }),
    );
  });
  it("reports invalid selectors and missing required roots without throwing", () => {
    const addon = createAddon(
      defineAddon({
        ...input,
        structure: {
          ...structure,
          selector: "[",
          selectorOption: undefined,
        } as unknown as AddonStructureNode<"selector">,
      }),
    );
    expect(inspectDevKit({ document, addons: [{ addon }] }).addons[0]?.issues).toMatchObject([
      { code: "invalid-contract" },
    ]);
    expect(scan("").issues).toEqual([]);
    const required = createAddon(
      defineAddon({ ...input, structure: { ...structure, required: true } }),
    );
    expect(
      inspectDevKit({ document, addons: [{ addon: required }] }).addons[0]?.issues,
    ).toMatchObject([{ code: "missing-root" }]);
  });
  it("uses resolved scopes for duplicate warnings", () => {
    document.body.innerHTML =
      valid.replace("<section", '<section id="one"') +
      valid.replace("<section", '<section id="two"');
    const definition = defineAddon(input);
    const one = createAddon(definition, { selector: "#one" });
    const two = createAddon(definition, { selector: "#two" });
    expect(
      inspectDevKit({ document, addons: [{ addon: one }, { addon: two }] }).addons.every(
        (addon) => addon.issues.length === 0,
      ),
    ).toBe(true);
  });
});

describe("structure and setup UI", () => {
  it("discovers structure from runtime metadata and preserves branch expansion across rescans and selection", () => {
    document.body.innerHTML = valid;
    const addon = createAddon(defineAddon(input));
    const { runtime } = installDevKitRuntime({ version: "1.0.0", window: window as DevKitHost });
    runtime.registerAddon({ name: "gallery", version: "1.0.0", value: addon });
    runtime.registerAddon({
      name: "second",
      version: "1.0.0",
      value: createAddon(defineAddon({ ...input, name: "second" })),
    });
    tools = createDevTools();
    tools.open();
    const shadow = document.querySelector("[data-wft-devtools]")!.shadowRoot!;
    expect(shadow.querySelectorAll(".markup-children .markup-branch")).toHaveLength(3);
    expect(shadow.querySelector(".setup-markup")?.textContent).toBe(input.usage.markup);
    expect(shadow.querySelector(".setup-markup div")).toBeNull();
    const branch = shadow.querySelector<HTMLDetailsElement>('[data-role="list"]')!;
    branch.open = false;
    tools.refresh();
    expect(shadow.querySelector<HTMLDetailsElement>('[data-role="list"]')!.open).toBe(false);
    const links = shadow.querySelectorAll<HTMLButtonElement>(".addon-link");
    links[1]!.click();
    links[0]!.click();
    expect(shadow.querySelector<HTMLDetailsElement>('[data-role="list"]')!.open).toBe(false);
    expect(shadow.querySelector(".markup-attribute-name")?.textContent).toBe("data-wft-gallery");
  });
  it("never interprets setup markup or labels as executable HTML", () => {
    const label = '<img src=x onerror="alert(1)">';
    const addon = createAddon(
      defineAddon({
        ...input,
        structure: { ...structure, label },
        usage: { setup: [label], markup: "<script>alert(1)</script>" },
      }),
    );
    tools = createDevTools({ addons: [{ addon }] });
    tools.open();
    const shadow = document.querySelector("[data-wft-devtools]")!.shadowRoot!;
    expect(shadow.querySelector("img, script")).toBeNull();
    expect(shadow.querySelector(".markup-title")?.textContent).toContain(label);
    expect(shadow.querySelector(".setup-markup")?.textContent).toBe("<script>alert(1)</script>");
  });
});
