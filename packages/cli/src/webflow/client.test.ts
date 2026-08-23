import { describe, expect, it, vi } from "vitest";

import { WebflowClient, webflowOAuthTokenFromEnvironment } from "./client.js";

describe("WebflowClient", () => {
  it("fails closed when custom-code inspection OAuth is not configured", () => {
    expect(() => webflowOAuthTokenFromEnvironment({ WEBFLOW_API_TOKEN: "api-only" })).toThrow(
      "custom code",
    );
    expect(webflowOAuthTokenFromEnvironment({ WEBFLOW_OAUTH_ACCESS_TOKEN: "oauth-token" })).toBe(
      "oauth-token",
    );
  });

  it("paginates offset responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          components: [{ id: "one" }, { id: "two" }],
          pagination: { limit: 2, offset: 0, total: 3 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          components: [{ id: "three" }],
          pagination: { limit: 2, offset: 2, total: 3 },
        }),
      );
    const client = new WebflowClient({
      token: "test-token",
      fetch: fetcher as typeof fetch,
      baseUrl: "https://api.example.test/v2",
    });

    await expect(client.listComponents("site-one")).resolves.toEqual([
      { id: "one" },
      { id: "two" },
      { id: "three" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/v2/sites/site-one/components");
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("offset=2");
  });

  it("fails closed when a full page omits both continuation mechanisms", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        components: Array.from({ length: 100 }, (_, index) => ({ id: `component-${index}` })),
        pagination: { limit: 100, offset: 0 },
      }),
    );
    const client = new WebflowClient({
      token: "test-token",
      fetch: fetcher as typeof fetch,
      baseUrl: "https://api.example.test/v2",
    });

    await expect(client.listComponents("site-one")).rejects.toThrow("full page");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects invalid page limits and premature totals", async () => {
    const invalidLimitClient = new WebflowClient({
      token: "test-token",
      fetch: vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ components: [], pagination: { limit: 0, offset: 0 } }),
        ) as typeof fetch,
      baseUrl: "https://api.example.test/v2",
    });
    await expect(invalidLimitClient.listComponents("site-one")).rejects.toThrow("invalid limit");

    const prematureClient = new WebflowClient({
      token: "test-token",
      fetch: vi.fn().mockResolvedValue(
        jsonResponse({
          components: [{ id: "one" }],
          pagination: { limit: 2, offset: 0, total: 3 },
        }),
      ) as typeof fetch,
      baseUrl: "https://api.example.test/v2",
    });
    await expect(prematureClient.listComponents("site-one")).rejects.toThrow("declared total");
  });

  it("reads site metadata without mutation", async () => {
    const remoteSite = {
      id: "site-one",
      lastUpdated: "2026-01-01T00:00:00.000Z",
      lastPublished: null,
    };
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(remoteSite));
    const client = new WebflowClient({
      token: "test-token",
      fetch: fetcher as typeof fetch,
      baseUrl: "https://api.example.test/v2",
    });

    await expect(client.getSite("site-one")).resolves.toEqual(remoteSite);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/v2/sites/site-one");
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("offset=");
  });

  it("removes every trailing slash from a configured base URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ id: "site-one" }));
    const client = new WebflowClient({
      token: "test-token",
      fetch: fetcher as typeof fetch,
      baseUrl: "https://api.example.test/v2///",
    });

    await expect(client.getSite("site-one")).resolves.toEqual({ id: "site-one" });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.example.test/v2/sites/site-one");
  });

  it("preserves long non-trailing slash runs without pathological backtracking", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ id: "site-one" }));
    const baseUrl = `https://api.example.test/${"/".repeat(100_000)}x`;
    const client = new WebflowClient({
      token: "test-token",
      fetch: fetcher as typeof fetch,
      baseUrl,
    });

    await expect(client.getSite("site-one")).resolves.toEqual({ id: "site-one" });
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${baseUrl}/sites/site-one`);
  });

  it("backs off and retries rate limits", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "slow down" }), {
          status: 429,
          headers: { "retry-after": "0" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ scripts: [], pagination: { total: 0 } }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new WebflowClient({
      token: "test-token",
      fetch: fetcher as typeof fetch,
      baseUrl: "https://api.example.test/v2",
      sleep,
    });

    await expect(client.listRegisteredScripts("site-one")).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(0);
  });

  it("exposes no generic request or Webflow mutation methods", () => {
    const client = new WebflowClient({
      token: "test-token",
      fetch: vi.fn() as typeof fetch,
      baseUrl: "https://api.example.test/v2",
    });
    expect(client).not.toHaveProperty("request");
    expect(client).not.toHaveProperty("registerHostedScript");
    expect(client).not.toHaveProperty("applyCustomCode");
    expect(client).not.toHaveProperty("publishStaging");
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
