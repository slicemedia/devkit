import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const output = resolve(dirname(fileURLToPath(import.meta.url)), "template");
const source = resolve(dirname(fileURLToPath(import.meta.url)), "../../../templates/starter");

async function copy(sourceDirectory: string, outputDirectory: string): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    if (["node_modules", "dist", ".slicemedia"].includes(entry.name)) continue;
    const from = join(sourceDirectory, entry.name);
    const packagedName =
      entry.name === ".gitignore"
        ? "gitignore.template"
        : entry.name === ".npmrc"
          ? "npmrc.template"
          : entry.name;
    const to = join(outputDirectory, packagedName);
    if (entry.isDirectory()) await copy(from, to);
    else await cp(from, to);
  }
}

await rm(output, { recursive: true, force: true });
await copy(source, output);
