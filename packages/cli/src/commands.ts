import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ViteDevServer } from "vite";

import { getIntegerOption, getOption, getOptions, hasFlag, parseArgs } from "./args.js";
import { buildSiteBundle, type BuildSiteBundleOptions } from "./build.js";
import { buildScripts } from "./scripts-build.js";
import { startDevServer, type DevServerOptions } from "./dev.js";
import { discoverAddonEntries } from "./discovery.js";
import {
  documentEntry,
  renderCatalog,
  renderSetupGuide,
  type DocumentationOptions,
} from "./documentation.js";
import { consoleWriter, writeResult, type OutputWriter } from "./output.js";
import { forbiddenTermsFromEnvironment, sanitizeTree } from "./sanitize.js";
import type { AddonEntry, CommandResult, ProjectBundle } from "./types.js";
import { WebflowClient, webflowOAuthTokenFromEnvironment } from "./webflow/client.js";
import { scanApiScripts, scanRenderedScripts } from "./webflow/scan.js";

export interface CliDependencies {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly writer?: OutputWriter;
  readonly fetch?: typeof fetch;
  readonly createClient?: () => WebflowClient;
  readonly createScriptInspectionClient?: () => WebflowClient;
  readonly buildBundle?: (options: BuildSiteBundleOptions) => ReturnType<typeof buildSiteBundle>;
  readonly startDev?: (options: DevServerOptions) => Promise<Pick<ViteDevServer, "resolvedUrls">>;
}

export async function runCli(
  argv: readonly string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const args = parseArgs(argv);
  const json = hasFlag(args, "json");
  const writer = dependencies.writer ?? consoleWriter;
  const cwd = path.resolve(dependencies.cwd ?? process.cwd());
  const env = dependencies.env ?? process.env;

  try {
    const result = await dispatch(args.positionals, args, {
      cwd,
      env,
      fetch: dependencies.fetch ?? fetch,
      createClient:
        dependencies.createClient ??
        (() => new WebflowClient({ fetch: dependencies.fetch ?? fetch, token: tokenFromEnv(env) })),
      createScriptInspectionClient:
        dependencies.createScriptInspectionClient ??
        dependencies.createClient ??
        (() =>
          new WebflowClient({
            fetch: dependencies.fetch ?? fetch,
            token: webflowOAuthTokenFromEnvironment(env),
          })),
      buildBundle: dependencies.buildBundle ?? buildSiteBundle,
      startDev: dependencies.startDev ?? startDevServer,
    });
    writeResult(result, json, writer);
    return result.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: CommandResult<{ readonly error: string }> = {
      ok: false,
      command: args.positionals.join(" ") || "help",
      summary: message,
      data: { error: message },
    };
    if (json) writeResult(result, true, writer);
    else writer.error(`[ERROR] ${message}`);
    return 1;
  }
}

interface DispatchContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly fetch: typeof fetch;
  readonly createClient: () => WebflowClient;
  readonly createScriptInspectionClient: () => WebflowClient;
  readonly buildBundle: (options: BuildSiteBundleOptions) => ReturnType<typeof buildSiteBundle>;
  readonly startDev: (options: DevServerOptions) => Promise<Pick<ViteDevServer, "resolvedUrls">>;
}

async function dispatch(
  positionals: readonly string[],
  args: ReturnType<typeof parseArgs>,
  context: DispatchContext,
): Promise<CommandResult> {
  const command = positionals[0] ?? "help";
  if (command === "help" || command === "--help") return helpResult();
  if (command === "doctor") return runDoctor(context.cwd, context.env);
  if (command === "sanitize") return runSanitize(args, context);
  if (command === "catalog") return runCatalog(args, context.cwd);
  if (command === "explain") return runExplain(positionals[1], args, context.cwd);
  if (command === "build") return runBuild(args, context);
  if (command === "dev") return runDev(args, context);
  if (command === "webflow") return runWebflow(positionals.slice(1), args, context);
  throw new Error(`Unknown command ${JSON.stringify(command)}. Run slicemedia-devkit help.`);
}

function helpResult(): CommandResult<readonly string[]> {
  return {
    ok: true,
    command: "help",
    summary: "Slice Media DevKit CLI commands",
    data: [
      "doctor",
      "sanitize [--git-history]",
      "catalog [--out docs/addons.md] [--manifest dist/webflow-scripts.json] [--public-base-url <url>]",
      "explain <addon> [--out docs/setup.md] [--public-base-url <url>] [--dev-url <url>] [--hmr=false]",
      "build [--out-dir dist] [--sourcemap] — build public addon/project entries and declared shared vendors",
      "build --entry <file> [--out-dir dist] [--script-file <name.js>] [--css-file <name.css>] [--sourcemap] — explicit single entry",
      "dev [--host 127.0.0.1] [--port 5173] [--origin <testing-page-origin>] (repeat --origin for multiple origins)",
      "webflow components --site <id>",
      "webflow scan (--site <id> | --url <url>)",
    ],
  };
}

async function runDoctor(root: string, env: NodeJS.ProcessEnv): Promise<CommandResult> {
  const checks: Array<{ name: string; status: "pass" | "warn" | "fail"; detail: string }> = [];
  const supportedNode = isSupportedNodeVersion(process.versions.node);
  checks.push({
    name: "node",
    status: supportedNode ? "pass" : "fail",
    detail: supportedNode
      ? `Node ${process.versions.node}`
      : `Expected Node 22.13+ or Node 24; found ${process.versions.node}`,
  });
  checks.push({
    name: "package",
    status: (await exists(path.join(root, "package.json"))) ? "pass" : "fail",
    detail: path.join(root, "package.json"),
  });
  checks.push({
    name: "browser-entries",
    status:
      (await exists(path.join(root, "src/addons"))) ||
      (await exists(path.join(root, "src/projects"))) ||
      (await exists(path.join(root, "devkit.config.json")))
        ? "pass"
        : "warn",
    detail: "Public entries in src/addons/, src/projects/, or devkit.config.json",
  });
  checks.push({
    name: "webflow-auth",
    status: hasToken(env) ? "pass" : "warn",
    detail: hasToken(env) ? "Configured" : "Not configured; required only for API commands",
  });
  try {
    const entries = await discoverAddonEntries(root);
    const missing = entries.filter(
      (entry) => entry.kind !== "project" && !entry.structure && entry.scope !== "global",
    );
    checks.push({
      name: "inspection-contracts",
      status: missing.length ? "warn" : "pass",
      detail: missing.length
        ? `No component structure or global scope declared: ${missing.map((entry) => entry.name).join(", ")}. Add inert definition metadata for DevTools and explain/catalog.`
        : "Discovered addons declare component structure or global scope.",
    });
  } catch (error) {
    checks.push({
      name: "inspection-contracts",
      status: "warn",
      detail: `Cannot read inspection metadata: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  const ok = !checks.some((check) => check.status === "fail");
  return {
    ok,
    command: "doctor",
    summary: ok ? "Environment is ready." : "Environment checks failed.",
    data: checks,
  };
}

export function isSupportedNodeVersion(version: string): boolean {
  const [major = 0, minor = 0] = version
    .split(".")
    .slice(0, 2)
    .map((part) => Number.parseInt(part, 10));
  return (major === 22 && minor >= 13) || major === 24;
}

async function runSanitize(
  args: ReturnType<typeof parseArgs>,
  context: DispatchContext,
): Promise<CommandResult> {
  const root = path.resolve(context.cwd, getOption(args, "root") ?? ".");
  const result = await sanitizeTree({
    root,
    forbiddenTerms: forbiddenTermsFromEnvironment(context.env.SLICEMEDIA_FORBIDDEN_TERMS),
    includeGitHistory: hasFlag(args, "git-history"),
    additionalIgnores: getOptions(args, "ignore"),
  });
  return {
    ok: result.ok,
    command: "sanitize",
    summary: result.ok
      ? `Sanitization passed across ${result.scannedFiles} files.`
      : `Sanitization found ${result.findings.length} issue(s).`,
    data: result.findings,
  };
}

async function runCatalog(args: ReturnType<typeof parseArgs>, cwd: string): Promise<CommandResult> {
  const root = path.resolve(cwd, getOption(args, "root") ?? ".");
  const entries = await discoverAddonEntries(root);
  const withArtifacts = await Promise.all(
    entries.map((entry) => withBuiltStylesheet(root, entry, args)),
  );
  const documented = withArtifacts.map((entry) =>
    documentEntry(
      { ...entry, input: normalizeRelative(root, entry.input) },
      documentationOptions(args),
    ),
  );
  const text = renderCatalog(documented);
  const output = getOption(args, "out");
  if (output) await writeDocument(root, output, text);
  const manifest = getOption(args, "manifest");
  if (manifest) {
    const existing = await readManifest(path.resolve(root, manifest));
    // Enrich an existing build manifest without replacing its exact file list or vendor entries.
    const manifestEntries = existing
      ? existing.entries.map((built) => {
          const entry = documented.find((entry) => entry.name === built.name);
          if (
            !entry ||
            entry.bundle?.input !== built.bundle?.input ||
            entry.bundle?.scriptFile !== built.bundle?.scriptFile
          )
            return built;
          return { ...built, ...entry, bundle: built.bundle };
        })
      : documented;
    await writeDocument(
      root,
      manifest,
      `${JSON.stringify({ ...existing, schemaVersion: 1, entries: manifestEntries }, null, 2)}\n`,
    );
  }
  return {
    ok: true,
    command: "catalog",
    summary: `Discovered ${entries.length} addon(s).`,
    data: documented,
    text,
  };
}

async function runExplain(
  name: string | undefined,
  args: ReturnType<typeof parseArgs>,
  cwd: string,
): Promise<CommandResult> {
  if (name === undefined) throw new Error("Usage: slicemedia-devkit explain <addon>.");
  const root = path.resolve(cwd, getOption(args, "root") ?? ".");
  const entry = (await discoverAddonEntries(root)).find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`Unknown addon ${JSON.stringify(name)}.`);
  const documented = documentEntry(
    {
      ...(await withBuiltStylesheet(root, entry, args)),
      input: normalizeRelative(root, entry.input),
    },
    documentationOptions(args),
  );
  const text = renderSetupGuide(documented);
  const output = getOption(args, "out");
  if (output) await writeDocument(root, output, text);
  return {
    ok: true,
    command: "explain",
    summary: `${entry.name}: ${entry.description}`,
    data: documented,
    text,
  };
}

interface BuildManifest {
  readonly schemaVersion: number;
  readonly entries: readonly { readonly name: string; readonly bundle?: ProjectBundle }[];
  readonly vendors?: readonly unknown[];
}

async function readManifest(file: string): Promise<BuildManifest | undefined> {
  try {
    const value = JSON.parse(await readFile(file, "utf8")) as BuildManifest;
    if (value.schemaVersion !== 1 || !Array.isArray(value.entries))
      throw new Error(`Invalid script manifest: ${file}`);
    return value;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}

async function withBuiltStylesheet(
  root: string,
  entry: AddonEntry,
  args: ReturnType<typeof parseArgs>,
): Promise<AddonEntry> {
  if (!entry.bundle) return entry;
  const outDir = path.resolve(root, getOption(args, "out-dir") ?? "dist");
  const manifest = await readManifest(path.join(outDir, "webflow-scripts.json"));
  const built = manifest?.entries.find((candidate) => candidate.name === entry.name)?.bundle;
  const planned = { input: entry.bundle.input, scriptFile: entry.bundle.scriptFile };
  const cssFile = built?.cssFile;
  // Build output, not a naming convention or configured candidate, determines whether CSS exists.
  if (
    built?.input === planned.input &&
    built.scriptFile === planned.scriptFile &&
    cssFile &&
    (await exists(path.join(outDir, built.scriptFile))) &&
    (await exists(path.join(outDir, cssFile)))
  ) {
    return { ...entry, bundle: { ...planned, cssFile } };
  }
  return { ...entry, bundle: planned };
}

function documentationOptions(args: ReturnType<typeof parseArgs>): DocumentationOptions {
  const devUrl = getOption(args, "dev-url");
  const publicBaseUrl = getOption(args, "public-base-url");
  const input = getOption(args, "entry");
  const scriptFile = getOption(args, "script-file");
  const cssFile = getOption(args, "css-file");
  return {
    ...(devUrl ? { devUrl } : {}),
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
    ...(args.options.has("hmr") ? { hmr: hasFlag(args, "hmr") } : {}),
    ...(input || scriptFile || cssFile
      ? {
          bundle: {
            input: input ?? "src/main.ts",
            scriptFile: scriptFile ?? "project.js",
            ...(cssFile ? { cssFile } : {}),
          },
        }
      : {}),
  };
}

async function writeDocument(root: string, output: string, contents: string): Promise<void> {
  const target = path.resolve(root, output);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function runBuild(
  args: ReturnType<typeof parseArgs>,
  context: DispatchContext,
): Promise<CommandResult> {
  const root = path.resolve(context.cwd, getOption(args, "root") ?? ".");
  const entry = getOption(args, "entry");
  const outDir = getOption(args, "out-dir");
  const scriptFileName = getOption(args, "script-file");
  const cssFileName = getOption(args, "css-file");
  if (!entry) {
    if (scriptFileName || cssFileName)
      throw new Error(
        "--script-file and --css-file require an explicit --entry. Use per-entry bundle paths for multiple scripts.",
      );
    const result = await buildScripts({
      root,
      ...(outDir ? { outDir } : {}),
      ...(hasFlag(args, "sourcemap") ? { sourcemap: true } : {}),
    });
    const maps = [...result.entries, ...result.vendors].flatMap(
      (script) => script.sourceMapPaths ?? [],
    );
    return {
      ok: true,
      command: "build",
      summary: `Built ${result.entries.length} standalone script(s) and ${result.vendors.length} shared vendor(s).${maps.length ? ` Private sourcemaps: ${maps.join(", ")}` : ""}`,
      data: result,
    };
  }
  const buildOptions: BuildSiteBundleOptions = {
    root,
    ...(entry === undefined ? {} : { entry }),
    ...(outDir === undefined ? {} : { outDir }),
    ...(scriptFileName === undefined ? {} : { scriptFileName }),
    ...(cssFileName === undefined ? {} : { cssFileName }),
    ...(hasFlag(args, "sourcemap") ? { sourcemap: true } : {}),
  };
  const result = await context.buildBundle(buildOptions);
  const files = [result.scriptPath, ...(result.cssPath === undefined ? [] : [result.cssPath])];
  return {
    ok: true,
    command: "build",
    summary: `Built ${files.length === 1 ? "one standalone script" : "one standalone script and CSS"}.${result.sourceMapPaths?.length ? ` Private sourcemaps: ${result.sourceMapPaths.join(", ")}` : ""}`,
    data: result,
  };
}

async function runDev(
  args: ReturnType<typeof parseArgs>,
  context: DispatchContext,
): Promise<CommandResult> {
  const root = path.resolve(context.cwd, getOption(args, "root") ?? ".");
  const host = getOption(args, "host");
  const server = await context.startDev({
    root,
    ...(host === undefined ? {} : { host }),
    port: getIntegerOption(args, "port", 5173),
    origins: getOptions(args, "origin"),
  });
  const firstUrl = server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0];
  return {
    ok: true,
    command: "dev",
    summary: `CORS-enabled Vite development server started${firstUrl === undefined ? "." : ` at ${firstUrl}`}`,
    data: { urls: server.resolvedUrls },
  };
}

async function runWebflow(
  positionals: readonly string[],
  args: ReturnType<typeof parseArgs>,
  context: DispatchContext,
): Promise<CommandResult> {
  const command = positionals[0];
  if (command === "components") {
    const siteId = requireSiteId(args, context.env);
    const componentId = getOption(args, "component");
    if (componentId !== undefined) {
      const properties = await context.createClient().listComponentProperties(siteId, componentId);
      return {
        ok: true,
        command: "webflow components",
        summary: `Found ${properties.length} component ${properties.length === 1 ? "property" : "properties"}.`,
        data: properties,
      };
    }
    const components = await context.createClient().listComponents(siteId);
    return {
      ok: true,
      command: "webflow components",
      summary: `Found ${components.length} component(s).`,
      data: components,
    };
  }
  if (command === "scan") {
    const pageUrl = getOption(args, "url");
    if (pageUrl !== undefined) {
      const scripts = await scanRenderedScripts(pageUrl, context.fetch);
      return {
        ok: true,
        command: "webflow scan",
        summary: `Found ${scripts.length} rendered script tag(s).`,
        data: scripts,
      };
    }
    const siteId = requireSiteId(args, context.env);
    const scan = await scanApiScripts(context.createScriptInspectionClient(), siteId);
    return {
      ok: true,
      command: "webflow scan",
      summary: `Found ${scan.registered.length} registered and ${scan.applied.length} applied script(s).`,
      data: scan,
    };
  }
  throw new Error("Usage: slicemedia-devkit webflow <components|scan>.");
}

function requireSiteId(args: ReturnType<typeof parseArgs>, env: NodeJS.ProcessEnv): string {
  const siteId = getOption(args, "site") ?? env.SLICEMEDIA_WEBFLOW_SITE_ID ?? env.WEBFLOW_SITE_ID;
  if (siteId === undefined || siteId.trim() === "") {
    throw new Error("Provide --site or set SLICEMEDIA_WEBFLOW_SITE_ID.");
  }
  return siteId;
}

function tokenFromEnv(env: NodeJS.ProcessEnv): string {
  const token = env.WEBFLOW_OAUTH_ACCESS_TOKEN ?? env.WEBFLOW_OAUTH_TOKEN ?? env.WEBFLOW_API_TOKEN;
  if (token === undefined || token.trim() === "") {
    throw new Error("Set WEBFLOW_OAUTH_ACCESS_TOKEN or WEBFLOW_API_TOKEN.");
  }
  return token;
}

function hasToken(env: NodeJS.ProcessEnv): boolean {
  try {
    tokenFromEnv(env);
    return true;
  } catch {
    return false;
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function normalizeRelative(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}
