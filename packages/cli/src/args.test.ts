import { describe, expect, it } from "vitest";

import { getOption, hasFlag, parseArgs } from "./args.js";

describe("argument parsing", () => {
  it("allows boolean global flags before commands", () => {
    const parsed = parseArgs(["--json", "webflow", "components", "--site", "site-one"]);
    expect(parsed.positionals).toEqual(["webflow", "components"]);
    expect(hasFlag(parsed, "json")).toBe(true);
    expect(getOption(parsed, "site")).toBe("site-one");
  });
});
