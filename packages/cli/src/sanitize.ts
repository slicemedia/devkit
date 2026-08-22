import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";

export type SanitizeFindingKind =
  "filename" | "content" | "archive-filename" | "archive-content" | "git-history" | "unscanned";

export interface SanitizeFinding {
  readonly kind: SanitizeFindingKind;
  readonly path: string;
  readonly rule: string;
}

export interface SanitizeOptions {
  readonly root: string;
  readonly forbiddenTerms?: readonly string[];
  readonly includeGitHistory?: boolean;
  readonly additionalIgnores?: readonly string[];
  readonly maxFileBytes?: number;
  readonly maxArchiveEntryBytes?: number;
}

export interface SanitizeResult {
  readonly ok: boolean;
  readonly scannedFiles: number;
  readonly findings: readonly SanitizeFinding[];
}

interface ContentRule {
  readonly name: string;
  readonly expression: RegExp;
  readonly isAllowedMatch?: (value: string) => boolean;
}

interface ArchiveEntry {
  readonly name: string;
  readonly contents?: Buffer;
  readonly issue?: string;
}

const builtInIgnores = new Set(["node_modules", ".git"]);
const defaultMaxFileBytes = 32 * 1024 * 1024;
const defaultMaxArchiveEntryBytes = 24 * 1024 * 1024;
const maxArchiveEntries = 10_000;
const brandWords = ["slice", "media"] as const;
const lowerCaseBrandIdentifier = brandWords.join("");
const upperCaseBrandIdentifier = lowerCaseBrandIdentifier.toUpperCase();
const titleCaseBrandWords = ["Slice", "Media"] as const;

const brandNamingRules: readonly ContentRule[] = [
  {
    name: "brand-style:invalid",
    expression: new RegExp([brandWords[0], String.raw`[\s_-]*`, brandWords[1]].join(""), "gi"),
    isAllowedMatch: isAllowedBrandMatch,
  },
];

const secretRules: readonly ContentRule[] = [
  {
    name: "generic-secret:private-key",
    expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: "generic-secret:github-token",
    expression: /\bgh[pousr]_[A-Za-z0-9]{30,255}\b/g,
  },
  {
    name: "generic-secret:aws-access-key",
    expression: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    name: "generic-secret:assigned-value",
    expression:
      /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|private[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{20,}["']/gi,
  },
  {
    name: "generic-secret:bearer-token",
    expression: /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}\b/gi,
  },
];

export async function sanitizeTree(options: SanitizeOptions): Promise<SanitizeResult> {
  const root = path.resolve(options.root);
  const forbiddenTerms = normalizeForbiddenTerms(options.forbiddenTerms ?? []);
  const ignores = new Set([...builtInIgnores, ...(options.additionalIgnores ?? [])]);
  const maxFileBytes = options.maxFileBytes ?? defaultMaxFileBytes;
  const maxArchiveEntryBytes = options.maxArchiveEntryBytes ?? defaultMaxArchiveEntryBytes;
  const files = await collectFiles(root, root, ignores);
  const findings: SanitizeFinding[] = [];

  for (const file of files) {
    const relative = normalizePath(path.relative(root, file));
    findings.push(...scanName(relative, forbiddenTerms, "filename", relative));
    const stat = await lstat(file);
    if (stat.size > maxFileBytes) {
      findings.push({ kind: "unscanned", path: relative, rule: "file-size-limit" });
      continue;
    }

    const contents = await readFile(file);
    findings.push(...scanContents(contents, forbiddenTerms, "content", relative));
    findings.push(...scanArchive(relative, contents, forbiddenTerms, maxArchiveEntryBytes, 0));
  }

  if (options.includeGitHistory === true) {
    findings.push(...scanGitHistory(root, forbiddenTerms));
  }

  const safeFindings = findings.map((finding) => ({
    ...finding,
    path: forbiddenTerms.some((term) => containsPrivateTerm(finding.path, term))
      ? "[redacted-private-path]"
      : finding.path,
  }));
  const unique = deduplicateFindings(safeFindings);
  return { ok: unique.length === 0, scannedFiles: files.length, findings: unique };
}

export function forbiddenTermsFromEnvironment(
  value: string | undefined = process.env.SLICEMEDIA_FORBIDDEN_TERMS,
): readonly string[] {
  if (value === undefined || value.trim() === "") return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error("SLICEMEDIA_FORBIDDEN_TERMS JSON must be an array of strings.");
    }
    return normalizeForbiddenTerms(parsed);
  }
  return normalizeForbiddenTerms(trimmed.split(/[\n,]/u));
}

function normalizeForbiddenTerms(terms: readonly string[]): readonly string[] {
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}

async function collectFiles(
  root: string,
  directory: string,
  ignores: ReadonlySet<string>,
): Promise<readonly string[]> {
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  const collected = await Promise.all(
    directoryEntries.map(async (entry) => {
      if (ignores.has(entry.name)) return [];
      const target = path.join(directory, entry.name);
      const relativeSegments = path.relative(root, target).split(path.sep);
      if (relativeSegments.some((segment) => ignores.has(segment))) return [];
      if (entry.isDirectory()) return collectFiles(root, target, ignores);
      if (entry.isFile()) return [target];
      return [];
    }),
  );
  return collected.flat().sort((left, right) => left.localeCompare(right));
}

function scanName(
  name: string,
  forbiddenTerms: readonly string[],
  kind: "filename" | "archive-filename",
  findingPath: string,
): readonly SanitizeFinding[] {
  const findings: SanitizeFinding[] = forbiddenTerms.flatMap((term, index) =>
    containsPrivateTerm(name, term)
      ? [{ kind, path: findingPath, rule: `forbidden-term:${index + 1}` }]
      : [],
  );
  findings.push(...scanRules([name], brandNamingRules, kind, findingPath));
  return findings;
}

function scanContents(
  contents: Buffer,
  forbiddenTerms: readonly string[],
  kind: "content" | "archive-content",
  findingPath: string,
): readonly SanitizeFinding[] {
  const texts = binaryTextViews(contents);
  const findings: SanitizeFinding[] = [];
  for (const [index, term] of forbiddenTerms.entries()) {
    if (texts.some((text) => containsPrivateTerm(text, term))) {
      findings.push({ kind, path: findingPath, rule: `forbidden-term:${index + 1}` });
    }
  }
  findings.push(
    ...scanRules(texts, brandNamingRules, kind, findingPath),
    ...scanRules(texts, secretRules, kind, findingPath),
  );
  return findings;
}

function containsPrivateTerm(text: string, term: string): boolean {
  const bytes = Buffer.from(term, "utf8");
  const normalizedText = text.toLocaleLowerCase("en-US");
  return (
    normalizedText.includes(term.toLocaleLowerCase("en-US")) ||
    text.includes(bytes.toString("base64")) ||
    normalizedText.includes(bytes.toString("hex"))
  );
}

function scanRules(
  texts: readonly string[],
  rules: readonly ContentRule[],
  kind: SanitizeFindingKind,
  findingPath: string,
): readonly SanitizeFinding[] {
  return rules.flatMap((rule) =>
    texts.some((text) => testRule(rule, text))
      ? [{ kind, path: findingPath, rule: rule.name }]
      : [],
  );
}

function binaryTextViews(contents: Buffer): readonly string[] {
  const utf8 = contents.toString("utf8");
  const views = [utf8];
  if (contents.includes(0)) {
    views.push(contents.toString("utf16le"));
  }
  return views;
}

function testExpression(expression: RegExp, text: string): boolean {
  expression.lastIndex = 0;
  return expression.test(text);
}

function testRule(rule: ContentRule, text: string): boolean {
  if (rule.isAllowedMatch === undefined) return testExpression(rule.expression, text);
  rule.expression.lastIndex = 0;
  let match = rule.expression.exec(text);
  while (match !== null) {
    if (!rule.isAllowedMatch(match[0])) return true;
    match = rule.expression.exec(text);
  }
  return false;
}

function isAllowedBrandMatch(value: string): boolean {
  if (value === lowerCaseBrandIdentifier || value === upperCaseBrandIdentifier) return true;
  const [firstWord, secondWord] = titleCaseBrandWords;
  if (!value.startsWith(firstWord) || !value.endsWith(secondWord)) return false;
  const separator = value.slice(firstWord.length, value.length - secondWord.length);
  return /^\s+$/u.test(separator);
}

function scanArchive(
  archivePath: string,
  contents: Buffer,
  forbiddenTerms: readonly string[],
  maxEntryBytes: number,
  depth: number,
): readonly SanitizeFinding[] {
  if (depth > 2) {
    return [{ kind: "unscanned", path: archivePath, rule: "archive-depth-limit" }];
  }
  const extension = archivePath.toLocaleLowerCase("en-US");
  let entries: readonly ArchiveEntry[];
  try {
    if (/\.(?:zip|jar|war|whl)$/u.test(extension)) {
      entries = readZipEntries(contents, maxEntryBytes);
    } else if (/\.(?:tgz|tar\.gz)$/u.test(extension)) {
      entries = readTarEntries(
        gunzipSync(contents, { maxOutputLength: maxEntryBytes }),
        maxEntryBytes,
      );
    } else if (extension.endsWith(".tar")) {
      entries = readTarEntries(contents, maxEntryBytes);
    } else if (extension.endsWith(".gz")) {
      entries = [
        {
          name: archivePath.replace(/\.gz$/iu, ""),
          contents: gunzipSync(contents, { maxOutputLength: maxEntryBytes }),
        },
      ];
    } else {
      return [];
    }
  } catch {
    return [{ kind: "unscanned", path: archivePath, rule: "archive-invalid" }];
  }

  const findings: SanitizeFinding[] = [];
  for (const entry of entries) {
    const nestedPath = `${archivePath}!/${normalizePath(entry.name)}`;
    findings.push(...scanName(entry.name, forbiddenTerms, "archive-filename", nestedPath));
    if (entry.issue !== undefined) {
      findings.push({ kind: "unscanned", path: nestedPath, rule: entry.issue });
      continue;
    }
    if (entry.contents === undefined) continue;
    findings.push(
      ...scanContents(entry.contents, forbiddenTerms, "archive-content", nestedPath),
      ...scanArchive(nestedPath, entry.contents, forbiddenTerms, maxEntryBytes, depth + 1),
    );
  }
  return findings;
}

function readZipEntries(buffer: Buffer, maxEntryBytes: number): readonly ArchiveEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) throw new Error("Missing ZIP directory.");
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount > maxArchiveEntries) throw new Error("ZIP entry limit exceeded.");
  const entries: ArchiveEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid ZIP directory.");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue;
    if ((flags & 1) !== 0) {
      entries.push({ name, issue: "archive-encrypted" });
      continue;
    }
    if (uncompressedSize > maxEntryBytes || compressedSize > maxEntryBytes) {
      entries.push({ name, issue: "archive-entry-size-limit" });
      continue;
    }
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Invalid ZIP entry.");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    if (method === 0) entries.push({ name, contents: Buffer.from(compressed) });
    else if (method === 8)
      entries.push({
        name,
        contents: inflateRawSync(compressed, { maxOutputLength: maxEntryBytes }),
      });
    else entries.push({ name, issue: `archive-compression-${method}` });
  }
  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readTarEntries(buffer: Buffer, maxEntryBytes: number): readonly ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let offset = 0;
  while (offset + 512 <= buffer.length && entries.length < maxArchiveEntries) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readNullTerminated(header.subarray(0, 100));
    const prefix = readNullTerminated(header.subarray(345, 500));
    const fullName = prefix === "" ? name : `${prefix}/${name}`;
    const rawSize = readNullTerminated(header.subarray(124, 136)).trim();
    const size = Number.parseInt(rawSize || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error("Invalid TAR size.");
    const type = header[156];
    const dataOffset = offset + 512;
    if ((type === 0 || type === 48) && fullName !== "") {
      if (size > maxEntryBytes) {
        entries.push({ name: fullName, issue: "archive-entry-size-limit" });
      } else {
        entries.push({ name: fullName, contents: buffer.subarray(dataOffset, dataOffset + size) });
      }
    }
    offset = dataOffset + Math.ceil(size / 512) * 512;
  }
  if (entries.length >= maxArchiveEntries) throw new Error("TAR entry limit exceeded.");
  return entries;
}

function readNullTerminated(buffer: Buffer): string {
  const end = buffer.indexOf(0);
  return buffer.subarray(0, end === -1 ? undefined : end).toString("utf8");
}

function scanGitHistory(
  root: string,
  forbiddenTerms: readonly string[],
): readonly SanitizeFinding[] {
  let history: string;
  try {
    // Scan publishable refs while excluding editor-owned checkpoint namespaces under refs/*.
    history = execFileSync(
      "git",
      [
        "-C",
        root,
        "log",
        "HEAD",
        "--branches",
        "--tags",
        "--remotes",
        "--format=commit:%H",
        "--name-status",
        "-p",
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return [{ kind: "unscanned", path: "git-history", rule: "git-history-unavailable" }];
  }
  return scanContents(Buffer.from(history), forbiddenTerms, "content", "git-history").map(
    (finding) => ({ ...finding, kind: "git-history" }),
  );
}

function deduplicateFindings(findings: readonly SanitizeFinding[]): readonly SanitizeFinding[] {
  const unique = new Map<string, SanitizeFinding>();
  for (const finding of findings) {
    unique.set(`${finding.kind}\0${finding.path}\0${finding.rule}`, finding);
  }
  return [...unique.values()].sort((left, right) => {
    const byPath = left.path.localeCompare(right.path);
    return byPath === 0 ? left.rule.localeCompare(right.rule) : byPath;
  });
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}
