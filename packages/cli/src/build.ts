import { access } from "node:fs/promises";
import path from "node:path";

import { build as viteBuild, type InlineConfig } from "vite";

export type ViteBuild = (config: InlineConfig) => Promise<unknown>;

export interface BuildSiteBundleOptions {
  readonly root: string;
  readonly entry?: string;
  readonly outDir?: string;
  readonly scriptFileName?: string;
  readonly cssFileName?: string;
  readonly build?: ViteBuild;
}

export interface BuildSiteBundleResult {
  readonly entryPath: string;
  readonly outDir: string;
  readonly scriptPath: string;
  readonly cssPath?: string;
}

/** Build one project-owned browser bundle without making any hosting assumptions. */
export async function buildSiteBundle(
  options: BuildSiteBundleOptions,
): Promise<BuildSiteBundleResult> {
  const root = path.resolve(options.root);
  const entryPath = path.resolve(root, options.entry ?? "src/main.ts");
  const outDir = path.resolve(root, options.outDir ?? "dist");
  const scriptFileName = validateOutputFileName(
    options.scriptFileName ?? "project.js",
    ".js",
    "scriptFileName",
  );
  const cssFileName = validateOutputFileName(
    options.cssFileName ?? "project.css",
    ".css",
    "cssFileName",
  );

  await assertFile(entryPath, "Project entry");
  await (options.build ?? viteBuild)(
    createBuildConfig({ root, entryPath, outDir, scriptFileName, cssFileName }),
  );

  const scriptPath = path.join(outDir, scriptFileName);
  await assertFile(scriptPath, "Built script");
  const cssPath = path.join(outDir, cssFileName);

  return {
    entryPath,
    outDir,
    scriptPath,
    ...((await exists(cssPath)) ? { cssPath } : {}),
  };
}

interface BuildConfigInput {
  readonly root: string;
  readonly entryPath: string;
  readonly outDir: string;
  readonly scriptFileName: string;
  readonly cssFileName: string;
}

function createBuildConfig(input: BuildConfigInput): InlineConfig {
  return {
    root: input.root,
    configFile: false,
    logLevel: "silent",
    build: {
      target: "es2018",
      outDir: input.outDir,
      emptyOutDir: true,
      minify: "oxc",
      sourcemap: false,
      cssCodeSplit: false,
      // Webflow project bundles should not create an implicit asset-hosting contract.
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      rollupOptions: {
        input: input.entryPath,
        output: {
          format: "iife",
          entryFileNames: input.scriptFileName,
          assetFileNames: (asset) =>
            asset.name === "style.css" ? input.cssFileName : "assets/[name]-[hash][extname]",
        },
      },
    },
  };
}

function validateOutputFileName(value: string, extension: string, field: string): string {
  if (
    value.trim() === "" ||
    value !== path.basename(value) ||
    !value.toLowerCase().endsWith(extension)
  ) {
    throw new Error(`${field} must be a plain ${extension} file name.`);
  }
  return value;
}

async function assertFile(target: string, label: string): Promise<void> {
  try {
    await access(target);
  } catch (error) {
    throw new Error(`${label} does not exist: ${target}`, { cause: error });
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
