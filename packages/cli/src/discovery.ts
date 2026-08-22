import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { createServer } from "vite";

import type { AddonEntry, ScriptPlacement } from "./types.js";

interface EntryConfig {
  readonly name: string;
  readonly input: string;
  readonly version?: string;
  readonly description?: string;
  readonly placement?: ScriptPlacement;
  readonly dependencies?: readonly string[];
  readonly attributes?: readonly string[];
  readonly scriptAttributes?: Readonly<Record<string, string>>;
  readonly defaultOptions?: Readonly<Record<string, unknown>>;
  readonly api?: Readonly<Record<string, unknown>>;
}

interface DevKitDiscoveryConfig {
  readonly entries?: readonly EntryConfig[];
}

interface CatalogAttribute {
  readonly name?: unknown;
}

interface CatalogDependency {
  readonly name?: unknown;
}

interface CatalogDefinition {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly description?: unknown;
  readonly placement?: unknown;
  readonly entry?: unknown;
  readonly attributes?: unknown;
  readonly dependencies?: unknown;
  readonly options?: unknown;
  readonly lifecycle?: unknown;
  readonly defaultOptions?: unknown;
}

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function discoverAddonEntries(root: string): Promise<readonly AddonEntry[]> {
  const configured = await readConfig(root);
  if (configured?.entries !== undefined) {
    const entries = await Promise.all(
      configured.entries.map((entry) => normalizeConfiguredEntry(root, entry)),
    );
    return enrichFromExportedCatalog(root, entries);
  }

  const candidates = await discoverCandidates(root);
  const entries = await Promise.all(candidates.map((input) => entryFromPath(input)));
  return enrichFromExportedCatalog(root, entries);
}

async function enrichFromExportedCatalog(
  root: string,
  entries: readonly AddonEntry[],
): Promise<readonly AddonEntry[]> {
  if (entries.length === 0) return entries;
  const indexPath = path.join(root, "src", "index.ts");
  let source: string;
  try {
    source = await readFile(indexPath, "utf8");
  } catch (error) {
    if (isMissing(error)) return entries;
    throw error;
  }
  if (!/\baddonDefinitions\b/u.test(source)) return entries;

  const server = await createServer({
    root,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    // Catalog discovery is a one-shot read. Disabling the file watcher avoids
    // retaining project handles and bypasses platform watcher defects without
    // changing local development or build behavior.
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const loaded = (await server.ssrLoadModule("/src/index.ts")) as {
      readonly addonDefinitions?: unknown;
    };
    if (!Array.isArray(loaded.addonDefinitions)) {
      throw new Error(`${indexPath} exports addonDefinitions, but it is not an array.`);
    }
    const definitions = new Map<string, CatalogDefinition>();
    for (const candidate of loaded.addonDefinitions) {
      if (!isRecord(candidate) || typeof candidate.name !== "string") {
        throw new Error(`${indexPath} contains invalid addon metadata.`);
      }
      definitions.set(candidate.name, candidate);
    }
    return entries.map((entry) => enrichEntry(entry, definitions.get(entry.name)));
  } catch (error) {
    throw new Error(`Cannot load addonDefinitions from ${indexPath}: ${errorMessage(error)}`, {
      cause: error,
    });
  } finally {
    await server.close();
  }
}

function enrichEntry(entry: AddonEntry, definition: CatalogDefinition | undefined): AddonEntry {
  if (definition === undefined) return entry;
  const description =
    typeof definition.description === "string" ? definition.description : entry.description;
  const placement =
    definition.placement === "head" || definition.placement === "body-end"
      ? definition.placement
      : entry.placement;
  const attributes = Array.isArray(definition.attributes)
    ? definition.attributes
        .filter(isRecord)
        .map((attribute: CatalogAttribute) => attribute.name)
        .filter((name): name is string => typeof name === "string")
    : entry.attributes;
  const dependencies = Array.isArray(definition.dependencies)
    ? definition.dependencies
        .filter(isRecord)
        .map((dependency: CatalogDependency) => dependency.name)
        .filter((name): name is string => typeof name === "string")
    : entry.dependencies;
  return {
    ...entry,
    ...(typeof definition.version === "string" ? { version: definition.version } : {}),
    description,
    placement,
    attributes,
    dependencies,
    ...(isRecord(definition.defaultOptions) && !Array.isArray(definition.defaultOptions)
      ? { defaultOptions: definition.defaultOptions }
      : {}),
    api: {
      ...entry.api,
      ...(typeof definition.entry === "string" ? { entry: definition.entry } : {}),
      ...(Array.isArray(definition.lifecycle) ? { lifecycle: definition.lifecycle } : {}),
      ...(Array.isArray(definition.options) ? { options: definition.options } : {}),
    },
  };
}

async function readConfig(root: string): Promise<DevKitDiscoveryConfig | undefined> {
  const configPath = path.join(root, "devkit.config.json");
  try {
    return JSON.parse(await readFile(configPath, "utf8")) as DevKitDiscoveryConfig;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw new Error(`Cannot read ${configPath}: ${errorMessage(error)}`, { cause: error });
  }
}

async function normalizeConfiguredEntry(root: string, entry: EntryConfig): Promise<AddonEntry> {
  validateName(entry.name);
  const input = path.resolve(root, entry.input);
  await access(input);
  const sidecar = await readSidecar(input);
  return mergeEntry(entry.name, input, entry, sidecar);
}

async function discoverCandidates(root: string): Promise<readonly string[]> {
  const sourceRoot = path.join(root, "src");
  const files = await walkIfPresent(sourceRoot);
  return files
    .filter((file) => {
      const extension = path.extname(file);
      if (!sourceExtensions.has(extension)) return false;
      const relative = path.relative(sourceRoot, file).split(path.sep).join("/");
      return (
        relative.startsWith("entries/") ||
        /^[^/]+\/index\.(?:ts|tsx|js|mjs)$/.test(relative) ||
        /(?:^|\/)addons\/[^/]+\/index\.(?:ts|tsx|js|mjs)$/.test(relative) ||
        /(?:^|\/)addons\/[^/]+\.entry\.(?:ts|tsx|js|mjs)$/.test(relative)
      );
    })
    .sort((left, right) => left.localeCompare(right));
}

async function entryFromPath(input: string): Promise<AddonEntry> {
  const parsed = path.parse(input);
  const parent = path.basename(parsed.dir);
  const rawName = parsed.name === "index" ? parent : parsed.name.replace(/\.entry$/, "");
  const name = kebabCase(rawName);
  validateName(name);
  const sidecar = await readSidecar(input);
  return mergeEntry(name, input, {}, sidecar);
}

async function readSidecar(input: string): Promise<Partial<EntryConfig>> {
  const parsed = path.parse(input);
  const sidecarPath =
    parsed.name === "index"
      ? path.join(parsed.dir, "addon.json")
      : path.join(parsed.dir, `${parsed.name.replace(/\.entry$/, "")}.addon.json`);
  try {
    return JSON.parse(await readFile(sidecarPath, "utf8")) as Partial<EntryConfig>;
  } catch (error) {
    if (isMissing(error)) return {};
    throw new Error(`Cannot read addon metadata ${sidecarPath}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}

function mergeEntry(
  name: string,
  input: string,
  preferred: Partial<EntryConfig>,
  fallback: Partial<EntryConfig>,
): AddonEntry {
  const metadata = { ...fallback, ...preferred };
  return {
    name,
    input,
    ...(metadata.version === undefined ? {} : { version: metadata.version }),
    description: metadata.description ?? `Reusable ${name} addon.`,
    placement: metadata.placement ?? "body-end",
    dependencies: metadata.dependencies ?? [],
    attributes: metadata.attributes ?? [],
    scriptAttributes: metadata.scriptAttributes ?? {},
    ...(metadata.defaultOptions === undefined ? {} : { defaultOptions: metadata.defaultOptions }),
    api: metadata.api ?? { entry: name },
  };
}

async function walkIfPresent(directory: string): Promise<readonly string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return walkIfPresent(target);
        return entry.isFile() ? [target] : [];
      }),
    );
    return nested.flat();
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function validateName(name: string): void {
  if (!namePattern.test(name)) {
    throw new Error(`Addon name ${JSON.stringify(name)} must use lower-case kebab-case.`);
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
