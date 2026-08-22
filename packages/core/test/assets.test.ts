import { afterEach, describe, expect, it } from "vitest";

import { AssetLoadError, loadAssetOnce } from "../src/index.js";

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe("loadAssetOnce", () => {
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
