// @vitest-environment node
import { describe, expect, it } from "vitest";

import * as core from "@slicemedia/devkit-core";
import { createDevTools } from "../src/index.js";

describe("DevTools import boundary", () => {
  it("can be imported and constructed without browser globals and stays off the root export", () => {
    expect(typeof document).toBe("undefined");
    expect(core).not.toHaveProperty("createDevTools");
    const tools = createDevTools({ addons: [] });
    expect(tools.getSnapshot()).toBeUndefined();
    tools.destroy();
    expect(() => tools.init()).toThrow("requires a browser document");
  });
});
