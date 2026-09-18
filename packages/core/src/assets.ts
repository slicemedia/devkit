export type AssetType = "script" | "style";

export interface LoadAssetOptions {
  readonly url: string;
  readonly type: AssetType;
  readonly document?: Document;
  readonly key?: string;
  readonly integrity?: string;
  readonly crossOrigin?: "anonymous" | "use-credentials";
  readonly nonce?: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly scriptAsync?: boolean;
  readonly removeOnError?: boolean;
  /** Confirms readiness of an existing script whose load event may have already fired. */
  readonly isReady?: () => boolean;
}

export type LoadedAssetElement = HTMLScriptElement | HTMLLinkElement;

interface AssetCacheEntry {
  readonly fingerprint: string;
  readonly promise: Promise<LoadedAssetElement>;
}

// A module-local WeakMap is duplicated by standalone IIFEs. Install lazily on the document so
// every addon shares pending loads and key/security checks without requiring the global runtime.
const ASSET_CACHE = Symbol.for("slicemedia.devkit.assets.v1");
type AssetDocument = Document & { [ASSET_CACHE]?: Map<string, AssetCacheEntry> };

const PROTECTED_ATTRIBUTES = new Set([
  "src",
  "href",
  "rel",
  "integrity",
  "crossorigin",
  "nonce",
  "data-wft-asset",
  "data-wft-asset-state",
]);

export class AssetLoadError extends Error {
  override readonly name = "AssetLoadError";

  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message);
  }
}

function getCache(targetDocument: Document): Map<string, AssetCacheEntry> {
  const host = targetDocument as AssetDocument;
  let cache = host[ASSET_CACHE];
  if (!cache) {
    cache = new Map();
    Object.defineProperty(host, ASSET_CACHE, { value: cache });
  }
  return cache;
}

function canonicalizeUrl(url: string, targetDocument: Document): string {
  if (url.trim() === "") throw new AssetLoadError("Asset URL must not be empty.", url);
  try {
    return new URL(url, targetDocument.baseURI).href;
  } catch {
    throw new AssetLoadError(`Invalid asset URL: ${url}`, url);
  }
}

function findExistingAsset(
  targetDocument: Document,
  type: AssetType,
  canonicalUrl: string,
): LoadedAssetElement | undefined {
  const selector = type === "script" ? "script[src]" : 'link[rel="stylesheet"][href]';
  for (const candidate of targetDocument.querySelectorAll<LoadedAssetElement>(selector)) {
    const candidateUrl =
      candidate.tagName === "SCRIPT"
        ? (candidate as HTMLScriptElement).src
        : (candidate as HTMLLinkElement).href;
    if (candidateUrl === canonicalUrl) return candidate;
  }
  return undefined;
}

function createFingerprint(options: LoadAssetOptions, canonicalUrl: string): string {
  const attributes = Object.entries(options.attributes ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify({
    url: canonicalUrl,
    type: options.type,
    integrity: options.integrity ?? "",
    crossOrigin: options.crossOrigin ?? "",
    nonce: options.nonce ?? "",
    attributes,
  });
}

function assertCustomAttributes(attributes: Readonly<Record<string, string>> | undefined): void {
  for (const name of Object.keys(attributes ?? {})) {
    if (PROTECTED_ATTRIBUTES.has(name.toLowerCase())) {
      throw new AssetLoadError(`Asset attribute "${name}" is managed by loadAssetOnce.`, "");
    }
  }
}

function createElement(
  targetDocument: Document,
  options: LoadAssetOptions,
  canonicalUrl: string,
): LoadedAssetElement {
  const element =
    options.type === "script"
      ? targetDocument.createElement("script")
      : targetDocument.createElement("link");

  if (element.tagName === "SCRIPT") {
    const script = element as HTMLScriptElement;
    script.src = canonicalUrl;
    script.async = options.scriptAsync ?? true;
  } else {
    const stylesheet = element as HTMLLinkElement;
    stylesheet.rel = "stylesheet";
    stylesheet.href = canonicalUrl;
  }

  if (options.integrity) element.integrity = options.integrity;
  if (options.crossOrigin) element.crossOrigin = options.crossOrigin;
  if (options.nonce) element.nonce = options.nonce;
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  return element;
}

function hasLoaded(element: LoadedAssetElement): boolean {
  if (element.dataset.wftAssetState === "loaded") return true;
  if (element.tagName === "LINK") {
    try {
      return (element as HTMLLinkElement).sheet !== null;
    } catch {
      return false;
    }
  }
  // The presence of a script tag says nothing about whether its code has executed.
  return false;
}

/**
 * Loads one external script or stylesheet per document/key. Concurrent callers share a promise;
 * incompatible requests for the same key fail instead of weakening integrity settings.
 */
export function loadAssetOnce(options: LoadAssetOptions): Promise<LoadedAssetElement> {
  const targetDocument =
    options.document ?? (typeof document === "undefined" ? undefined : document);
  if (!targetDocument) {
    return Promise.reject(
      new AssetLoadError("A browser document is required to load an asset.", options.url),
    );
  }

  try {
    assertCustomAttributes(options.attributes);
  } catch (error) {
    return Promise.reject(error);
  }

  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeUrl(options.url, targetDocument);
  } catch (error) {
    return Promise.reject(error);
  }
  const key = options.key ?? `${options.type}:${canonicalUrl}`;
  const fingerprint = createFingerprint(options, canonicalUrl);
  const cache = getCache(targetDocument);
  const cached = cache.get(key);
  if (cached) {
    if (cached.fingerprint !== fingerprint) {
      return Promise.reject(
        new AssetLoadError(
          `Asset key "${key}" was requested with incompatible URL or security attributes.`,
          canonicalUrl,
        ),
      );
    }
    return cached.promise;
  }

  const existing = findExistingAsset(targetDocument, options.type, canonicalUrl);
  if (
    existing &&
    ((options.integrity && existing.integrity !== options.integrity) ||
      (options.crossOrigin && existing.crossOrigin !== options.crossOrigin))
  ) {
    return Promise.reject(
      new AssetLoadError(
        `An existing asset at ${canonicalUrl} has incompatible integrity or CORS attributes.`,
        canonicalUrl,
      ),
    );
  }
  const element = existing ?? createElement(targetDocument, options, canonicalUrl);
  element.dataset.wftAsset = key;

  const promise = new Promise<LoadedAssetElement>((resolve, reject) => {
    if (existing && (hasLoaded(existing) || options.isReady?.())) {
      element.dataset.wftAssetState = "loaded";
      resolve(element);
      return;
    }

    element.dataset.wftAssetState = "loading";
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanupListeners = () => {
      element.removeEventListener("load", handleLoad);
      element.removeEventListener("error", handleError);
      if (timeout !== undefined) clearTimeout(timeout);
    };

    const handleLoad = () => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      element.dataset.wftAssetState = "loaded";
      resolve(element);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      element.dataset.wftAssetState = "error";
      if (!existing && (options.removeOnError ?? true)) element.remove();
      const current = cache.get(key);
      if (current?.fingerprint === fingerprint) cache.delete(key);
      reject(new AssetLoadError(message, canonicalUrl));
    };

    const handleError = () => {
      fail(`Failed to load ${options.type} asset: ${canonicalUrl}`);
    };

    element.addEventListener("load", handleLoad, { once: true });
    element.addEventListener("error", handleError, { once: true });

    const timeoutMs = options.timeoutMs ?? 30_000;
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        fail(`Timed out loading ${options.type} asset after ${timeoutMs}ms: ${canonicalUrl}`);
      }, timeoutMs);
    }

    if (!existing) {
      const parent =
        options.type === "style"
          ? targetDocument.head
          : (targetDocument.body ?? targetDocument.head);
      parent.append(element);
    }
  });

  cache.set(key, { fingerprint, promise });
  return promise;
}
