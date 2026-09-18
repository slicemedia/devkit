import type {
  DevToolsAddonInspection,
  DevToolsAttributeInspection,
  DevToolsIssue,
  DevToolsStructureInspection,
} from "./types.js";

interface RenderOptions {
  document: Document;
  addon: DevToolsAddonInspection;
  expanded: ReadonlyMap<string, boolean>;
  locate(element: Element, label: string): HTMLButtonElement;
}

/** Nested lists and native disclosures describe expected markup without pretending to be a DOM tree. */
export function renderMarkupStructure({
  document,
  addon,
  expanded,
  locate,
}: RenderOptions): HTMLElement {
  const make = <Tag extends keyof HTMLElementTagNameMap>(
    tag: Tag,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[Tag] => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const disclosure = (key: string, open = true): HTMLDetailsElement => {
    const element = make("details", "markup-node");
    element.dataset.disclosure = key;
    element.open = expanded.get(key) ?? open;
    return element;
  };
  const attributeList = (
    attributes: readonly DevToolsAttributeInspection[],
    issues: readonly DevToolsIssue[],
    elementCount?: number,
    role = "unplaced",
  ): HTMLElement => {
    const list = make("ul", "markup-attributes");
    for (const attribute of attributes) {
      const item = make("li", "markup-attribute");
      const info = disclosure(`attribute:${role}:${attribute.name}`, false);
      info.className = "markup-attribute-details";
      const summary = make("summary", "markup-attribute-heading");
      const problems = issues.filter(
        (issue) => issue.attribute === attribute.name && issue.severity === "error",
      );
      const missing = problems.filter((issue) => issue.code === "missing-attribute").length;
      const missingElement =
        elementCount === 0 &&
        issues.some((issue) => issue.code === "missing-element" || issue.code === "missing-root");
      const status = missingElement
        ? "Element missing"
        : elementCount === 0
          ? "Not present"
          : missing > 0
            ? `${missing} missing`
            : problems.length > 0
              ? "Invalid value"
              : `${attribute.elements.length} found`;
      const badge = make("span", "markup-result", status);
      badge.dataset.state =
        problems.length || missingElement
          ? "error"
          : attribute.elements.length
            ? "present"
            : "neutral";
      summary.append(
        make("code", "markup-attribute-name", attribute.name),
        make("span", "markup-required", attribute.required ? "Required" : "Optional"),
        badge,
      );
      const description = make("div", "markup-attribute-help");
      description.append(
        make("p", "muted", attribute.description),
        make("p", "markup-values", `Type: ${attribute.type}`),
      );
      const constraints = attribute.constraints;
      if (constraints) {
        const rules = [
          constraints.min === undefined ? undefined : `Minimum: ${constraints.min}`,
          constraints.max === undefined ? undefined : `Maximum: ${constraints.max}`,
          constraints.integer ? "Integer required" : undefined,
          constraints.format ? `Format: ${constraints.format}` : undefined,
          constraints.target ? `Must match a target in the ${constraints.target}` : undefined,
        ].filter(Boolean);
        if (rules.length) description.append(make("p", "markup-values", rules.join(" · ")));
      }
      if (attribute.condition)
        description.append(make("p", "markup-values", `When: ${attribute.condition}`));
      for (const problem of problems.slice(0, 3))
        description.append(make("p", "markup-problem", problem.message));
      if (attribute.values?.length)
        description.append(
          make(
            "p",
            "markup-values",
            `Values: ${attribute.values.map((value) => JSON.stringify(value)).join(", ")}`,
          ),
        );
      const target = problems.find((issue) => issue.element)?.element ?? attribute.elements[0];
      if (target) description.append(locate(target, problems.length ? "Locate" : "Locate first"));
      info.append(summary, description);
      item.append(info);
      list.append(item);
    }
    return list;
  };
  const used = new Set<string>();
  const errorCounts = new Map<DevToolsStructureInspection, number>();
  const errorCount = (node: DevToolsStructureInspection): number => {
    const cached = errorCounts.get(node);
    if (cached !== undefined) return cached;
    const count =
      node.issues.filter((issue) => issue.severity === "error").length +
      node.children.reduce((total, child) => total + errorCount(child), 0);
    errorCounts.set(node, count);
    return count;
  };
  const renderRole = (node: DevToolsStructureInspection): HTMLLIElement => {
    const branch = make("li", "markup-branch");
    const card = disclosure(`role:${node.id}`);
    card.dataset.role = node.id;
    const summary = make("summary", "markup-heading");
    const title = make("span", "markup-title", node.label);
    const relation =
      node.relationship === "root"
        ? "Root element"
        : node.relationship === "child"
          ? "Direct child"
          : node.relationship === "self"
            ? "On parent"
            : node.relationship === "self-or-descendant"
              ? "Parent or inside parent"
              : "Inside parent";
    title.append(
      make(
        "span",
        "markup-relation",
        `${relation}${node.relationship !== "root" ? ` · ${node.required ? "required" : "optional"}` : ""}`,
      ),
    );
    const errors = errorCount(node);
    const status = errors
      ? `${errors} issue${errors === 1 ? "" : "s"}`
      : node.inactiveCount && (node.activeCount ?? node.elements.length) === 0
        ? "Inactive"
        : node.elements.length
          ? `${node.elements.length} found`
          : node.relationship === "root"
            ? "Not used"
            : node.required
              ? "Parent missing"
              : "Optional";
    const badge = make("span", "markup-result", status);
    badge.dataset.state = errors ? "error" : node.elements.length ? "present" : "neutral";
    summary.append(title, badge);
    const body = make("div", "markup-body");
    if (node.scopeSelector)
      body.append(make("p", "markup-values", `Shared scope: closest ${node.scopeSelector}`));
    if (node.uniqueBy) body.append(make("p", "markup-values", `Unique key: ${node.uniqueBy}`));
    if (node.references)
      body.append(
        make(
          "p",
          "markup-values",
          `${node.references.attribute} matches ${node.references.target}.${node.references.targetAttribute}`,
        ),
      );
    if (node.minimum !== undefined && (node.minimum > 1 || node.maximum !== undefined))
      body.append(
        make(
          "p",
          "muted",
          `Matches per parent: ${node.minimum}${node.maximum === undefined ? " or more" : `–${node.maximum}`}`,
        ),
      );
    if (node.condition) body.append(make("p", "markup-values", `When: ${node.condition}`));
    if (node.inactiveCount)
      body.append(
        make(
          "p",
          "muted",
          `Not required in ${node.inactiveCount} inactive configuration${node.inactiveCount === 1 ? "" : "s"}.`,
        ),
      );
    if (!node.attributes.some((attribute) => node.selector === `[${attribute.name}]`))
      body.append(make("code", "markup-selector", node.selector));
    for (const issue of node.issues.filter((issue) => !issue.attribute).slice(0, 3)) {
      const message = make("p", "markup-problem", issue.message);
      if (issue.element) message.append(locate(issue.element, "Locate parent"));
      body.append(message);
    }
    node.attributes.forEach((attribute) => used.add(attribute.name));
    body.append(attributeList(node.attributes, node.issues, node.elements.length, node.id));
    if (node.children.length) {
      const children = make("ul", "markup-children");
      children.append(...node.children.map(renderRole));
      body.append(children);
    }
    card.append(summary, body);
    branch.append(card);
    return branch;
  };

  const section = make("section", "markup-section");
  section.setAttribute("aria-label", "Markup requirements");
  section.append(make("h3", "", "Markup requirements"));
  const tree = make("ul", "markup-tree");
  if (addon.structure) tree.append(renderRole(addon.structure));
  else if (addon.rootSelector) {
    // A legacy descendant rule supplies no deeper hierarchy: show one role per attribute.
    const rootAttributes = addon.attributes.filter((attribute) => attribute.placement === "root");
    tree.append(
      renderRole({
        id: "legacy-root",
        label: "Component root",
        selector: addon.rootSelector,
        relationship: "root",
        required: false,
        elements: addon.roots ?? [],
        missingParents: [],
        attributes: rootAttributes,
        issues: [],
        children: addon.attributes
          .filter((attribute) => attribute.placement === "descendant")
          .map((attribute) => ({
            id: `legacy:${attribute.name}`,
            label: attribute.name,
            selector: `[${attribute.name}]`,
            relationship: "descendant",
            required: attribute.required,
            elements: attribute.elements,
            missingParents: [],
            attributes: [attribute],
            children: [],
            issues: addon.issues.filter((issue) => issue.attribute === attribute.name),
          })),
      }),
    );
  }
  const unplaced = addon.attributes.filter((attribute) => !used.has(attribute.name));
  if (unplaced.length) {
    const branch = make("li", "markup-branch");
    const card = disclosure("unplaced");
    card.append(make("summary", "markup-heading", "Placement not documented"));
    const body = make("div", "markup-body");
    body.append(
      make(
        "p",
        "muted",
        "These attributes are declared, but their element roles and nesting are not specified.",
      ),
      attributeList(unplaced, addon.issues),
    );
    card.append(body);
    branch.append(card);
    tree.append(branch);
  }
  section.append(tree);
  if (!addon.attributes.length && !addon.structure)
    section.append(make("p", "muted", "No attribute metadata declared."));
  const usage = addon.usage;
  if (usage && (usage.setup.length || usage.markup || usage.notes?.length)) {
    const guide = disclosure("setup", false);
    guide.classList.add("setup-guide");
    guide.append(make("summary", "markup-heading", "Setup guide"));
    const body = make("div", "markup-body");
    if (usage.setup.length) {
      const steps = make("ol", "setup-steps");
      steps.append(...usage.setup.map((step) => make("li", "", step)));
      body.append(steps);
    }
    if (usage.markup) {
      const example = make("pre", "setup-markup");
      example.append(make("code", "", usage.markup));
      body.append(example);
    }
    for (const note of usage.notes ?? []) body.append(make("p", "muted", note));
    guide.append(body);
    section.append(guide);
  }
  return section;
}
