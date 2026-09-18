import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { buildSiteBundle } from "./build.js";
import { readVendorEntries } from "./vendors.js";

export interface DevServerOptions {
  readonly root: string;
  readonly host?: string;
  readonly port?: number;
  /** Exact testing-page origins. Local loopback origins are allowed by default. */
  readonly origins?: readonly string[];
}

export async function startDevServer(options: DevServerOptions): Promise<ViteDevServer> {
  const origins = (options.origins ?? []).map(validateOrigin);
  const localOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/u;
  const vendorFiles = await prepareDevVendors(options.root);
  const vendorPlugin: Plugin = {
    name: "slicemedia-dev-vendors",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const origin = request.headers.origin;
        if (origin && !localOrigin.test(origin) && !origins.includes(origin)) {
          response.statusCode = 403;
          response.end("Testing origin is not allowed. Start DevKit with --origin <page-origin>.");
          return;
        }
        const url = new URL(request.url ?? "/", "http://localhost");
        const file = vendorFiles.get(url.pathname);
        if (!file) {
          next();
          return;
        }
        if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader(
          "Content-Type",
          url.pathname.endsWith(".css") ? "text/css" : "text/javascript",
        );
        response.end(file);
      });
    },
  };
  const server = await createServer({
    root: options.root,
    logLevel: "silent",
    plugins: [vendorPlugin],
    server: {
      host: options.host ?? "127.0.0.1",
      port: options.port ?? 5173,
      strictPort: true,
      cors: { origin: [localOrigin, ...origins] },
      fs: {
        // Preserve Vite's sensitive-file defaults and keep private build maps off the dev server.
        deny: [
          ".env",
          ".env.*",
          "*.{crt,pem,key,p12,pfx,cer,der}",
          ".npmrc",
          ".yarnrc.yml",
          "**/.git/**",
          "**/.slicemedia/sourcemaps/**",
        ],
      },
      headers: {
        "Cache-Control": "no-store",
      },
    },
  });
  await server.listen();
  return server;
}

function validateOrigin(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hostname.includes("*") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Development origins must be exact HTTP(S) origins without paths, credentials, queries, or wildcards.",
    );
  }
  return url.origin;
}

async function prepareDevVendors(root: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const vendors = await readVendorEntries(root);
  if (!vendors.length) return files;
  const outDir = await mkdtemp(path.join(tmpdir(), "devkit-vendors-"));
  try {
    for (const vendor of vendors) {
      const result = await buildSiteBundle({
        root,
        entry: vendor.input,
        outDir,
        scriptFileName: `${vendor.name}.js`,
        cssFileName: `${vendor.name}.css`,
        emptyOutDir: false,
      });
      for (const file of [result.scriptPath, result.cssPath]) {
        if (file) {
          const source = await readFile(file);
          files.set(`/src/vendor/${path.basename(file)}`, source);
          files.set(`/vendor/${path.basename(file)}`, source);
        }
      }
    }
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
  return files;
}
