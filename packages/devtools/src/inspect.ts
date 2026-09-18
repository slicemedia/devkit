import { valueConstraints, valueProblem } from "./values.js";
import { inspectStructuredAddon } from "./inspect-structure.js";
import { duplicateScriptWarnings, registrationWarnings } from "./duplicates.js";
import { inspectDiagnostics } from "./inspect-diagnostics.js";
import type {
  DevToolsAddonInspection,
  DevToolsAttributeRule,
  DevToolsIssue,
  DevToolsRegistration,
  DevToolsScanOptions,
  DevToolsSnapshot,
} from "./types.js";

/** A read-only snapshot using declared contracts and explicit synchronous diagnostic providers. */
export function inspectDevKit(options: DevToolsScanOptions): DevToolsSnapshot {
  const excluded = new Set(options.exclude ?? []);
  const inventory = new Map<string, Element[]>();
  for (const element of options.document.querySelectorAll("*")) {
    if (excluded.has(element)) continue;
    for (const name of element.getAttributeNames()) {
      if (!name.startsWith("data-wft-")) continue;
      const elements = inventory.get(name) ?? [];
      elements.push(element);
      inventory.set(name, elements);
    }
  }

  const known = new Set<string>();
  const addons: Array<DevToolsAddonInspection & { issues: DevToolsIssue[] }> = options.addons
    .map((registration): DevToolsAddonInspection => {
      try {
        const definition = registration.addon.definition;
        if (
          !Array.isArray(definition.attributes) ||
          definition.attributes.some(
            (attribute) =>
              !attribute ||
              typeof attribute.name !== "string" ||
              !attribute.name.startsWith("data-wft-") ||
              typeof attribute.description !== "string" ||
              !["string", "number", "boolean", "selector", "enum"].includes(attribute.type),
          )
        )
          throw new TypeError("Invalid attribute metadata.");
        definition.attributes.forEach(({ name }) => known.add(name));
        const result = inspectAddon(registration, options.document, inventory, excluded);
        if (registration.metadataError)
          return {
            ...result,
            coverage: "inventory" as const,
            issues: [
              ...result.issues,
              {
                code: "inspection-failed" as const,
                severity: "warning" as const,
                message: registration.metadataError,
              },
            ],
          };
        return inspectDiagnostics(registration, result, options.document);
      } catch (error) {
        const definition = registration.addon.definition;
        return {
          name: definition?.name ?? "Unknown addon",
          label: registration.label ?? definition?.name ?? "Unknown addon",
          version: definition?.version ?? "unknown",
          description: definition?.description ?? "",
          status: registration.addon.status ?? "unreported",
          attributes: [],
          coverage: "inventory" as const,
          issues: [
            {
              code: "inspection-failed" as const,
              severity: "warning" as const,
              message: `Metadata could not be inspected: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    })
    .map((addon) => ({ ...addon, issues: [...addon.issues] }));
  // A hook is orphaned only when no registration that declares it owns the element.
  for (const [name, elements] of inventory) {
    const owners = addons.filter((addon) =>
      addon.attributes.some((attribute) => attribute.name === name),
    );
    if (!owners.length || owners.some((addon) => addon.roots === undefined)) continue;
    for (const element of elements) {
      if (
        owners.some(
          (addon) =>
            addon.roots!.some((root) => root.contains(element)) ||
            addon.attributes.some(
              (attribute) => attribute.name === name && attribute.elements.includes(element),
            ),
        )
      )
        continue;
      owners[0]!.issues.push({
        code: "orphan-attribute",
        severity: "warning",
        attribute: name,
        element,
        message: `${name} is outside every registered component root that declares it.`,
      });
    }
  }
  const duplicates = registrationWarnings(options.addons, addons);
  return {
    addons: addons.map((addon, index) => ({
      ...addon,
      issues: duplicates[index] ? [duplicates[index], ...addon.issues] : addon.issues,
    })),
    scriptWarnings: duplicateScriptWarnings(options.document, excluded),
    unclaimedAttributes: [...inventory]
      .filter(([name]) => !known.has(name))
      .map(([name, elements]) => ({ name, elements }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function inspectAddon(
  registration: DevToolsRegistration,
  document: Document,
  inventory: ReadonlyMap<string, readonly Element[]>,
  excluded: ReadonlySet<Element>,
): DevToolsAddonInspection {
  const { addon, contract } = registration;
  const structure = contract?.structure ?? addon.definition.structure;
  if (structure && contract?.attributes === undefined)
    return inspectStructuredAddon(registration, structure, document, inventory, excluded);
  const issues: DevToolsIssue[] = [];
  let roots: Element[] | undefined;
  if (contract) {
    try {
      roots = [...document.querySelectorAll(contract.root)].filter(
        (element) => !excluded.has(element),
      );
      if (roots.length === 0 && contract.required) {
        issues.push({
          code: "missing-root",
          severity: "error",
          message: `No root matches ${contract.root}; this addon is expected on this page.`,
        });
      }
    } catch {
      roots = [];
      issues.push({
        code: "invalid-contract",
        severity: "error",
        message: `The root selector is invalid: ${contract.root}`,
      });
    }
  }

  const rootSet = new Set(roots);
  const ownerOf = (element: Element): Element | undefined => {
    let current: Element | null = element;
    while (current) {
      if (rootSet.has(current)) return current;
      current = current.parentElement;
    }
    return undefined;
  };

  const metadata = new Map(
    addon.definition.attributes.map((attribute) => [attribute.name, attribute]),
  );
  const rules = new Map<string, DevToolsAttributeRule>();
  for (const rule of contract?.attributes ?? []) {
    if (
      !metadata.has(rule.name) ||
      rules.has(rule.name) ||
      !["root", "descendant"].includes(rule.on)
    ) {
      issues.push({
        code: "invalid-contract",
        severity: "error",
        attribute: rule.name,
        message: `The rule for ${rule.name} must name a declared attribute, use root or descendant, and occur once.`,
      });
      continue;
    }
    rules.set(rule.name, rule);
  }

  const attributes = addon.definition.attributes.map((attribute) => {
    const rule = rules.get(attribute.name);
    const elements = (inventory.get(attribute.name) ?? []).filter((element) => {
      if (!roots) return true;
      const owner = ownerOf(element);
      if (!owner) return false;
      return rule?.on === "root"
        ? owner === element
        : rule?.on === "descendant"
          ? owner !== element
          : true;
    });
    const required = rule?.required ?? attribute.required ?? false;

    if (required && rule && roots) {
      const satisfiedRoots = new Set(elements.map(ownerOf));
      for (const root of roots) {
        if (satisfiedRoots.has(root)) continue;
        issues.push({
          code: "missing-attribute",
          severity: "error",
          attribute: attribute.name,
          element: root,
          message: `${attribute.name} is required ${rule.on === "root" ? "on this root" : "on a descendant of this root"}.`,
        });
      }
    } else if (required && (!roots || roots.length > 0)) {
      issues.push({
        code: "unscoped-requirement",
        severity: "info",
        attribute: attribute.name,
        message: `${attribute.name} is marked required, but has no location rule. Presence alone cannot prove the contract.`,
      });
    }

    for (const element of elements) {
      const value = element.getAttribute(attribute.name) ?? "";
      const problem = valueProblem(attribute, value, document, ownerOf(element));
      if (problem) {
        issues.push({
          code: "invalid-value",
          severity: "error",
          attribute: attribute.name,
          element,
          message: `${attribute.name}: ${problem}`,
        });
      }
    }

    return {
      name: attribute.name,
      description: attribute.description,
      type: attribute.type,
      required,
      elements,
      ...(attribute.values ? { values: attribute.values } : {}),
      constraints: valueConstraints(attribute),
      ...(rule ? { placement: rule.on } : {}),
    };
  });

  return {
    name: addon.definition.name,
    label: registration.label ?? addon.definition.name,
    version: addon.definition.version,
    description: addon.definition.description,
    status: addon.status ?? "unreported",
    ...(roots ? { roots } : {}),
    attributes,
    issues,
    ...(contract ? { rootSelector: contract.root } : {}),
    ...(addon.definition.usage ? { usage: addon.definition.usage } : {}),
  };
}
