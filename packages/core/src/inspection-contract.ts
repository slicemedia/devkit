import type {
  AddonCondition,
  AddonInspectionContext,
  AddonValueConstraints,
} from "./inspection-types.js";
import type { AddonAttribute } from "./types.js";

/** Reject async providers without leaving an accidental rejected Promise unhandled. */
export function assertInspectionRecord(
  value: unknown,
  message: string,
): asserts value is Readonly<Record<string, unknown>> {
  if (
    value &&
    (typeof value === "object" || typeof value === "function") &&
    "then" in value &&
    typeof value.then === "function"
  ) {
    void Promise.resolve(value).catch(() => undefined);
    throw new TypeError(message);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(message);
}

export function readOptionPath(value: unknown, path: string): unknown {
  for (const key of path.split(".")) {
    if (!key || ["__proto__", "prototype", "constructor"].includes(key)) return undefined;
    if (!value || (typeof value !== "object" && typeof value !== "function")) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function freezeCondition(condition: AddonCondition, depth = 0): AddonCondition {
  if (!condition || typeof condition !== "object" || depth > 20)
    throw new TypeError("Inspection conditions must be a finite tree (maximum depth 20).");
  const keys = ["option", "attribute", "media", "all", "any", "not"].filter(
    (key) => key in condition,
  );
  if (keys.length !== 1) throw new TypeError("An inspection condition must declare one operation.");
  if ("all" in condition || "any" in condition) {
    const key = "all" in condition ? "all" : "any";
    const values = (
      condition as { all?: readonly AddonCondition[]; any?: readonly AddonCondition[] }
    )[key];
    if (!Array.isArray(values) || values.length === 0)
      throw new TypeError("Condition groups must not be empty.");
    return Object.freeze({
      [key]: Object.freeze(
        values.map((value: AddonCondition) => freezeCondition(value, depth + 1)),
      ),
    }) as AddonCondition;
  }
  if ("not" in condition) return Object.freeze({ not: freezeCondition(condition.not, depth + 1) });
  if ("media" in condition) {
    if (typeof condition.media !== "string" || !condition.media.trim())
      throw new TypeError("A media condition requires a query.");
  } else if ("attribute" in condition) {
    if (
      !/^data-wft-[a-z0-9-]+$/.test(condition.attribute) ||
      (condition.equals !== null && typeof condition.equals !== "string")
    )
      throw new TypeError(
        "Attribute conditions require a neutral hook and a string or null value.",
      );
  } else if ("option" in condition) {
    if (
      typeof condition.option !== "string" ||
      !condition.option.trim() ||
      (!["string", "number", "boolean"].includes(typeof condition.equals) &&
        condition.equals !== null) ||
      (typeof condition.equals === "number" && !Number.isFinite(condition.equals))
    )
      throw new TypeError("Option conditions require a path and a scalar value.");
  }
  return Object.freeze({ ...condition });
}

export function conditionMatches(
  condition: AddonCondition | undefined,
  context: Pick<AddonInspectionContext, "options" | "root" | "window">,
): boolean {
  if (!condition) return true;
  if ("all" in condition) return condition.all.every((value) => conditionMatches(value, context));
  if ("any" in condition) return condition.any.some((value) => conditionMatches(value, context));
  if ("not" in condition) return !conditionMatches(condition.not, context);
  if ("option" in condition)
    return readOptionPath(context.options, condition.option) === condition.equals;
  if ("attribute" in condition)
    return (context.root?.getAttribute(condition.attribute) ?? null) === condition.equals;
  if (typeof context.window.matchMedia !== "function")
    throw new Error("Media conditions cannot be evaluated in this environment.");
  return context.window.matchMedia(condition.media).matches;
}

export function validateConstraints(value: AddonValueConstraints): void {
  for (const key of ["min", "max"] as const)
    if (value[key] !== undefined && !Number.isFinite(value[key]))
      throw new TypeError(`${key} must be finite.`);
  if (value.min !== undefined && value.max !== undefined && value.min > value.max)
    throw new TypeError("min cannot exceed max.");
  if (value.integer !== undefined && typeof value.integer !== "boolean")
    throw new TypeError("integer must be boolean.");
  if (value.format !== undefined && !["css-length", "url", "json"].includes(value.format))
    throw new TypeError("Invalid value format.");
  if (value.target !== undefined && !["root", "document"].includes(value.target))
    throw new TypeError("Invalid selector target scope.");
}

/** Root overrides are opt-in via attribute.option. Custom parsers can replace this resolution. */
export function resolveInspectionOptions<Options extends object>(
  definition: {
    readonly attributes: readonly AddonAttribute[];
    resolveOptions?(context: AddonInspectionContext<Options>): Readonly<Options>;
  },
  context: AddonInspectionContext<Options>,
): Readonly<Options> {
  if (definition.resolveOptions) {
    const result = definition.resolveOptions(context);
    assertInspectionRecord(result, "resolveOptions must return a synchronous options object.");
    return Object.freeze({ ...result });
  }
  const options: Record<string, unknown> = { ...context.options };
  if (context.root)
    for (const attribute of definition.attributes) {
      if (!attribute.option || !context.root.hasAttribute(attribute.name)) continue;
      const value = context.root.getAttribute(attribute.name)!;
      options[attribute.option] =
        attribute.type === "number" && value.trim() !== "" && Number.isFinite(Number(value))
          ? Number(value)
          : attribute.type === "boolean" && ["", "true", "false"].includes(value)
            ? value !== "false"
            : value;
    }
  return Object.freeze(options) as Readonly<Options>;
}
