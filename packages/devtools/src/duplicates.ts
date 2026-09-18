import type {
  DevToolsAddonInspection,
  DevToolsIssue,
  DevToolsRegistration,
  DevToolsScriptWarning,
} from "./types.js";

/** Compare registrations, never the number of roots in an individual registration. */
export function registrationWarnings(
  registrations: readonly DevToolsRegistration[],
  inspections: readonly DevToolsAddonInspection[],
): readonly (DevToolsIssue | undefined)[] {
  const byName = new Map<string, number[]>();
  inspections.forEach((addon, index) => {
    const group = byName.get(addon.name) ?? [];
    group.push(index);
    byName.set(addon.name, group);
  });
  const rootSets = inspections.map((addon) => new Set(addon.roots));
  return inspections.map((addon, index) => {
    const registration = registrations[index]!;
    const root = addon.rootSelector?.trim();
    const peers = (byName.get(addon.name) ?? []).filter((otherIndex) => {
      if (index === otherIndex) return false;
      const otherRoot = inspections[otherIndex]!.rootSelector?.trim();
      // Missing scope cannot establish that two registrations are independent.
      if (root === undefined || otherRoot === undefined) return true;
      if (root === otherRoot) return true;
      return inspections[otherIndex]!.roots?.some((element) => rootSets[index]!.has(element));
    });
    if (peers.length === 0) return undefined;
    const repeatedInstance = peers.some(
      (peer) => registrations[peer]!.addon === registration.addon,
    );
    const hasUnknownScope =
      root === undefined || peers.some((peer) => inspections[peer]!.rootSelector === undefined);
    const others = peers
      .slice(0, 3)
      .map((peer) => {
        const other = inspections[peer]!;
        return `#${peer + 1} ${other.label} v${other.version}`;
      })
      .join(", ");
    const extra = peers.length > 3 ? ` and ${peers.length - 3} more` : "";
    const reason = repeatedInstance
      ? "The same addon instance is registered more than once."
      : hasUnknownScope
        ? "Multiple instances of this addon are registered without fully declared root scopes."
        : "Multiple instances of this addon target overlapping roots or the same root selector.";
    return {
      code: "duplicate-registration",
      severity: "warning",
      message: `Possible duplicate addon: ${reason} Also registered as ${others}${extra}. Review these registrations; keep intentional instances scoped to separate roots.`,
    };
  });
}

// JavaScript MIME type essence matches from the HTML/MIME Sniffing standards.
const javascriptTypes = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);

/** Inspect current markup only: no requests, source evaluation, or global instrumentation. */
export function duplicateScriptWarnings(
  document: Document,
  excluded: ReadonlySet<Element>,
): readonly DevToolsScriptWarning[] {
  const scripts = new Map<string, HTMLScriptElement[]>();
  for (const script of document.querySelectorAll<HTMLScriptElement>("script[src]")) {
    if (excluded.has(script) || script.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
    const type = (script.getAttribute("type") ?? "").trim().toLowerCase();
    if (type !== "" && type !== "module" && !javascriptTypes.has(type)) continue;
    // A nomodule fallback does not run in the modern browsers supported by DevKit.
    if (type !== "module" && script.hasAttribute("nomodule")) continue;
    if (!script.hasAttribute("type") && script.getAttribute("language")) {
      if (!javascriptTypes.has(`text/${script.getAttribute("language")!.trim().toLowerCase()}`))
        continue;
    }
    const src = script.getAttribute("src")?.trim();
    if (!src) continue;
    let resolved: string;
    try {
      // Keep queries and fragments: different URLs can carry different versions or configuration.
      resolved = new URL(src, document.baseURI).href;
    } catch {
      continue;
    }
    const group = scripts.get(resolved) ?? [];
    group.push(script);
    scripts.set(resolved, group);
  }
  return [...scripts]
    .filter(([, elements]) => elements.length > 1)
    .map(([src, elements]) => ({
      code: "duplicate-script",
      severity: "warning",
      src,
      elements,
      message: `Duplicate script include: ${elements.length} script tags use the same URL. Check for repeated includes in site-wide and page custom code. This does not prove repeated execution or identify which addon the script contains.`,
    }));
}
