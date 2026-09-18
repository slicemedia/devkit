import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { startDevServer } from "./dev.js";

it("serves project code but denies private sourcemaps and normal sensitive files", async () => {
  // Vite rejects Windows 8.3 paths; resolve the runner's temporary directory first.
  const root = await mkdtemp(path.join(await realpath(tmpdir()), "devkit-private-dev-"));
  await mkdir(path.join(root, ".slicemedia/sourcemaps"), { recursive: true });
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src/main.ts"), 'document.title = "example";');
  await writeFile(
    path.join(root, ".slicemedia/sourcemaps/project.js.map"),
    '{"sourcesContent":["private source"]}',
  );
  await writeFile(path.join(root, ".env"), "EXAMPLE=value");
  await mkdir(path.join(root, "src/vendors"));
  await mkdir(path.join(root, "src/addons/animations/counter"), { recursive: true });
  for (const source of ["shared-module.ts", "assets.ts"]) {
    await copyFile(
      path.resolve(import.meta.dirname, "../../core/src", source),
      path.join(root, "src/addons/animations/counter", source),
    );
  }
  await writeFile(
    path.join(root, "src/addons/animations/counter/index.entry.ts"),
    'export { resolveVendorAsset } from "./shared-module";',
  );
  await writeFile(
    path.join(root, "src/vendors/shared.ts"),
    'import "./shared.css"; document.title="shared-dependency";',
  );
  await writeFile(path.join(root, "src/vendors/shared.css"), "body{color:blue}");
  await writeFile(
    path.join(root, "devkit.config.json"),
    JSON.stringify({ vendors: [{ name: "shared", input: "src/vendors/shared.ts" }] }),
  );
  const server = await startDevServer({ root, port: 0, origins: ["https://testing.example.com"] });
  try {
    const url = server.resolvedUrls!.local[0]!;
    expect((await fetch(new URL("src/main.ts", url))).status).toBe(200);
    expect((await fetch(new URL("src/addons/animations/counter/index.entry.ts", url))).status).toBe(
      200,
    );
    const { resolveVendorAsset } = await server.ssrLoadModule(
      "/src/addons/animations/counter/index.entry.ts",
    );
    for (const modulePath of [
      "src/integrations/shared.ts",
      "src/addons/animations/counter/index.entry.ts",
    ]) {
      const resolved = resolveVendorAsset("shared.js", new URL(modulePath, url).href);
      expect(resolved).toBe(new URL("vendor/shared.js", url).href);
      expect((await fetch(resolved)).status).toBe(200);
    }
    expect((await fetch(new URL(".slicemedia/sourcemaps/project.js.map", url))).status).toBe(403);
    expect((await fetch(new URL(".env", url))).status).toBe(403);
    for (const file of ["src/main.ts", "src/vendor/shared.js", "vendor/shared.css"]) {
      const response = await fetch(new URL(file, url), {
        headers: { Origin: "https://testing.example.com" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://testing.example.com",
      );
      const blocked = await fetch(new URL(file, url), {
        headers: { Origin: "https://unapproved.example.com" },
      });
      expect(blocked.status).toBe(403);
      expect(blocked.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
    expect(await (await fetch(new URL("src/vendor/shared.js", url))).text()).toContain(
      "shared-dependency",
    );
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
