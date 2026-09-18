import type { DevToolsAddonInspection } from "./types.js";

function formatOptions(options: Readonly<Record<string, unknown>>): string {
  const visited = new WeakSet<object>();
  try {
    return JSON.stringify(
      options,
      (_key, value: unknown) => {
        if (typeof value === "function") return "[Function]";
        if (typeof value === "bigint") return String(value);
        if (value && typeof value === "object") {
          if (visited.has(value)) return "[Circular]";
          visited.add(value);
          if ("nodeType" in value) return "[DOM node]";
        }
        return value;
      },
      2,
    ).slice(0, 12000);
  } catch {
    return "Options cannot be serialized.";
  }
}

export function renderDiagnostics(
  document: Document,
  addon: DevToolsAddonInspection,
  expanded: ReadonlyMap<string, boolean>,
  locate: (element: Element, label: string) => HTMLButtonElement,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "runtime-section";
  section.setAttribute("aria-label", "Runtime diagnostics");
  const heading = document.createElement("h3");
  heading.textContent = "Runtime & configuration";
  section.append(heading);
  for (const [index, instance] of (addon.instances ?? []).entries()) {
    const details = document.createElement("details");
    details.className = "runtime-instance";
    details.dataset.disclosure = `runtime:${index}`;
    details.open = expanded.get(details.dataset.disclosure) ?? false;
    const summary = document.createElement("summary");
    summary.textContent = `${instance.root ? `Component ${index + 1}` : addon.coverage === "global" ? "Global service" : "Registered addon"} · ${instance.diagnostics.state}`;
    details.append(summary);
    if (instance.diagnostics.message) {
      const message = document.createElement("p");
      message.className = "muted";
      message.textContent = instance.diagnostics.message;
      details.append(message);
    }
    if (instance.root) details.append(locate(instance.root, "Locate component"));
    if (instance.dependencies.length) {
      const list = document.createElement("ul");
      list.className = "runtime-dependencies";
      for (const dependency of instance.dependencies) {
        const item = document.createElement("li");
        item.textContent = `${dependency.name} · ${dependency.state}${dependency.message ? ` · ${dependency.message}` : ""}`;
        list.append(item);
      }
      details.append(list);
    }
    const label = document.createElement("p");
    label.className = "muted";
    label.textContent = "Effective options";
    const pre = document.createElement("pre");
    pre.className = "setup-markup";
    pre.textContent = formatOptions(instance.options);
    details.append(label, pre);
    section.append(details);
  }
  return section;
}
