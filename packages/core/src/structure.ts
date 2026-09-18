import type { AddonStructureNode } from "./types.js";
import { freezeCondition, readOptionPath } from "./inspection-contract.js";

/** Validate and copy serializable markup metadata without accessing a browser or running code. */
export function freezeStructure<Key extends string>(
  structure: AddonStructureNode<Key>,
  attributes: ReadonlySet<string>,
  defaults: object,
): AddonStructureNode<Key> {
  const ids = new Set<string>();
  const ancestors = new Set<AddonStructureNode<Key>>();
  const references: string[] = [];
  const visit = (node: AddonStructureNode<Key>, root = false): AddonStructureNode<Key> => {
    if (!node || ancestors.has(node))
      throw new TypeError("Markup structure must be an acyclic tree.");
    if (typeof node.id !== "string" || !node.id.trim() || ids.has(node.id))
      throw new TypeError("Markup structure node IDs must be non-empty and unique.");
    ids.add(node.id);
    ancestors.add(node);
    if (
      typeof node.label !== "string" ||
      !node.label.trim() ||
      typeof node.selector !== "string" ||
      !node.selector.trim()
    )
      throw new TypeError(`Markup role ${node.id} needs a label and selector.`);
    if (
      node.relationship !== undefined &&
      !["child", "descendant", "self", "self-or-descendant"].includes(node.relationship)
    )
      throw new TypeError(`Invalid relationship for markup role ${node.id}.`);
    if (node.required !== undefined && typeof node.required !== "boolean")
      throw new TypeError(`Invalid requirement for markup role ${node.id}.`);
    if (
      node.selectorOption !== undefined &&
      typeof readOptionPath(defaults, node.selectorOption) !== "string"
    )
      throw new TypeError(`Markup role ${node.id} must reference a string selector option.`);
    for (const value of [node.min, node.max])
      if (value !== undefined && (!Number.isInteger(value) || value < 0))
        throw new TypeError("Role counts must be non-negative integers.");
    if (node.max !== undefined && (node.min ?? ((node.required ?? !root) ? 1 : 0)) > node.max)
      throw new TypeError("Role min cannot exceed max.");
    if (
      node.scopeSelector !== undefined &&
      (typeof node.scopeSelector !== "string" || !node.scopeSelector.trim())
    )
      throw new TypeError("A shared scope requires a selector.");
    if (node.uniqueBy && !attributes.has(node.uniqueBy))
      throw new TypeError("Unique keys must name a declared attribute.");
    if (node.references) {
      if (
        !attributes.has(node.references.attribute) ||
        !attributes.has(node.references.targetAttribute)
      )
        throw new TypeError("References must name declared attributes.");
      references.push(node.references.target);
    }
    if (
      !Array.isArray(node.attributes) ||
      (node.children !== undefined && !Array.isArray(node.children))
    )
      throw new TypeError(`Invalid attributes or children for markup role ${node.id}.`);
    const names = new Set<string>();
    const rules = node.attributes.map((rule) => {
      if (
        !rule ||
        !attributes.has(rule.name) ||
        names.has(rule.name) ||
        (rule.required !== undefined && typeof rule.required !== "boolean")
      )
        throw new TypeError(
          `Markup role ${node.id} must reference declared attributes once per role.`,
        );
      names.add(rule.name);
      return Object.freeze({ ...rule, ...(rule.when ? { when: freezeCondition(rule.when) } : {}) });
    });
    const children = node.children?.map((child) => visit(child));
    ancestors.delete(node);
    return Object.freeze({
      ...node,
      ...(node.when ? { when: freezeCondition(node.when) } : {}),
      ...(node.references ? { references: Object.freeze({ ...node.references }) } : {}),
      attributes: Object.freeze(rules),
      ...(children ? { children: Object.freeze(children) } : {}),
    });
  };
  const result = visit(structure, true);
  for (const target of references)
    if (!ids.has(target)) throw new TypeError(`Unknown referenced role: ${target}.`);
  return result;
}
