// @vitest-environment node
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { build } from "vite";
import { beforeAll, describe, expect, it, vi } from "vitest";

let code;
beforeAll(async () => {
  const output = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      target: "es2018",
      lib: {
        entry: fileURLToPath(new URL("../packages/devtools/browser/devtools.ts", import.meta.url)),
        name: "DevKitInspectorBundle",
        formats: ["iife"],
      },
    },
  });
  code = output[0].output.find((entry) => entry.type === "chunk").code;
});

describe("standalone production DevTools", () => {
  it("boots without a bundler, stays dormant on production, and reads late registrations on demand", () => {
    const dom = new JSDOM(
      "<!doctype html><html><body><section data-wft-root></section></body></html>",
      { url: "https://production.example.test/", runScripts: "outside-only" },
    );
    const { window } = dom;
    const storage = vi.spyOn(window.Storage.prototype, "setItem");
    const query = vi.spyOn(window.document, "querySelectorAll");
    window.eval(code);
    const controller = window.DevKitDevTools;
    expect(controller.enabled).toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    expect(window.document.querySelector("[data-wft-devtools]")).toBeNull();
    window.eval(code);
    expect(window.DevKitDevTools).toBe(controller);
    const inspect = vi.fn(() => ({ state: "active" }));
    window.slicemediaDevKit = {
      kind: "slicemedia-devkit-runtime",
      addons: [
        {
          name: "fixture",
          version: "1",
          value: {
            definition: {
              name: "fixture",
              version: "1",
              description: "Fixture",
              attributes: [],
              scope: "global",
            },
            inspect,
          },
        },
      ],
    };
    expect(inspect).not.toHaveBeenCalled();
    controller.enabled = true;
    controller.open();
    expect(controller.getSnapshot().addons[0].instances[0].diagnostics.state).toBe("active");
    const calls = inspect.mock.calls.length;
    controller.enabled = false;
    controller.refresh();
    expect(inspect).toHaveBeenCalledTimes(calls);
    controller.destroy();
    window.eval(code);
    expect(window.DevKitDevTools.enabled).toBe(false);
    window.DevKitDevTools.destroy();
    dom.window.close();
  });
  it("auto-activates on staging and carries the script nonce without writing preferences", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://fixture.webflow.io/",
      runScripts: "outside-only",
    });
    const { window } = dom;
    const script = window.document.createElement("script");
    script.nonce = "test-nonce";
    Object.defineProperty(window.document, "currentScript", { value: script });
    const storage = vi.spyOn(window.Storage.prototype, "setItem");
    window.eval(code);
    expect(window.DevKitDevTools.enabled).toBe(true);
    const host = [...window.document.body.children].find((element) => element.shadowRoot);
    expect(host.shadowRoot.querySelector("style").nonce).toBe("test-nonce");
    expect(storage).not.toHaveBeenCalled();
    window.DevKitDevTools.destroy();
    dom.window.close();
  });
});
