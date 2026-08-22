import type { AppliedScript, RegisteredScript, WebflowClient } from "./client.js";

export interface RenderedScript {
  readonly source?: string;
  readonly integrity?: string;
  readonly type?: string;
  readonly async: boolean;
  readonly defer: boolean;
}

export interface ApiScriptScan {
  readonly registered: readonly RegisteredScript[];
  readonly applied: readonly AppliedScript[];
  readonly orphanedAppliedIds: readonly string[];
}

export async function scanRenderedScripts(
  pageUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<readonly RenderedScript[]> {
  const url = new URL(pageUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("--url must use HTTP or HTTPS.");
  }
  const response = await fetcher(url, { headers: { Accept: "text/html" } });
  if (!response.ok) throw new Error(`Page scan failed with HTTP ${response.status}.`);
  return parseRenderedScripts(await response.text());
}

export function parseRenderedScripts(html: string): readonly RenderedScript[] {
  const scripts: RenderedScript[] = [];
  const scriptPattern = /<script\b([^>]*)>/giu;
  for (const match of html.matchAll(scriptPattern)) {
    const attributes = match[1] ?? "";
    const source = readAttribute(attributes, "src");
    const integrity = readAttribute(attributes, "integrity");
    const type = readAttribute(attributes, "type");
    scripts.push({
      ...(source === undefined ? {} : { source }),
      ...(integrity === undefined ? {} : { integrity }),
      ...(type === undefined ? {} : { type }),
      async: hasAttribute(attributes, "async"),
      defer: hasAttribute(attributes, "defer"),
    });
  }
  return scripts;
}

export async function scanApiScripts(
  client: WebflowClient,
  siteId: string,
): Promise<ApiScriptScan> {
  const [registered, customCode] = await Promise.all([
    client.listRegisteredScripts(siteId),
    client.getCustomCode(siteId),
  ]);
  const registeredIds = new Set(registered.map((script) => script.id));
  return {
    registered,
    applied: customCode.scripts,
    orphanedAppliedIds: customCode.scripts
      .filter((script) => !registeredIds.has(script.id))
      .map((script) => script.id),
  };
}

function readAttribute(attributes: string, name: string): string | undefined {
  const expression = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "iu",
  );
  const match = expression.exec(attributes);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function hasAttribute(attributes: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|$)`, "iu").test(attributes);
}
