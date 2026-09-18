import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetLoadError, loadAssetOnce } from "../src/index.js";

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe("loadAssetOnce", () => {
  it("waits for an existing unmarked script instead of claiming it is ready", async () => {
    const script = document.createElement("script");
    script.src = "/assets/already-loading.js";
    document.head.append(script);
    let ready = false;
    const pending = loadAssetOnce({ type: "script", url: script.src, document });
    void pending.then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false);
    script.dispatchEvent(new Event("load"));
    await expect(pending).resolves.toBe(script);
  });

  it("can confirm an existing script whose load event already fired", async () => {
    const script = document.createElement("script");
    script.src = "/assets/ready.js";
    document.head.append(script);
    await expect(
      loadAssetOnce({ type: "script", url: script.src, document, isReady: () => true }),
    ).resolves.toBe(script);
  });

  it("shares pending loads and key conflicts across separately loaded module copies", async () => {
    vi.resetModules();
    const { loadAssetOnce: other } = await import("../src/assets.js");
    const options = {
      type: "script" as const,
      url: "/assets/shared.js",
      key: "shared-across-addons",
      document,
    };
    const first = loadAssetOnce(options);
    expect(other(options)).toBe(first);
    await expect(other({ ...options, url: "/assets/different.js" })).rejects.toThrow(
      "incompatible",
    );
    const script = document.querySelector("script")!;
    expect(document.querySelectorAll("script")).toHaveLength(1);
    script.dispatchEvent(new Event("load"));
    await first;
  });

  it("deduplicates concurrent script requests", async () => {
    const options = {
      type: "script" as const,
      url: "/assets/runtime.js",
      document,
      integrity: "sha384-neutral",
      crossOrigin: "anonymous" as const,
    };
    const first = loadAssetOnce(options);
    const second = loadAssetOnce(options);
    const script = document.querySelector<HTMLScriptElement>("script[data-wft-asset]");

    expect(first).toBe(second);
    expect(script).not.toBeNull();
    expect(script?.integrity).toBe("sha384-neutral");
    script?.dispatchEvent(new Event("load"));
    await expect(first).resolves.toBe(script);
    expect(document.querySelectorAll("script")).toHaveLength(1);
  });

  it("rejects incompatible security attributes for an existing key", async () => {
    const first = loadAssetOnce({
      type: "style",
      url: "/assets/addon.css",
      key: "addon-style",
      document,
      integrity: "sha384-one",
    });
    const conflict = loadAssetOnce({
      type: "style",
      url: "/assets/addon.css",
      key: "addon-style",
      document,
      integrity: "sha384-two",
    });

    await expect(conflict).rejects.toBeInstanceOf(AssetLoadError);
    document.querySelector("link")?.dispatchEvent(new Event("load"));
    await first;
  });

  it("removes a failed element and permits a retry", async () => {
    const options = { type: "script" as const, url: "/assets/retry.js", document };
    const first = loadAssetOnce(options);
    const failedElement = document.querySelector("script");
    failedElement?.dispatchEvent(new Event("error"));
    await expect(first).rejects.toBeInstanceOf(AssetLoadError);
    expect(failedElement?.isConnected).toBe(false);

    const retry = loadAssetOnce(options);
    const retryElement = document.querySelector("script");
    expect(retry).not.toBe(first);
    retryElement?.dispatchEvent(new Event("load"));
    await expect(retry).resolves.toBe(retryElement);
  });
});
