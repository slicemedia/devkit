import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const privateTerms = await readFile(new URL("../.private/denylist.txt", import.meta.url), "utf8")
  .then((source) =>
    source
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#")),
  )
  .catch(() => []);
const configuredTerms = process.env.SLICEMEDIA_FORBIDDEN_TERMS?.trim();
const parseConfiguredTerms = (value) => {
  if (!value) return [];
  if (value.startsWith("[")) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error("SLICEMEDIA_FORBIDDEN_TERMS JSON must be an array of strings.");
    }
    return parsed;
  }
  return value.split(/[\n,]/u);
};
const forbiddenTerms = JSON.stringify(
  [
    ...new Set(
      [...privateTerms, ...parseConfiguredTerms(configuredTerms)].map((term) => term.trim()),
    ),
  ].filter(Boolean),
);

const child = spawn(
  process.execPath,
  [
    "packages/cli/dist/bin.js",
    "sanitize",
    "--root",
    ".",
    "--ignore",
    ".private",
    "--ignore",
    ".specstory",
    "--git-history",
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    env: { ...process.env, SLICEMEDIA_FORBIDDEN_TERMS: forbiddenTerms },
    stdio: "inherit",
  },
);

child.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
