import { createServer, type ViteDevServer } from "vite";

export interface DevServerOptions {
  readonly root: string;
  readonly host?: string;
  readonly port?: number;
}

export async function startDevServer(options: DevServerOptions): Promise<ViteDevServer> {
  const server = await createServer({
    root: options.root,
    logLevel: "silent",
    server: {
      host: options.host ?? "127.0.0.1",
      port: options.port ?? 5173,
      strictPort: true,
      cors: true,
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
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    },
  });
  await server.listen();
  return server;
}
