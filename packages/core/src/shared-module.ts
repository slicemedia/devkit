import { loadAssetOnce, type LoadAssetOptions } from "./assets.js";

// Replaced by the DevKit CLI for each build output and for the local development server.
// Other bundlers can omit it: the standard sibling-vendor layout remains the fallback.
declare const __SLICEMEDIA_VENDOR_DIRECTORY__: string | undefined;

const MODULES = Symbol.for("slicemedia.devkit.shared-modules.v1");
type ModuleDocument = Document & { [MODULES]?: Map<string, unknown> };

function getDocument(document?: Document): Document {
  const target =
    document ?? (typeof globalThis.document === "undefined" ? undefined : globalThis.document);
  if (!target) throw new Error("A browser document is required for shared dependencies.");
  return target;
}

function getModules(document: Document): Map<string, unknown> {
  const host = document as ModuleDocument;
  if (!host[MODULES]) Object.defineProperty(host, MODULES, { value: new Map<string, unknown>() });
  return host[MODULES]!;
}

/** Called synchronously by a project-owned vendor IIFE, once its imports are ready. */
export function registerSharedModule<Value>(
  value: Value,
  options: { readonly document?: Document; readonly url?: string } = {},
): void {
  const document = getDocument(options.document);
  const url = options.url ?? (document.currentScript as HTMLScriptElement | null)?.src;
  if (!url) throw new Error("Shared module registration requires the executing vendor script URL.");
  const key = new URL(url, document.baseURI).href;
  const modules = getModules(document);
  if (modules.has(key)) throw new Error(`Shared module is already registered: ${key}`);
  modules.set(key, value);
}

export interface LoadSharedModuleOptions extends Omit<LoadAssetOptions, "type" | "isReady"> {
  /** CSS emitted by the vendor entry, loaded once before returning its API. */
  readonly styles?: readonly Omit<LoadAssetOptions, "type" | "document" | "isReady">[];
}

/** Capture import.meta.url before asynchronous initialization. The CLI supplies the vendor
 * directory for each output depth. An explicit base URL supports separately hosted vendors.
 */
export function resolveVendorAsset(
  file: string,
  moduleUrl: string,
  vendorBaseUrl?: string,
): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:js|css)$/u.test(file))
    throw new TypeError("Expected a vendor JS or CSS filename.");
  const directory =
    typeof __SLICEMEDIA_VENDOR_DIRECTORY__ === "string"
      ? __SLICEMEDIA_VENDOR_DIRECTORY__
      : "../vendor/";
  return new URL(file, vendorBaseUrl ?? new URL(directory, moduleUrl)).href;
}

/** Load a vendor's JS and CSS on demand. Separate addon bundles share the same page registry. */
export async function loadSharedModule<Value>(options: LoadSharedModuleOptions): Promise<Value> {
  const document = getDocument(options.document);
  const url = new URL(options.url, document.baseURI).href;
  const modules = getModules(document);
  await Promise.all([
    loadAssetOnce({ ...options, document, type: "script", isReady: () => modules.has(url) }),
    ...(options.styles ?? []).map((style) => loadAssetOnce({ ...style, document, type: "style" })),
  ]);
  if (!modules.has(url)) throw new Error(`Vendor script did not register a shared module: ${url}`);
  return modules.get(url) as Value;
}
