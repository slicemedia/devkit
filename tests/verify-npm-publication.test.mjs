import { describe, expect, it } from "vitest";

import {
  registryVerificationAttempts,
  registryVerificationDelayMilliseconds,
} from "../scripts/verify-npm-publication.mjs";

describe("npm publication verification window", () => {
  it("waits up to eighteen minutes for publish-time scanning and registry availability", () => {
    expect(registryVerificationAttempts).toBe(73);
    expect(registryVerificationDelayMilliseconds).toBe(15_000);
    expect((registryVerificationAttempts - 1) * registryVerificationDelayMilliseconds).toBe(
      18 * 60 * 1_000,
    );
  });
});
