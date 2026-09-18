import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { createServer } from "vite";

import type { AddonEntry, AttributeDocumentation, EntryUsage, ScriptPlacement } from "./types.js";

interface EntryConfig {
  readonly name: string;
  readonly input: string;
  readonly kind?: AddonEntry["kind"];
  readonly version?: string;
  readonly description?: string;
  readonly placement?: ScriptPlacement;
  readonly dependencies?: readonly string[];
  readonly attributes?: readonly string[];
  readonly scriptAttributes?: Readonly<Record<string, string>>;
  readonly defaultOptions?: Readonly<Record<string, unknown>>;
  readonly api?: Readonly<Record<string, unknown>>;
  readonly usage?: EntryUsage;
  readonly attributeDetails?: readonly AttributeDocumentation[];
  readonly definition?: AddonEntry["definition"];
  readonly bundle?: AddonEntry["bundle"];
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
  readonly usage?: EntryUsage;
}

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function discoverAddonEntries(root: string): Promise<readonly AddonEntry[]> {
  const configured = await readConfig(root);
  const candidates = await discoverCandidates(root);
  if (configured?.entries !== undefined) {
    const entries = await Promise.all(
      configured.entries.map((entry) => normalizeConfiguredEntry(root, entry)),
    );
    // Configured metadata overrides the same source; new public addons remain discoverable.
    const inputs = new Set(
      entries.map((entry) => path.resolve(root, entry.bundle?.input ?? entry.input)),
    );
    for (const input of candidates) {
      if (publicEntry(root, input) && !inputs.has(input))
        entries.push(await entryFromPath(root, input));
    }
    assertUniqueNames(entries);
    return enrichFromExportedCatalog(root, entries);
  }

  const entries = await Promise.all(candidates.map((input) => entryFromPath(root, input)));
  assertUniqueNames(entries);
  return enrichFromExportedCatalog(root, entries);
}

async function enrichFromExportedCatalog(
  root: string,
  entries: readonly AddonEntry[],
): Promise<readonly AddonEntry[]> {
  if (entries.length === 0) return entries;
  const indexPath = path.join(root, "src", "index.ts");
  let source = "";
  try {
    source = await readFile(indexPath, "utf8");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const hasCatalog = /\baddonDefinitions\b/u.test(source);
  if (!hasCatalog && !entries.some((entry) => entry.definition)) return entries;

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
    const loaded = (
      hasCatalog ? await server.ssrLoadModule("/src/index.ts") : { addonDefinitions: [] }
    ) as {
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
    const enriched: AddonEntry[] = [];
    for (const entry of entries) {
      let definition = definitions.get(entry.name);
      if (entry.definition) {
        const module = (await server.ssrLoadModule(
          path.resolve(root, entry.definition.module).split(path.sep).join("/"),
        )) as Record<string, unknown>;
        const candidate = module[entry.definition.export];
        if (!isRecord(candidate) || candidate.name !== entry.name) {
          throw new Error(
            `Metadata export ${entry.definition.export} must describe ${entry.name}.`,
          );
        }
        definition = candidate;
      }
      enriched.push(enrichEntry(entry, definition));
    }
    return enriched;
  } catch (error) {
    throw new Error(`Cannot load addon metadata: ${errorMessage(error)}`, {
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
    ...(Array.isArray(definition.attributes)
      ? {
          attributeDetails: definition.attributes
            .filter(isRecord)
            .filter(
              (attribute) => typeof attribute.name === "string",
            ) as unknown as readonly AttributeDocumentation[],
        }
      : {}),
    dependencies,
    ...(definition.usage ? { usage: definition.usage } : {}),
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
  if (entry.kind !== undefined && entry.kind !== "addon" && entry.kind !== "project")
    throw new Error(`Invalid entry kind for ${entry.name}. Expected addon or project.`);
  const input = path.resolve(root, entry.input);
  await access(input);
  const sidecar = await readSidecar(root, input);
  return withBrowserBundle(root, mergeEntry(entry.name, input, entry, sidecar));
}

async function discoverCandidates(root: string): Promise<readonly string[]> {
  const sourceRoot = path.join(root, "src");
  const files = await walkIfPresent(sourceRoot);
  return files
    .filter((file) => {
      const extension = path.extname(file);
      if (!sourceExtensions.has(extension)) return false;
      const relative = path.relative(sourceRoot, file).split(path.sep).join("/");
      if (relative.split("/").some((part) => part.startsWith("_") || part.startsWith(".")))
        return false;
      if (/\.(?:test|spec|d)(?:\.entry)?\.[^.]+$/u.test(relative)) return false;
      return (
        publicEntry(root, file) !== undefined ||
        relative.startsWith("entries/") ||
        /^[^/]+\/index\.(?:ts|tsx|js|mjs)$/.test(relative) ||
        /(?:^|\/)addons\/[^/]+\/index\.(?:ts|tsx|js|mjs)$/.test(relative) ||
        /(?:^|\/)addons\/[^/]+\.entry\.(?:ts|tsx|js|mjs)$/.test(relative)
      );
    })
    .sort((left, right) => left.localeCompare(right));
}

async function entryFromPath(root: string, input: string): Promise<AddonEntry> {
  const parsed = path.parse(input);
  const parent = path.basename(parsed.dir);
  const stem = parsed.name.replace(/\.entry$/, "");
  const rawName = isFolderIndex(root, input) ? parent : stem;
  const name = kebabCase(rawName);
  validateName(name);
  const sidecar = await readSidecar(root, input);
  return withBrowserBundle(root, mergeEntry(name, input, {}, sidecar));
}

function publicEntry(
  root: string,
  input: string,
): { kind: "addon" | "project"; scriptPath?: string } | undefined {
  const relative = path.relative(root, input).split(path.sep).join("/");
  const match = /^src\/(addons|projects|entries)\/(.+)$/u.exec(relative);
  if (!match) return undefined;
  const kind = match[1] === "projects" ? "project" : "addon";
  const sourcePath = match[2]!;
  // Top-level files, including existing .entry files, retain configured/kebab-case output names.
  if (/^[^/]+\.(?:ts|tsx|js|mjs)$/u.test(sourcePath)) return { kind };
  // Nested entry markers preserve their paths, including index filenames.
  if (/\.entry\.(?:ts|tsx|js|mjs)$/u.test(sourcePath)) {
    return { kind, scriptPath: sourcePath.replace(/\.entry\.[^.]+$/u, ".js") };
  }
  // Keep the original one-folder index convention backward compatible.
  if (/^[^/]+\/index\.(?:ts|tsx|js|mjs)$/u.test(sourcePath)) return { kind };
  return undefined;
}

function withBrowserBundle(root: string, entry: AddonEntry): AddonEntry {
  const discovered = publicEntry(root, entry.input);
  const kind = entry.kind ?? discovered?.kind;
  if (!kind) return entry;
  return {
    ...entry,
    kind,
    bundle: entry.bundle ?? {
      input: path.relative(root, entry.input).split(path.sep).join("/"),
      scriptFile: `${kind === "project" ? "projects" : "addons"}/${discovered?.scriptPath ?? `${entry.name}.js`}`,
    },
  };
}

function assertUniqueNames(entries: readonly AddonEntry[]): void {
  const names = new Map<string, string>();
  for (const entry of entries) {
    if (names.has(entry.name))
      throw new Error(
        `Duplicate public entry name: ${entry.name}. ${names.get(entry.name)} and ${entry.input} must have unique names; rename an entry or set its name in devkit.config.json.`,
      );
    names.set(entry.name, entry.input);
  }
}

function isFolderIndex(root: string, input: string): boolean {
  return (
    path.parse(input).name === "index" ||
    /^src\/(?:addons|projects|entries)\/.+\/index\.entry\.[^.]+$/u.test(
      path.relative(root, input).split(path.sep).join("/"),
    )
  );
}

async function readSidecar(root: string, input: string): Promise<Partial<EntryConfig>> {
  const parsed = path.parse(input);
  const sidecarPath = isFolderIndex(root, input)
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
  if (metadata.kind !== undefined && metadata.kind !== "addon" && metadata.kind !== "project")
    throw new Error(`Invalid entry kind for ${name}. Expected addon or project.`);
  return {
    name,
    input,
    ...(metadata.kind ? { kind: metadata.kind } : {}),
    ...(metadata.version === undefined ? {} : { version: metadata.version }),
    description: metadata.description ?? `Reusable ${name} addon.`,
    placement: metadata.placement ?? "body-end",
    dependencies: metadata.dependencies ?? [],
    attributes: metadata.attributes ?? [],
    scriptAttributes: metadata.scriptAttributes ?? {},
    ...(metadata.defaultOptions === undefined ? {} : { defaultOptions: metadata.defaultOptions }),
    api: metadata.api ?? { entry: name },
    ...(metadata.usage ? { usage: metadata.usage } : {}),
    ...(metadata.attributeDetails ? { attributeDetails: metadata.attributeDetails } : {}),
    ...(metadata.definition ? { definition: metadata.definition } : {}),
    ...(metadata.bundle ? { bundle: metadata.bundle } : {}),
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
