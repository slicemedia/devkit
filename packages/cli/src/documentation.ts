import type { AddonEntry, ProjectBundle } from "./types.js";

export interface DocumentationOptions {
  readonly devUrl?: string;
  readonly publicBaseUrl?: string;
  readonly hmr?: boolean;
  readonly bundle?: ProjectBundle;
}

export interface DocumentedEntry extends AddonEntry {
  readonly snippets: {
    readonly development?: string;
    readonly production?: string;
    readonly stylesheet?: string;
  };
}

export function documentEntry(
  entry: AddonEntry,
  options: DocumentationOptions = {},
): DocumentedEntry {
  const bundle = options.bundle ?? entry.bundle;
  if (!bundle) return { ...entry, snippets: {} };
  const devUrl = baseUrl(options.devUrl ?? "http://localhost:5173");
  const development = [
    ...((options.hmr ?? true)
      ? [
          `<script type="module" src="${escapeHtml(new URL("@vite/client", devUrl).href)}"></script>`,
        ]
      : []),
    `<script type="module" src="${escapeHtml(assetUrl(bundle.input, devUrl))}"></script>`,
  ].join("\n");
  const publicBase = options.publicBaseUrl ? baseUrl(options.publicBaseUrl) : undefined;
  const attributes = Object.entries(entry.scriptAttributes)
    .map(([name, value]) => {
      if (
        !/^(?:data-[a-z0-9-]+|integrity|crossorigin|nonce|referrerpolicy|fetchpriority|defer|async)$/u.test(
          name,
        )
      ) {
        throw new Error(`Unsupported script attribute in documentation: ${name}.`);
      }
      return ` ${name}="${escapeHtml(value)}"`;
    })
    .join("");
  return {
    ...entry,
    bundle,
    snippets: {
      development,
      ...(publicBase
        ? {
            production: `<script${entry.placement === "head" && !("defer" in entry.scriptAttributes) ? " defer" : ""} src="${escapeHtml(assetUrl(bundle.scriptFile, publicBase))}"${attributes}></script>`,
            ...(bundle.cssFile
              ? {
                  stylesheet: `<link rel="stylesheet" href="${escapeHtml(assetUrl(bundle.cssFile, publicBase))}">`,
                }
              : {}),
          }
        : {}),
    },
  };
}

export function renderSetupGuide(entry: DocumentedEntry): string {
  const lines = [
    `# ${entry.name}${entry.version ? ` (${entry.version})` : ""}`,
    "",
    entry.description,
    "",
    `Source: ${inline(entry.input)}`,
    `Script placement: ${entry.placement === "head" ? "head, deferred" : "before the closing body tag"}.`,
    "",
    "## Webflow setup",
    "",
    ...(entry.usage?.setup.length
      ? entry.usage.setup.map((step, index) => `${index + 1}. ${step}`)
      : ["No additional setup steps documented."]),
  ];
  if (entry.usage?.markup) lines.push("", fence(entry.usage.markup, "html"));
  lines.push("", "## Attributes", "");
  const details = new Map(entry.attributeDetails?.map((attribute) => [attribute.name, attribute]));
  for (const name of entry.attributes) {
    const detail = details.get(name);
    lines.push(
      `- ${inline(name)}${detail?.required ? " (required)" : ""}${detail?.type ? ` — ${detail.type}` : ""}${detail?.description ? `: ${detail.description}` : ""}${detail?.values ? ` Values: ${detail.values.map(inline).join(", ")}.` : ""}${detail?.option ? ` Maps to option ${inline(detail.option)}.` : ""}`,
    );
  }
  if (entry.attributes.length === 0) lines.push("No attributes declared.");
  lines.push("", "## Options and defaults", "");
  const options = Array.isArray(entry.api.options) ? entry.api.options : [];
  for (const value of options) {
    if (typeof value !== "object" || value === null || !("name" in value)) continue;
    const option = value as Record<string, unknown>;
    lines.push(
      `- ${inline(String(option.name))}${option.required ? " (required)" : ""}${typeof option.type === "string" ? ` — ${option.type}` : ""}${typeof option.description === "string" ? `: ${option.description}` : ""}`,
    );
  }
  lines.push(fence(JSON.stringify(entry.defaultOptions ?? {}, null, 2), "json"));
  lines.push("", "## Runtime API", "", fence(JSON.stringify(entry.api, null, 2), "json"));
  lines.push(
    "",
    "## Dependencies",
    "",
    ...(entry.dependencies.length
      ? entry.dependencies.map((name) => `- ${inline(name)}`)
      : ["No dependencies declared."]),
  );
  lines.push("", "## Local Webflow testing", "");
  if (entry.snippets.development) {
    lines.push(
      "Start the project dev server. Use this snippet only on an approved testing page; remove it before production handoff.",
      "",
      fence(entry.snippets.development, "html"),
    );
  } else {
    lines.push(
      "This is a reusable source module. Create a browser entry under src/addons/ using a .entry.ts or .entry.js filename that initializes and registers its API; category folders may nest. Alternatively declare an explicit browser bundle in devkit.config.json.",
    );
  }
  lines.push("", "## Production handoff", "");
  if (entry.snippets.production) {
    lines.push(
      "Build and deploy this standalone script first. Load it once on each page that needs this enhancement. Other addon scripts are selected independently.",
      "",
    );
    if (entry.snippets.stylesheet)
      lines.push(
        "Place the stylesheet in the head, when the build emits this CSS file:",
        "",
        fence(entry.snippets.stylesheet, "html"),
        "",
      );
    lines.push(fence(entry.snippets.production, "html"));
  } else {
    lines.push(
      "Supply the project's deployed asset base URL with --public-base-url to generate production tags. Hosting is never inferred.",
    );
  }
  if (entry.usage?.notes?.length)
    lines.push("", "## Notes", "", ...entry.usage.notes.map((note) => `- ${note}`));
  return `${lines.join("\n")}\n`;
}

export function renderCatalog(entries: readonly DocumentedEntry[]): string {
  return `# Webflow enhancement catalog\n\nGenerated from project configuration and inert addon metadata.\n\n${entries.map((entry) => renderSetupGuide(entry).replace(/^(#{1,5}) /gmu, "#$1 ")).join("\n---\n\n")}`;
}

function baseUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Documentation base URLs must use HTTP(S), without credentials, a query, or fragment.",
    );
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function assetUrl(value: string, base: URL): string {
  const segments = value.replaceAll("\\", "/").split("/");
  if (
    segments.some((part) => part === ".." || part === "." || part === "") ||
    /[:?#]/u.test(value)
  ) {
    throw new Error("Documented bundle paths must be relative asset paths without traversal.");
  }
  return new URL(segments.map(encodeURIComponent).join("/"), base).href;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fence(value: string, language: string): string {
  const marker = "`".repeat(
    Math.max(3, ...[...value.matchAll(/`+/gu)].map(([run]) => run.length + 1)),
  );
  return `${marker}${language}\n${value}\n${marker}`;
}

function inline(value: string): string {
  const marker = value.includes("`") ? "``" : "`";
  return `${marker}${value}${marker}`;
}
