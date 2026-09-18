import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import { build as viteBuild, type InlineConfig, type Plugin } from "vite";

export type ViteBuild = (config: InlineConfig) => Promise<unknown>;

export interface BuildSiteBundleOptions {
  readonly root: string;
  readonly entry?: string;
  readonly outDir?: string;
  readonly scriptFileName?: string;
  readonly cssFileName?: string;
  /** Relative URL from this output's directory to the shared vendor directory. */
  readonly vendorDirectory?: string;
  /** Generate private JavaScript maps outside the deployable output directory. */
  readonly sourcemap?: boolean;
  /** Multi-entry builds clear their shared output once before invoking individual builds. */
  readonly emptyOutDir?: boolean;
  readonly build?: ViteBuild;
}

export interface BuildSiteBundleResult {
  readonly entryPath: string;
  readonly outDir: string;
  readonly scriptPath: string;
  readonly cssPath?: string;
  readonly sourceMapPaths?: readonly string[];
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
  const sourceMapPaths: string[] = [];
  const privateMaps = options.sourcemap
    ? await privateSourceMaps(root, outDir, sourceMapPaths)
    : undefined;
  await (options.build ?? viteBuild)(
    createBuildConfig({
      root,
      entryPath,
      outDir,
      scriptFileName,
      cssFileName,
      vendorDirectory: options.vendorDirectory ?? "./vendor/",
      privateMaps,
      emptyOutDir: options.emptyOutDir ?? true,
    }),
  );

  const scriptPath = path.join(outDir, scriptFileName);
  await assertFile(scriptPath, "Built script");
  const cssPath = path.join(outDir, cssFileName);

  return {
    entryPath,
    outDir,
    scriptPath,
    ...((await exists(cssPath)) ? { cssPath } : {}),
    ...(options.sourcemap ? { sourceMapPaths } : {}),
  };
}

interface BuildConfigInput {
  readonly root: string;
  readonly entryPath: string;
  readonly outDir: string;
  readonly scriptFileName: string;
  readonly cssFileName: string;
  readonly vendorDirectory: string;
  readonly privateMaps: Plugin | undefined;
  readonly emptyOutDir: boolean;
}

function createBuildConfig(input: BuildConfigInput): InlineConfig {
  return {
    root: input.root,
    configFile: false,
    publicDir: false,
    logLevel: "silent",
    // IIFEs have no native import.meta.url. Capture the executing entry URL once so asynchronous
    // loaders resolve vendor files from the CDN, never from the Webflow page URL.
    define: {
      "import.meta.url": "__slicemediaEntryUrl",
      __SLICEMEDIA_VENDOR_DIRECTORY__: JSON.stringify(input.vendorDirectory),
    },
    plugins: input.privateMaps ? [input.privateMaps] : [],
    build: {
      target: "es2018",
      outDir: input.outDir,
      emptyOutDir: input.emptyOutDir,
      minify: "oxc",
      sourcemap: input.privateMaps ? "hidden" : false,
      cssCodeSplit: false,
      // Webflow project bundles should not create an implicit asset-hosting contract.
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      rollupOptions: {
        input: input.entryPath,
        output: {
          format: "iife",
          intro:
            'const __slicemediaEntryUrl = typeof document === "undefined" ? "" : (document.currentScript ? document.currentScript.src : "");',
          entryFileNames: input.scriptFileName,
          assetFileNames: (asset) =>
            asset.name === "style.css" ? input.cssFileName : "assets/[name]-[hash][extname]",
        },
      },
    },
  };
}

async function privateSourceMaps(root: string, outDir: string, paths: string[]): Promise<Plugin> {
  const privateDir = path.join(root, ".slicemedia", "sourcemaps");
  const canonicalRoot = await realpath(root);
  const canonicalOutput = await resolveRealPath(outDir);
  const canonicalPrivate = path.join(canonicalRoot, ".slicemedia", "sourcemaps");
  if (contains(canonicalOutput, canonicalPrivate) || contains(canonicalPrivate, canonicalOutput)) {
    throw new Error("Deployable output and private sourcemaps must be separate directories.");
  }
  // Reject redirected private storage before creating anything or starting a build.
  for (const directory of [path.dirname(privateDir), privateDir]) {
    try {
      await mkdir(directory, { mode: 0o700 });
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error("Private sourcemap storage must use real directories, not symbolic links.");
    }
  }
  const ignore = path.join(privateDir, ".gitignore");
  try {
    await writeFile(ignore, "*\n", { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (!hasCode(error, "EEXIST")) throw error;
    const info = await lstat(ignore);
    if (!info.isFile() || info.isSymbolicLink() || (await readFile(ignore, "utf8")) !== "*\n") {
      throw new Error("Private sourcemaps require an intact local .gitignore containing '*'.", {
        cause: error,
      });
    }
  }
  return {
    name: "slicemedia-private-sourcemaps",
    enforce: "post",
    generateBundle: {
      order: "post",
      async handler(_options, bundle) {
        for (const [name, output] of Object.entries(bundle)) {
          if (output.type !== "chunk" || !output.map) continue;
          const source = JSON.stringify(output.map);
          const digest = createHash("sha256").update(output.code).digest("hex");
          const mapDigest = createHash("sha256").update(source).digest("hex");
          const target = path.join(privateDir, `${path.basename(name)}.${digest}.${mapDigest}.map`);
          try {
            await writeFile(target, source, { flag: "wx", mode: 0o600 });
          } catch (error) {
            if (!hasCode(error, "EEXIST")) throw error;
            const info = await lstat(target);
            if (
              !info.isFile() ||
              info.isSymbolicLink() ||
              (await readFile(target, "utf8")) !== source
            ) {
              throw new Error("Existing private sourcemap does not match this build.", {
                cause: error,
              });
            }
          }
          paths.push(target);
          output.map = null;
        }
        // Remove map assets before the bundler writes anything to the public directory.
        for (const name of Object.keys(bundle)) if (name.endsWith(".map")) delete bundle[name];
        if (paths.length === 0)
          throw new Error("The build did not produce a private JavaScript sourcemap.");
      },
    },
  };
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
    if (!hasCode(error, "ENOENT")) throw error;
    return path.join(await resolveRealPath(path.dirname(target)), path.basename(target));
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
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
