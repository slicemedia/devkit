import { access, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildSiteBundle, type ViteBuild } from "./build.js";
import { discoverAddonEntries } from "./discovery.js";
import type { AddonEntry } from "./types.js";
import { readVendorEntries } from "./vendors.js";

export interface BuildScriptsOptions {
  readonly root: string;
  readonly outDir?: string;
  readonly sourcemap?: boolean;
  readonly build?: ViteBuild;
}

export interface BuiltScript {
  readonly name: string;
  readonly kind: "addon" | "project" | "vendor";
  readonly input: string;
  readonly scriptFile: string;
  readonly cssFile?: string;
  readonly scriptPath: string;
  readonly cssPath?: string;
  readonly sourceMapPaths?: readonly string[];
}

export interface BuildScriptsResult {
  readonly outDir: string;
  readonly entries: readonly BuiltScript[];
  readonly vendors: readonly BuiltScript[];
  readonly manifestPath: string;
}

/** Each public browser entry is a standalone IIFE with its own optional stylesheet. */
export async function buildScripts(options: BuildScriptsOptions): Promise<BuildScriptsResult> {
  const root = path.resolve(options.root);
  const outDir = path.resolve(root, options.outDir ?? "dist");
  const entries = (await discoverAddonEntries(root)).filter((entry) => entry.bundle);
  const outputs = new Set<string>(["webflow-scripts.json"]);
  const planned = [
    ...(await readVendorEntries(root)),
    ...entries.map((entry) => planEntry(root, entry)),
  ];
  for (const entry of planned) {
    for (const output of [entry.scriptFile, entry.cssFile]) {
      const normalized = output.toLowerCase();
      if (
        [...outputs].some(
          (existing) =>
            existing === normalized ||
            existing.startsWith(`${normalized}/`) ||
            normalized.startsWith(`${existing}/`),
        )
      )
        throw new Error(`Duplicate build output: ${output}.`);
      outputs.add(output.toLowerCase());
    }
    await access(entry.input);
  }
  // Validate the complete plan before clearing output. Never erase source or private artifacts.
  const canonicalOutput = await resolveRealPath(outDir);
  const protectedPaths = [
    root,
    path.join(root, "src"),
    path.join(root, ".slicemedia"),
    path.join(root, "node_modules"),
    ...planned.map((entry) => entry.input),
  ];
  for (const target of protectedPaths) {
    const canonicalTarget = await resolveRealPath(target);
    if (
      contains(canonicalOutput, canonicalTarget) ||
      (target !== root && contains(canonicalTarget, canonicalOutput))
    ) {
      throw new Error(
        "Build output must be separate from project source, dependencies, and private storage.",
      );
    }
  }
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const built: BuiltScript[] = [];
  for (const entry of planned) {
    const result = await buildSiteBundle({
      root,
      entry: entry.input,
      outDir: path.join(outDir, path.posix.dirname(entry.scriptFile)),
      scriptFileName: path.posix.basename(entry.scriptFile),
      cssFileName: path.posix.basename(entry.cssFile),
      vendorDirectory: `${path.posix.relative(path.posix.dirname(entry.scriptFile), "vendor") || "."}/`,
      emptyOutDir: false,
      ...(options.sourcemap === undefined ? {} : { sourcemap: options.sourcemap }),
      ...(options.build ? { build: options.build } : {}),
    });
    built.push({
      name: entry.name,
      kind: entry.kind,
      input: path.relative(root, entry.input).split(path.sep).join("/"),
      scriptFile: entry.scriptFile,
      scriptPath: result.scriptPath,
      ...(result.cssPath ? { cssFile: entry.cssFile, cssPath: result.cssPath } : {}),
      ...(result.sourceMapPaths ? { sourceMapPaths: result.sourceMapPaths } : {}),
    });
  }
  const manifestPath = path.join(outDir, "webflow-scripts.json");
  const scripts = built.filter((entry) => entry.kind !== "vendor");
  const vendors = built.filter((entry) => entry.kind === "vendor");
  const manifestEntry = ({ name, kind, input, scriptFile, cssFile }: BuiltScript) => ({
    name,
    kind,
    input,
    bundle: { input, scriptFile, ...(cssFile ? { cssFile } : {}) },
  });
  // Public manifest contains public paths only; never private map locations or source contents.
  await writeFile(
    manifestPath,
    `${JSON.stringify({ schemaVersion: 1, entries: scripts.map(manifestEntry), vendors: vendors.map(manifestEntry) }, null, 2)}\n`,
  );
  return { outDir, entries: scripts, vendors, manifestPath };
}

function planEntry(root: string, entry: AddonEntry) {
  const bundle = entry.bundle!;
  const scriptFile = outputPath(bundle.scriptFile, ".js");
  const cssFile = outputPath(bundle.cssFile ?? scriptFile.replace(/\.js$/u, ".css"), ".css");
  if (path.posix.dirname(scriptFile) !== path.posix.dirname(cssFile)) {
    throw new Error(`Script and stylesheet must share an output directory: ${entry.name}.`);
  }
  return {
    name: entry.name,
    kind: entry.kind ?? "addon",
    input: path.resolve(root, bundle.input),
    scriptFile,
    cssFile,
  };
}

function outputPath(value: string, extension: string): string {
  if (
    !value.endsWith(extension) ||
    value.split("/").some((part) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(part)) ||
    value.includes("\\") ||
    path.isAbsolute(value)
  ) {
    throw new Error(
      `Build output must be a relative ${extension} path without traversal: ${value}.`,
    );
  }
  return value;
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

async function resolveRealPath(target: string): Promise<string> {
  try {
    return await realpath(target);
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
    return path.join(await resolveRealPath(path.dirname(target)), path.basename(target));
  }
}
