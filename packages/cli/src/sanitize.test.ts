import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { forbiddenTermsFromEnvironment, sanitizeTree } from "./sanitize.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("sanitization", () => {
  it("takes literal private terms from the supplied environment value", () => {
    expect(forbiddenTermsFromEnvironment("First Client,second-client")).toEqual([
      "First Client",
      "second-client",
    ]);
    expect(forbiddenTermsFromEnvironment('["name with comma","another"]')).toEqual([
      "name with comma",
      "another",
    ]);
  });

  it("scans filenames, content, binary strings, and compressed archives", async () => {
    const root = await temporaryRoot();
    await writeFile(path.join(root, "private-marker.txt"), "neutral");
    await writeFile(path.join(root, "content.bin"), Buffer.from("before PRIVATE-MARKER after"));
    await writeFile(
      path.join(root, "payload.gz"),
      gzipSync(Buffer.from("compressed private-marker value")),
    );
    const syntheticSecret = "abcdefghijklmnop" + "qrstuvwxyz123456";
    await writeFile(path.join(root, "credentials.txt"), `api_key = "${syntheticSecret}"\n`);

    const result = await sanitizeTree({ root, forbiddenTerms: ["private-marker"] });

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "filename", rule: "forbidden-term:1" }),
        expect.objectContaining({ kind: "content", rule: "forbidden-term:1" }),
        expect.objectContaining({ kind: "archive-content", rule: "forbidden-term:1" }),
        expect.objectContaining({ rule: "generic-secret:assigned-value" }),
      ]),
    );
    expect(JSON.stringify(result.findings)).not.toContain("private-marker");
  });

  it("detects exact UTF-8 base64 and hex forms without disclosing private terms", async () => {
    const root = await temporaryRoot();
    const privateTerm = ["neutral", "encoded", "marker", "ä"].join("-");
    const bytes = Buffer.from(privateTerm, "utf8");
    const base64 = bytes.toString("base64");
    const hex = bytes.toString("hex").toUpperCase();
    await writeFile(path.join(root, "encoded-a.txt"), `before ${base64} after`);
    await writeFile(path.join(root, "encoded-b.txt"), `before ${hex} after`);

    const result = await sanitizeTree({ root, forbiddenTerms: [privateTerm] });

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        { kind: "content", path: "encoded-a.txt", rule: "forbidden-term:1" },
        { kind: "content", path: "encoded-b.txt", rule: "forbidden-term:1" },
      ]),
    );
    const serializedFindings = JSON.stringify(result.findings);
    expect(serializedFindings).not.toContain(privateTerm);
    expect(serializedFindings).not.toContain(base64);
    expect(serializedFindings).not.toContain(hex);
  });

  it("enforces exact brand casing while preserving supported identifiers", async () => {
    const root = await temporaryRoot();
    const compactBrand = ["slice", "media"].join("");
    const upperCaseBrand = compactBrand.toUpperCase();
    const unsupportedCompactCasings = Array.from({ length: 2 ** compactBrand.length }, (_, mask) =>
      [...compactBrand]
        .map((character, index) =>
          (mask & (1 << index)) === 0 ? character : character.toUpperCase(),
        )
        .join(""),
    ).filter((value) => value !== compactBrand && value !== upperCaseBrand);
    await writeFile(
      path.join(root, "unsupported-compact-casing.txt"),
      unsupportedCompactCasings.join("\n"),
    );
    await writeFile(
      path.join(root, "unsupported-separators.txt"),
      [
        ["slice", "media"].join("-"),
        ["SLICE", "MEDIA"].join("_"),
        ["slice", "media"].join(" "),
        ["SLICE", "MEDIA"].join(" "),
      ].join("\n"),
    );
    await writeFile(path.join(root, `${["Slice", "media"].join("")}.txt`), "filename coverage");
    await writeFile(
      path.join(root, "supported-conventions.txt"),
      [
        "Slice Media",
        ["Slice", "Media"].join("\n"),
        compactBrand,
        upperCaseBrand,
        "@slicemedia/devkit-core",
        "SLICEMEDIA_FORBIDDEN_TERMS",
        "slicemediaDevKit",
        "data-wft-example",
      ].join("\n"),
    );

    const result = await sanitizeTree({ root });

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "content",
          path: "unsupported-compact-casing.txt",
          rule: "brand-style:invalid",
        }),
        expect.objectContaining({
          kind: "content",
          path: "unsupported-separators.txt",
          rule: "brand-style:invalid",
        }),
        expect.objectContaining({ kind: "filename", rule: "brand-style:invalid" }),
      ]),
    );
    expect(result.findings.some((finding) => finding.path === "supported-conventions.txt")).toBe(
      false,
    );
  });

  it("always ignores node_modules and .git", async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, "node_modules"));
    await mkdir(path.join(root, ".git"));
    await writeFile(path.join(root, "node_modules", "private-marker.txt"), "private-marker");
    await writeFile(path.join(root, ".git", "private-marker.txt"), "private-marker");

    await expect(sanitizeTree({ root, forbiddenTerms: ["private-marker"] })).resolves.toMatchObject(
      {
        ok: true,
        scannedFiles: 0,
      },
    );
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "slicemedia-devkit-sanitize-test-"));
  temporaryDirectories.push(root);
  return root;
}
