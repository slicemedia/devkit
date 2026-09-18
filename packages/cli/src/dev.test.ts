import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { startDevServer } from "./dev.js";

it("serves project code but denies private sourcemaps and normal sensitive files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "devkit-private-dev-"));
  await mkdir(path.join(root, ".slicemedia/sourcemaps"), { recursive: true });
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/main.ts"), 'document.title = "example";');
  await writeFile(
    path.join(root, ".slicemedia/sourcemaps/project.js.map"),
    '{"sourcesContent":["private source"]}',
  );
  await writeFile(path.join(root, ".env"), "EXAMPLE=value");
  const server = await startDevServer({ root, port: 0 });
  try {
    const url = server.resolvedUrls!.local[0]!;
    expect((await fetch(new URL("src/main.ts", url))).status).toBe(200);
    expect((await fetch(new URL(".slicemedia/sourcemaps/project.js.map", url))).status).toBe(403);
    expect((await fetch(new URL(".env", url))).status).toBe(403);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
