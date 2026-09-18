import { access, readFile } from "node:fs/promises";
import path from "node:path";

export interface VendorEntry {
  readonly name: string;
  readonly input: string;
  readonly kind: "vendor";
  readonly scriptFile: string;
  readonly cssFile: string;
}

/** Explicit vendor entries prevent helpers or unselected integrations becoming public assets. */
export async function readVendorEntries(root: string): Promise<readonly VendorEntry[]> {
  let config: { vendors?: unknown };
  try {
    config = JSON.parse(
      await readFile(path.join(root, "devkit.config.json"), "utf8"),
    ) as typeof config;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
  if (config.vendors === undefined) return [];
  if (!Array.isArray(config.vendors))
    throw new Error("devkit.config.json vendors must be an array.");
  const entries: VendorEntry[] = [];
  const names = new Set<string>();
  for (const value of config.vendors as unknown[]) {
    if (
      typeof value !== "object" ||
      value === null ||
      !("name" in value) ||
      !("input" in value) ||
      typeof value.name !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value.name) ||
      typeof value.input !== "string" ||
      !value.input.trim()
    ) {
      throw new Error("Each vendor requires a kebab-case name and source input.");
    }
    if (names.has(value.name)) throw new Error(`Duplicate vendor name: ${value.name}.`);
    names.add(value.name);
    const input = path.resolve(root, value.input);
    await access(input);
    entries.push({
      name: value.name,
      input,
      kind: "vendor",
      scriptFile: `vendor/${value.name}.js`,
      cssFile: `vendor/${value.name}.css`,
    });
  }
  return entries;
}
