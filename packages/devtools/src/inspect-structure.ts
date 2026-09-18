import { freezeStructure } from "@slicemedia/devkit-core/inspection";
import {
  assertInspectionRecord,
  conditionMatches,
  readOptionPath,
  resolveInspectionOptions,
} from "@slicemedia/devkit-core/inspection";
import type { AddonInspectionContext } from "@slicemedia/devkit-core";
import type { AddonAttribute, AddonStructureNode } from "@slicemedia/devkit-core";
import type {
  DevToolsAddonInspection,
  DevToolsAttributeInspection,
  DevToolsIssue,
  DevToolsRegistration,
  DevToolsStructureInspection,
} from "./types.js";
import { valueConstraints, valueProblem } from "./values.js";

/** Match declared roles using the same root options exposed to addon behaviour. */
export function inspectStructuredAddon(
  registration: DevToolsRegistration,
  input: AddonStructureNode,
  document: Document,
  inventory: ReadonlyMap<string, readonly Element[]>,
  excluded: ReadonlySet<Element>,
): DevToolsAddonInspection {
  const { addon, contract } = registration;
  const metadata = new Map(
    addon.definition.attributes.map((attribute) => [attribute.name, attribute]),
  );
  const options = { ...addon.definition.defaultOptions, ...addon.options };
  const issues: DevToolsIssue[] = [];
  const placed = new Map<string, DevToolsAttributeInspection[]>();
  const contexts = new Map<Element, AddonInspectionContext>();
  const sharedOwners = new Map<Element, Element>();
  const roles = new Map<string, { node: AddonStructureNode; elements: readonly Element[] }>();
  let roots: Element[] = [];
  let rootSet = new Set<Element>();
  let rootSelector: string | undefined;
  const owner = (
    element: Element | null,
    candidates: ReadonlySet<Element>,
  ): Element | undefined => {
    while (element) {
      if (candidates.has(element)) return element;
      element = element.parentElement;
    }
    return undefined;
  };
  const baseContext: AddonInspectionContext = {
    document,
    window: document.defaultView!,
    options,
    status: addon.status ?? "idle",
  };
  const contextFor = (element?: Element): AddonInspectionContext => {
    const root = element && (owner(element, rootSet) ?? sharedOwners.get(element));
    if (!root) return baseContext;
    let context = contexts.get(root);
    if (!context) {
      const base = { ...baseContext, root };
      const resolved =
        addon.resolveOptions?.(root) ?? resolveInspectionOptions(addon.definition, base);
      assertInspectionRecord(resolved, "resolveOptions must return a synchronous options object.");
      context = { ...base, options: resolved };
      contexts.set(root, context);
    }
    return context;
  };
  const inspectAttribute = (
    attribute: AddonAttribute,
    required: boolean,
    elements: readonly Element[],
    role?: string,
  ): DevToolsAttributeInspection => {
    const found = elements.filter((element) => element.hasAttribute(attribute.name));
    for (const element of found) {
      const problem = valueProblem(
        attribute,
        element.getAttribute(attribute.name) ?? "",
        document,
        contextFor(element).root,
      );
      if (problem)
        issues.push({
          code: "invalid-value",
          severity: "error",
          attribute: attribute.name,
          element,
          ...(role ? { structureNode: role } : {}),
          message: `${attribute.name}: ${problem}`,
        });
    }
    return {
      name: attribute.name,
      description: attribute.description,
      type: attribute.type,
      required,
      elements: found,
      ...(attribute.values ? { values: attribute.values } : {}),
      constraints: valueConstraints(attribute),
    };
  };
  const visit = (
    node: AddonStructureNode,
    parents: readonly Element[],
    isRoot: boolean,
  ): DevToolsStructureInspection => {
    const required = isRoot
      ? (contract?.required ?? node.required ?? false)
      : (node.required ?? true);
    const minimum = node.min ?? (required ? 1 : 0);
    const relationship = isRoot ? "root" : (node.relationship ?? "descendant");
    const fallback = node.selectorOption ? readOptionPath(options, node.selectorOption) : undefined;
    const selector =
      isRoot && contract ? contract.root : typeof fallback === "string" ? fallback : node.selector;
    const elements = new Set<Element>();
    const active = new Set<Element>();
    const missingParents: Element[] = [];
    let inactiveCount = 0;
    const parentSet = new Set(parents);
    if (isRoot) rootSelector = selector;
    const checkCount = (matches: readonly Element[], parent?: Element): void => {
      if (matches.length < minimum || (node.max !== undefined && matches.length > node.max)) {
        if (parent && matches.length < minimum) missingParents.push(parent);
        const missing = matches.length === 0 && minimum === 1;
        issues.push({
          code: missing ? (isRoot ? "missing-root" : "missing-element") : "invalid-count",
          severity: "error",
          structureNode: node.id,
          ...(parent ? { element: parent } : {}),
          message: missing
            ? isRoot
              ? `No root matches ${selector}; this addon is expected on this page.`
              : `${node.label} (${selector}) is required ${relationship === "child" ? "as a direct child" : "inside"} of this parent.`
            : `${node.label} requires ${minimum}${node.max === undefined ? " or more" : `–${node.max}`} matches; found ${matches.length}.`,
        });
      }
    };
    try {
      document.createDocumentFragment().querySelector(selector);
      if (isRoot) {
        roots = [...document.querySelectorAll(selector)].filter(
          (element) => !excluded.has(element),
        );
        rootSet = new Set(roots);
        for (const root of roots) {
          elements.add(root);
          if (conditionMatches(node.when, contextFor(root))) active.add(root);
          else inactiveCount += 1;
        }
        if (roots.length || conditionMatches(node.when, baseContext)) checkCount(roots);
      } else {
        for (const parent of parents) {
          const context = contextFor(parent);
          if (!conditionMatches(node.when, context)) {
            inactiveCount += 1;
            continue;
          }
          const configured = node.selectorOption
            ? readOptionPath(context.options, node.selectorOption)
            : undefined;
          const selected = typeof configured === "string" ? configured : node.selector;
          document.createDocumentFragment().querySelector(selected);
          const scope = node.scopeSelector ? parent.closest(node.scopeSelector) : parent;
          const self =
            (relationship === "self" || relationship === "self-or-descendant") &&
            parent.matches(selected);
          const candidates = self
            ? [parent]
            : relationship === "self"
              ? []
              : [...(scope?.querySelectorAll(selected) ?? [])];
          const matches = candidates.filter((element) => {
            if (excluded.has(element)) return false;
            if (element === parent) return self;
            if (relationship === "child" && element.parentElement !== parent) return false;
            if (node.scopeSelector) {
              const root = owner(element, rootSet);
              return !root || root === context.root;
            }
            return (
              owner(element, rootSet) === context.root &&
              owner(element.parentElement, parentSet) === parent
            );
          });
          matches.forEach((element) => {
            if (context.root && !owner(element, rootSet)) {
              const previous = sharedOwners.get(element);
              if (previous && previous !== context.root)
                issues.push({
                  code: "invalid-contract",
                  severity: "warning",
                  element,
                  structureNode: node.id,
                  message: `${node.label} is shared by multiple roots; provide a narrower scope or a custom diagnostic for ownership.`,
                });
              else sharedOwners.set(element, context.root);
            }
            elements.add(element);
            active.add(element);
          });
          checkCount(matches, parent);
        }
      }
    } catch (error) {
      issues.push({
        code: "invalid-contract",
        severity: "error",
        structureNode: node.id,
        message: `Cannot inspect ${node.label}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    const matches = [...elements];
    const activeMatches = [...active];
    const attributes = node.attributes.map((rule) => {
      const attribute = metadata.get(rule.name)!;
      const requiredAttribute = rule.required ?? attribute.required ?? false;
      const applicable = activeMatches.filter((element) =>
        conditionMatches(rule.when, contextFor(element)),
      );
      if (requiredAttribute)
        for (const element of applicable)
          if (!element.hasAttribute(rule.name)) {
            issues.push({
              code: "missing-attribute",
              severity: "error",
              structureNode: node.id,
              attribute: rule.name,
              element,
              message: `${rule.name} is required on ${node.label}.`,
            });
          }
      const result = {
        ...inspectAttribute(attribute, requiredAttribute, applicable, node.id),
        ...(rule.when ? { condition: JSON.stringify(rule.when) } : {}),
      };
      placed.set(attribute.name, [...(placed.get(attribute.name) ?? []), result]);
      return result;
    });
    roles.set(node.id, { node, elements: activeMatches });
    return {
      id: node.id,
      label: node.label,
      selector,
      relationship,
      required: minimum > 0,
      elements: matches,
      missingParents,
      attributes,
      issues: [],
      minimum,
      ...(node.max === undefined ? {} : { maximum: node.max }),
      inactiveCount,
      activeCount: activeMatches.length,
      ...(node.when ? { condition: JSON.stringify(node.when) } : {}),
      ...(node.scopeSelector ? { scopeSelector: node.scopeSelector } : {}),
      ...(node.uniqueBy ? { uniqueBy: node.uniqueBy } : {}),
      ...(node.references ? { references: node.references } : {}),
      children: (node.children ?? []).map((child) => visit(child, activeMatches, false)),
    };
  };
  let structure: DevToolsStructureInspection | undefined;
  try {
    structure = visit(freezeStructure(input, new Set(metadata.keys()), options), [], true);
    for (const { node, elements } of roles.values()) {
      for (const root of roots) {
        const owned = elements.filter((element) => contextFor(element).root === root);
        if (node.uniqueBy) {
          const seen = new Set<string>();
          for (const element of owned) {
            const key = element.getAttribute(node.uniqueBy);
            if (key === null) continue;
            if (seen.has(key))
              issues.push({
                code: "duplicate-key",
                severity: "error",
                structureNode: node.id,
                attribute: node.uniqueBy,
                element,
                message: `Duplicate ${node.uniqueBy} key ${JSON.stringify(key)} in this component.`,
              });
            seen.add(key);
          }
        }
        if (node.references) {
          const reference = node.references;
          const targets = roles
            .get(reference.target)!
            .elements.filter((element) => contextFor(element).root === root);
          for (const element of owned) {
            const key = element.getAttribute(reference.attribute);
            if (
              key !== null &&
              !targets.some((target) => target.getAttribute(reference.targetAttribute) === key)
            )
              issues.push({
                code: "missing-reference",
                severity: "error",
                structureNode: node.id,
                attribute: reference.attribute,
                element,
                message: `${reference.attribute}=${JSON.stringify(key)} has no matching ${reference.target} (${reference.targetAttribute}) in this component.`,
              });
          }
        }
      }
    }
  } catch (error) {
    issues.push({
      code: "invalid-contract",
      severity: "error",
      message: error instanceof Error ? error.message : "Invalid markup structure.",
    });
  }
  const withIssues = (node: DevToolsStructureInspection): DevToolsStructureInspection => ({
    ...node,
    issues: issues.filter((issue) => issue.structureNode === node.id),
    children: node.children.map(withIssues),
  });
  const attributes = addon.definition.attributes.map((attribute) => {
    const placements = placed.get(attribute.name);
    if (placements?.length)
      return {
        ...placements[0]!,
        required: placements.some((placement) => placement.required),
        elements: [...new Set(placements.flatMap((placement) => placement.elements))],
      };
    const elements = (inventory.get(attribute.name) ?? []).filter((element) =>
      owner(element, rootSet),
    );
    if (attribute.required && roots.length > 0)
      issues.push({
        code: "unscoped-requirement",
        severity: "info",
        attribute: attribute.name,
        message: `${attribute.name} is marked required, but has no element role in the markup structure.`,
      });
    return inspectAttribute(attribute, attribute.required ?? false, elements);
  });
  return {
    name: addon.definition.name,
    label: registration.label ?? addon.definition.name,
    version: addon.definition.version,
    description: addon.definition.description,
    status: addon.status ?? "unreported",
    roots,
    attributes,
    issues,
    ...(structure ? { structure: withIssues(structure) } : {}),
    ...(rootSelector ? { rootSelector } : {}),
    ...(addon.definition.usage ? { usage: addon.definition.usage } : {}),
  };
}
