import { describe, expect, it } from "vitest";

import { resolveVendorAsset } from "../src/shared-module.js";

describe("vendor asset URLs without a CLI build", () => {
  it("retains the sibling-directory fallback and honors a separately hosted vendor base", () => {
    expect(
      resolveVendorAsset("slider.js", "https://assets.example.com/site/addons/gallery.js?v=2"),
    ).toBe("https://assets.example.com/site/vendor/slider.js");
    expect(
      resolveVendorAsset(
        "slider.css",
        "https://assets.example.com/site/addons/sliders/gallery/index.js",
        "https://vendors.example.com/release/",
      ),
    ).toBe("https://vendors.example.com/release/slider.css");
  });
});
