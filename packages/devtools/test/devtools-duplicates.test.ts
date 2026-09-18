import { describe, expect, it } from "vitest";

import { inspectDevKit, type InspectableAddon } from "../src/index.js";

function fixture(): Document {
  const result = document.implementation.createHTMLDocument("Duplicate inspection");
  result.head.innerHTML = '<base href="https://preview.example.test/components/">';
  result.body.innerHTML =
    '<section id="first" data-wft-probe></section><section id="second" data-wft-probe></section>';
  return result;
}

function addon(version = "1.0.0"): InspectableAddon {
  return {
    definition: {
      name: "probe",
      version,
      description: "Neutral duplicate fixture.",
      attributes: [{ name: "data-wft-probe", description: "Component root.", type: "boolean" }],
    },
    status: "ready",
  };
}

const contract = { root: "[data-wft-probe]" };

describe("duplicate addon registrations", () => {
  it("does not treat several roots in one registration as a duplicate addon", () => {
    const result = inspectDevKit({ document: fixture(), addons: [{ addon: addon(), contract }] });
    expect(result.addons[0]!.roots).toHaveLength(2);
    expect(result.addons[0]!.issues).toEqual([]);
  });

  it("warns on repeated registration of the same object without merging the entries", () => {
    const instance = addon();
    const document = fixture();
    const before = document.documentElement.outerHTML;
    const result = inspectDevKit({
      document,
      addons: [
        { addon: instance, label: "Primary", contract },
        { addon: instance, label: "Repeated", contract },
      ],
    });
    expect(result.addons).toHaveLength(2);
    for (const entry of result.addons) {
      expect(entry.issues).toMatchObject([{ code: "duplicate-registration", severity: "warning" }]);
      expect(entry.issues[0]!.message).toContain("same addon instance");
    }
    expect(result.addons[0]!.issues[0]!.message).toContain("#2 Repeated v1.0.0");
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it("recognizes overlapping roots selected differently and includes version evidence", () => {
    const result = inspectDevKit({
      document: fixture(),
      addons: [
        { addon: addon(), contract },
        { addon: addon("2.0.0"), contract: { root: "#first" } },
      ],
    });
    expect(result.addons[0]!.issues[0]!.message).toContain("overlapping roots");
    expect(result.addons[0]!.issues[0]!.message).toContain("v2.0.0");
    expect(result.addons[1]!.issues[0]!.code).toBe("duplicate-registration");
  });

  it("warns about repeated root selectors even when no component is present yet", () => {
    const document = fixture();
    document.body.innerHTML = "";
    const result = inspectDevKit({
      document,
      addons: [
        { addon: addon(), contract },
        { addon: addon(), contract },
      ],
    });
    expect(result.addons[0]!.roots).toEqual([]);
    expect(result.addons[0]!.issues[0]!.code).toBe("duplicate-registration");
  });

  it("makes uncertainty explicit when scopes are not declared", () => {
    const result = inspectDevKit({
      document: fixture(),
      addons: [{ addon: addon() }, { addon: addon(), contract }],
    });
    expect(result.addons[0]!.issues[0]!.message).toContain("without fully declared root scopes");
    expect(result.addons[1]!.issues[0]!.severity).toBe("warning");
  });

  it.each([false, true])(
    "allows independent scopes, including reused inspection objects (%s)",
    (sameObject) => {
      const instance = addon();
      const result = inspectDevKit({
        document: fixture(),
        addons: [
          { addon: instance, contract: { root: "#first" } },
          { addon: sameObject ? instance : addon(), contract: { root: "#second" } },
        ],
      });
      expect(result.addons.map((entry) => entry.issues)).toEqual([[], []]);
    },
  );

  it("allows different addon types to enhance the same roots", () => {
    const other = addon();
    const result = inspectDevKit({
      document: fixture(),
      addons: [
        { addon: addon(), contract },
        {
          addon: { ...other, definition: { ...other.definition, name: "another-addon" } },
          contract,
        },
      ],
    });
    expect(result.addons.map((entry) => entry.issues)).toEqual([[], []]);
  });
});

describe("duplicate external script includes", () => {
  it("groups resolved URLs across the head and body without fetching or editing scripts", () => {
    const document = fixture();
    document.head.insertAdjacentHTML("beforeend", '<script src="./addon.js"></script>');
    document.body.insertAdjacentHTML(
      "beforeend",
      '<script src="https://preview.example.test/components/addon.js" async></script>',
    );
    const before = document.documentElement.outerHTML;
    const result = inspectDevKit({ document, addons: [] });
    expect(result.scriptWarnings).toHaveLength(1);
    expect(result.scriptWarnings[0]).toMatchObject({
      code: "duplicate-script",
      severity: "warning",
      src: "https://preview.example.test/components/addon.js",
    });
    expect(result.scriptWarnings[0]!.elements).toHaveLength(2);
    expect(result.scriptWarnings[0]!.message).toContain("does not prove repeated execution");
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it("keeps versions, hosts, protocols, queries, and fragments distinct", () => {
    const document = fixture();
    document.body.innerHTML = [
      "./addon.js?v=1",
      "./addon.js?v=2",
      "./addon.js#one",
      "./addon.js#two",
      "https://other.example.test/components/addon.js",
      "http://preview.example.test/components/addon.js",
    ]
      .map((src) => `<script src="${src}"></script>`)
      .join("");
    expect(inspectDevKit({ document, addons: [] }).scriptWarnings).toEqual([]);
  });

  it("ignores inert script types, nomodule fallbacks, templates, and invalid sources", () => {
    const document = fixture();
    document.body.innerHTML = `
      <script src="./addon.js"></script>
      <script type="application/json" src="./addon.js"></script>
      <script type="importmap" src="./addon.js"></script>
      <script type="speculationrules" src="./addon.js"></script>
      <script language="vbscript" src="./addon.js"></script>
      <script nomodule src="./addon.js"></script>
      <template><script src="./addon.js"></script></template>
      <script src="http://["></script><script src="http://["></script>
      <script src=""></script><script src=" "></script>
      <script>/* Same inline content. */</script><script>/* Same inline content. */</script>`;
    expect(inspectDevKit({ document, addons: [] }).scriptWarnings).toEqual([]);
  });

  it("reports duplicate module includes as markup warnings, without assuming two executions", () => {
    const document = fixture();
    document.body.innerHTML =
      '<script type="module" src="./addon.js"></script><script type="MODULE" src="./addon.js"></script>';
    expect(inspectDevKit({ document, addons: [] }).scriptWarnings[0]!.elements).toHaveLength(2);
  });

  it("recognizes classic JavaScript MIME types and honors exact element exclusions", () => {
    const document = fixture();
    document.body.innerHTML =
      '<script type="text/javascript" src="./addon.js"></script><script type="application/javascript" src="./addon.js"></script>';
    const scripts = [...document.querySelectorAll("script")];
    expect(inspectDevKit({ document, addons: [] }).scriptWarnings).toHaveLength(1);
    expect(inspectDevKit({ document, addons: [], exclude: [scripts[0]!] }).scriptWarnings).toEqual(
      [],
    );
  });

  it("removes a warning on rescan after the duplicate tag is removed", () => {
    const document = fixture();
    document.body.innerHTML =
      '<script src="./addon.js"></script><script src="./addon.js"></script>';
    expect(inspectDevKit({ document, addons: [] }).scriptWarnings).toHaveLength(1);
    document.querySelector("script")!.remove();
    expect(inspectDevKit({ document, addons: [] }).scriptWarnings).toEqual([]);
  });
});
