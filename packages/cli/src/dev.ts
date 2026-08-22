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
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    },
  });
  await server.listen();
  return server;
}
