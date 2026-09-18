import type { AddonAttribute } from "@slicemedia/devkit-core";
import type { AddonValueConstraints } from "@slicemedia/devkit-core";

export function valueConstraints(attribute: AddonValueConstraints): AddonValueConstraints {
  return Object.fromEntries(
    Object.entries(attribute).filter(([key]) =>
      ["min", "max", "integer", "format", "target"].includes(key),
    ),
  );
}

export function valueProblem(
  attribute: AddonAttribute,
  value: string,
  document: Document,
  root?: Element,
): string | undefined {
  if (attribute.values) {
    return attribute.values.includes(value)
      ? undefined
      : `expected one of ${attribute.values.map((entry) => JSON.stringify(entry)).join(", ")}.`;
  }
  if (attribute.min !== undefined && Number(value) < attribute.min)
    return `expected at least ${attribute.min}.`;
  if (attribute.max !== undefined && Number(value) > attribute.max)
    return `expected at most ${attribute.max}.`;
  if (attribute.integer && !Number.isInteger(Number(value))) return "expected an integer.";
  if (attribute.format === "json") {
    try {
      JSON.parse(value);
    } catch {
      return "expected valid JSON.";
    }
  }
  if (attribute.format === "url") {
    try {
      const url = new URL(value, document.baseURI);
      if (!value.trim() || !["http:", "https:"].includes(url.protocol))
        return "expected an HTTP(S) URL.";
    } catch {
      return "expected a URL.";
    }
  }
  if (attribute.format === "css-length") {
    const style = document.createElement("span").style;
    style.marginLeft = value;
    if (!value.trim() || !style.marginLeft || /^(auto|inherit|initial|unset|revert)/u.test(value))
      return "expected a CSS length.";
  }
  switch (attribute.type) {
    case "number":
      return value.trim() !== "" && Number.isFinite(Number(value))
        ? undefined
        : "expected a finite number.";
    case "boolean":
      return ["", "true", "false"].includes(value)
        ? undefined
        : 'expected an empty marker, "true", or "false"; declare values for other conventions.';
    case "selector":
      try {
        const scope = attribute.target === "root" ? root : document;
        const matches =
          scope?.querySelector(value) ||
          (scope?.nodeType === 1 && (scope as Element).matches(value));
        if (attribute.target && !matches)
          return `selector matches no target in the ${attribute.target}.`;
        return undefined;
      } catch {
        return "expected a valid CSS selector.";
      }
    default:
      return undefined;
  }
}
