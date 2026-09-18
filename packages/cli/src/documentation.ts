import type {
  AddonEntry,
  ConditionDocumentation,
  ProjectBundle,
  StructureDocumentation,
} from "./types.js";

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
  if (entry.structure)
    lines.push("", "## Markup structure", "", fence(renderStructure(entry), "text"));
  if (entry.scope === "global")
    lines.push(
      "",
      "Global service: no component root is required. Inspect runtime diagnostics for readiness.",
    );
  lines.push("", "## Attributes", "");
  const details = new Map(entry.attributeDetails?.map((attribute) => [attribute.name, attribute]));
  for (const name of entry.attributes) {
    const detail = details.get(name);
    lines.push(
      `- ${inline(name)}${detail?.required ? " (required)" : ""}${detail?.type ? ` — ${detail.type}` : ""}${detail?.description ? `: ${detail.description}` : ""}${detail?.values ? ` Values: ${detail.values.map(inline).join(", ")}.` : ""}${detail?.option ? ` Maps to option ${inline(detail.option)}.` : ""}`,
    );
    if (detail) lines.push(...constraints(detail).map((constraint) => `  ${constraint}`));
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
    lines.push(...constraints(option).map((constraint) => `  ${constraint}`));
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
  for (const dependency of entry.dependencyDetails ?? []) {
    const details = [
      dependency.global ? `browser global ${inline(dependency.global)}` : undefined,
      dependency.optional ? "optional" : "required",
      dependency.when ? `when ${describeCondition(dependency.when)}` : undefined,
    ].filter(Boolean);
    lines.push(`- ${inline(dependency.name)}: ${details.join("; ")}.`);
  }
  lines.push("", "## Local Webflow testing", "");
  if (entry.snippets.development) {
    lines.push(
      "Start the project dev server. Use this snippet only on an approved testing page; remove it before production handoff.",
      "",
      fence(entry.snippets.development, "html"),
    );
  } else {
    lines.push(
      "This is a reusable source module. Create a browser entry under src/addons/<name>.ts that initializes and registers its API, or declare an explicit browser bundle in devkit.config.json.",
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

/** Render the same role hierarchy that the browser inspector validates. */
function renderStructure(entry: DocumentedEntry): string {
  const lines: string[] = [];
  const details = new Map(entry.attributeDetails?.map((attribute) => [attribute.name, attribute]));
  const ancestors = new Set<StructureDocumentation>();
  const clean = (value: string): string => value.replace(/[\r\n\t]/gu, " ");
  const visit = (
    node: StructureDocumentation,
    prefix: string,
    last: boolean,
    root: boolean,
  ): void => {
    if (ancestors.has(node)) throw new Error("Markup structure must be an acyclic tree.");
    ancestors.add(node);
    const selector =
      node.selectorOption && typeof entry.defaultOptions?.[node.selectorOption] === "string"
        ? (entry.defaultOptions[node.selectorOption] as string)
        : node.selector;
    const relationship = root
      ? "root"
      : node.relationship === "child"
        ? "direct child"
        : node.relationship === "self"
          ? "on parent"
          : node.relationship === "self-or-descendant"
            ? "parent or descendant"
            : "descendant";
    const required = (node.min ?? ((node.required ?? !root) ? 1 : 0)) > 0;
    const childPrefix = prefix + (root ? "" : last ? "   " : "│  ");
    lines.push(
      `${prefix}${root ? "" : last ? "└─ " : "├─ "}${clean(node.label)} · ${relationship} · ${required ? "required" : "optional"}`,
    );
    if (node.when) lines.push(`${childPrefix}   When: ${describeCondition(node.when)}`);
    if (node.min !== undefined || node.max !== undefined)
      lines.push(
        `${childPrefix}   Matches per parent: ${node.min ?? (required ? 1 : 0)}${node.max === undefined ? " or more" : `–${node.max}`}`,
      );
    if (node.scopeSelector)
      lines.push(`${childPrefix}   Shared scope: closest ${clean(node.scopeSelector)}`);
    if (node.uniqueBy) lines.push(`${childPrefix}   Unique key: ${node.uniqueBy}`);
    if (node.references)
      lines.push(
        `${childPrefix}   ${node.references.attribute} matches ${node.references.target}.${node.references.targetAttribute} within the same component`,
      );
    lines.push(
      `${childPrefix}   ${clean(selector)}${node.selectorOption ? ` (option: ${clean(node.selectorOption)})` : ""}`,
    );
    for (const rule of node.attributes) {
      const attribute = details.get(rule.name);
      lines.push(
        `${childPrefix}   ${clean(rule.name)} · ${(rule.required ?? attribute?.required ?? false) ? "required" : "optional"}${attribute?.type ? ` · ${attribute.type}` : ""}${rule.when ? ` · when ${describeCondition(rule.when)}` : ""}`,
      );
    }
    const children = node.children ?? [];
    children.forEach((child, index) =>
      visit(child, childPrefix, index === children.length - 1, false),
    );
    ancestors.delete(node);
  };
  visit(entry.structure!, "", true, true);
  return lines.join("\n");
}

function describeCondition(condition: ConditionDocumentation): string {
  if ("all" in condition) return condition.all.map(describeCondition).join(" and ");
  if ("any" in condition) return `(${condition.any.map(describeCondition).join(" or ")})`;
  if ("not" in condition) return `not (${describeCondition(condition.not)})`;
  if ("media" in condition) return `media ${condition.media}`;
  return `${"option" in condition ? `option ${condition.option}` : condition.attribute} = ${JSON.stringify(condition.equals)}`;
}

function constraints(value: {
  readonly min?: unknown;
  readonly max?: unknown;
  readonly integer?: unknown;
  readonly format?: unknown;
  readonly target?: unknown;
}): string[] {
  return [
    value.min === undefined ? undefined : `Minimum: ${value.min}.`,
    value.max === undefined ? undefined : `Maximum: ${value.max}.`,
    value.integer ? "Must be an integer." : undefined,
    value.format ? `Format: ${value.format}.` : undefined,
    value.target ? `Selector must match a target in the ${value.target}.` : undefined,
  ].filter((line): line is string => line !== undefined);
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
