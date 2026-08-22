export interface Pagination {
  readonly limit?: number;
  readonly offset?: number;
  readonly total?: number;
  readonly next?: string | null;
}

export interface PaginatedResponse {
  readonly pagination?: Pagination;
}

export interface WebflowComponent {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly [key: string]: unknown;
}

export interface WebflowComponentProperty {
  readonly propertyId: string;
  readonly label?: string;
  readonly type?: string;
  readonly value?: unknown;
  readonly [key: string]: unknown;
}

export interface RegisteredScript {
  readonly id: string;
  readonly displayName: string;
  readonly hostedLocation: string;
  readonly version: string;
  readonly integrityHash?: string;
  readonly [key: string]: unknown;
}

export interface AppliedScript {
  readonly id: string;
  readonly location: "header" | "footer";
  readonly version: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

export interface SiteCustomCode {
  readonly scripts: readonly AppliedScript[];
  readonly createdOn?: string;
  readonly lastUpdated?: string;
}

export interface WebflowSite {
  readonly id: string;
  readonly workspaceId?: string;
  readonly displayName?: string;
  readonly shortName?: string;
  readonly lastPublished?: string | null;
  readonly lastUpdated?: string | null;
  readonly [key: string]: unknown;
}

export interface WebflowClientOptions {
  readonly token?: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly retries?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export class WebflowHttpError extends Error {
  readonly status: number;
  readonly responseBody: unknown;
  readonly responseReceived = true;

  constructor(status: number, responseBody: unknown) {
    super(`Webflow API request failed with HTTP ${status}.`);
    this.name = "WebflowHttpError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

export class WebflowClient {
  readonly #token: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #retries: number;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  constructor(options: WebflowClientOptions = {}) {
    this.#token = options.token ?? webflowTokenFromEnvironment();
    this.#baseUrl = (options.baseUrl ?? "https://api.webflow.com/v2").replace(/\/+$/, "");
    this.#fetch = options.fetch ?? fetch;
    this.#retries = options.retries ?? 4;
    this.#sleep = options.sleep ?? delay;
  }

  async #request<T>(resource: string): Promise<T> {
    const url = resource.startsWith("http")
      ? resource
      : `${this.#baseUrl}/${resource.replace(/^\/+/, "")}`;
    for (let attempt = 0; ; attempt += 1) {
      const headers = new Headers();
      headers.set("Authorization", `Bearer ${this.#token}`);
      headers.set("Accept", "application/json");
      let response: Response;
      try {
        response = await this.#fetch(url, { method: "GET", headers });
      } catch (error) {
        if (attempt >= this.#retries) throw error;
        await this.#sleep(retryDelay(null, attempt));
        continue;
      }
      const responseBody = await parseResponseBody(response);
      if (response.ok) return responseBody as T;
      if (!isRetryable(response.status) || attempt >= this.#retries) {
        throw new WebflowHttpError(response.status, responseBody);
      }
      await this.#sleep(retryDelay(response.headers.get("retry-after"), attempt));
    }
  }

  async #paginate<T, TResponse extends PaginatedResponse>(
    resource: string,
    selectItems: (response: TResponse) => readonly T[],
  ): Promise<readonly T[]> {
    const requestedLimit = 100;
    const collected: T[] = [];
    let offset = 0;
    let cursor: string | undefined;
    const visited = new Set<string>();

    for (;;) {
      const requestUrl = resource.startsWith("http")
        ? new URL(resource)
        : new URL(`${this.#baseUrl}/${resource.replace(/^\/+/, "")}`);
      requestUrl.searchParams.set("limit", String(requestedLimit));
      if (cursor !== undefined) requestUrl.searchParams.set("cursor", cursor);
      else requestUrl.searchParams.set("offset", String(offset));
      const page = await this.#request<TResponse>(requestUrl.toString());
      const items = selectItems(page);
      collected.push(...items);
      const pagination = page.pagination;
      const pageOffset = paginationInteger(pagination?.offset, "offset", offset, true);
      const limit = paginationInteger(pagination?.limit, "limit", requestedLimit, false);
      const total = paginationInteger(pagination?.total, "total", undefined, true);
      if (limit > requestedLimit) {
        throw new Error(`Webflow pagination returned limit ${limit} above ${requestedLimit}.`);
      }
      if (items.length > limit) {
        throw new Error("Webflow pagination returned more items than its declared limit.");
      }
      if (cursor === undefined && pageOffset !== offset) {
        throw new Error("Webflow pagination returned an unexpected offset.");
      }
      if (pagination?.next !== undefined && pagination.next !== null && pagination.next !== "") {
        if (visited.has(pagination.next))
          throw new Error("Webflow pagination returned a repeated cursor.");
        visited.add(pagination.next);
        cursor = pagination.next;
        continue;
      }
      if (total === undefined) {
        if (limit > 0 && items.length >= limit) {
          throw new Error(
            "Webflow pagination returned a full page without a next cursor or total count.",
          );
        }
        break;
      }
      const consumedOffset = pageOffset + items.length;
      if (consumedOffset > total) {
        throw new Error("Webflow pagination returned more items than its total count.");
      }
      if (consumedOffset === total) break;
      if (items.length === 0 || items.length < limit) {
        throw new Error("Webflow pagination ended before its declared total count.");
      }
      offset = consumedOffset;
    }
    return collected;
  }

  listComponents(siteId: string): Promise<readonly WebflowComponent[]> {
    return this.#paginate<
      WebflowComponent,
      PaginatedResponse & { components?: WebflowComponent[] }
    >(`/sites/${encodeURIComponent(siteId)}/components`, (page) => page.components ?? []);
  }

  getSite(siteId: string): Promise<WebflowSite> {
    return this.#request<WebflowSite>(`/sites/${encodeURIComponent(siteId)}`);
  }

  listComponentProperties(
    siteId: string,
    componentId: string,
  ): Promise<readonly WebflowComponentProperty[]> {
    return this.#paginate<
      WebflowComponentProperty,
      PaginatedResponse & {
        properties?: WebflowComponentProperty[];
        componentProperties?: WebflowComponentProperty[];
      }
    >(
      `/sites/${encodeURIComponent(siteId)}/components/${encodeURIComponent(componentId)}/properties`,
      (page) => page.properties ?? page.componentProperties ?? [],
    );
  }

  listRegisteredScripts(siteId: string): Promise<readonly RegisteredScript[]> {
    return this.#paginate<
      RegisteredScript,
      PaginatedResponse & { registeredScripts?: RegisteredScript[]; scripts?: RegisteredScript[] }
    >(
      `/sites/${encodeURIComponent(siteId)}/registered_scripts`,
      (page) => page.registeredScripts ?? page.scripts ?? [],
    );
  }

  async getCustomCode(siteId: string): Promise<SiteCustomCode> {
    const response = await this.#request<Partial<SiteCustomCode>>(
      `/sites/${encodeURIComponent(siteId)}/custom_code`,
    );
    return {
      scripts: response.scripts ?? [],
      ...(typeof response.createdOn === "string" ? { createdOn: response.createdOn } : {}),
      ...(typeof response.lastUpdated === "string" ? { lastUpdated: response.lastUpdated } : {}),
    };
  }
}

function paginationInteger(
  value: number | undefined,
  name: string,
  fallback: number,
  allowZero: boolean,
): number;
function paginationInteger(
  value: number | undefined,
  name: string,
  fallback: undefined,
  allowZero: boolean,
): number | undefined;
function paginationInteger(
  value: number | undefined,
  name: string,
  fallback: number | undefined,
  allowZero: boolean,
): number | undefined {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) {
    throw new Error(`Webflow pagination returned invalid ${name}.`);
  }
  return value;
}

export function webflowTokenFromEnvironment(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.WEBFLOW_OAUTH_ACCESS_TOKEN ?? env.WEBFLOW_OAUTH_TOKEN ?? env.WEBFLOW_API_TOKEN;
  if (token === undefined || token.trim() === "") {
    throw new Error(
      "Set WEBFLOW_OAUTH_ACCESS_TOKEN or WEBFLOW_API_TOKEN before using Webflow API commands.",
    );
  }
  return token;
}

export function webflowOAuthTokenFromEnvironment(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.WEBFLOW_OAUTH_ACCESS_TOKEN ?? env.WEBFLOW_OAUTH_TOKEN;
  if (token === undefined || token.trim() === "") {
    throw new Error(
      "Set WEBFLOW_OAUTH_ACCESS_TOKEN before inspecting Webflow custom code; API, site, and workspace tokens cannot access custom code.",
    );
  }
  return token;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const body = await response.text();
  if (body === "") return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function isRetryable(status: number): boolean {
  if (status === 429) return true;
  return status === 500 || status === 502 || status === 503 || status === 504;
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 30_000));
  }
  return Math.min(250 * 2 ** attempt, 4_000);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
