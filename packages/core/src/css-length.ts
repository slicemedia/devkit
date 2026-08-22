export type CssLengthAxis = "width" | "height";

export interface CssLengthContext {
  readonly axis?: CssLengthAxis;
  readonly relativeTo?: number;
  readonly fontSize?: number;
  readonly rootFontSize?: number;
  readonly element?: Element;
  readonly window?: Window;
}

const CSS_LENGTH_PATTERN =
  /^([+-]?(?:\d+\.?\d*|\.\d+))(px|rem|em|vw|vh|vmin|vmax|%|in|cm|mm|q|pt|pc)?$/i;

function finiteOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function readFontSize(
  targetWindow: Window | undefined,
  element: Element | undefined,
): number | undefined {
  if (!targetWindow || !element) return undefined;
  const parsed = Number.parseFloat(targetWindow.getComputedStyle(element).fontSize);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Resolves common CSS length units to CSS pixels, returning null for invalid/unsupported input. */
export function resolveCssLength(
  value: string | number,
  context: CssLengthContext = {},
): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const match = CSS_LENGTH_PATTERN.exec(value.trim());
  if (!match) return null;
  const numericValue = Number(match[1]);
  if (!Number.isFinite(numericValue)) return null;

  const unit = (match[2]?.toLowerCase() ?? "") as Lowercase<string>;
  if (unit === "px" || (unit === "" && numericValue === 0)) return numericValue;
  if (unit === "") return null;

  const targetWindow = context.window ?? context.element?.ownerDocument.defaultView ?? undefined;
  const viewportWidth = targetWindow?.innerWidth;
  const viewportHeight = targetWindow?.innerHeight;

  switch (unit) {
    case "rem": {
      const documentElement =
        context.element?.ownerDocument.documentElement ?? targetWindow?.document.documentElement;
      const rootSize =
        finiteOrUndefined(context.rootFontSize) ??
        readFontSize(targetWindow, documentElement) ??
        16;
      return numericValue * rootSize;
    }
    case "em": {
      const size =
        finiteOrUndefined(context.fontSize) ??
        readFontSize(targetWindow, context.element) ??
        finiteOrUndefined(context.rootFontSize) ??
        16;
      return numericValue * size;
    }
    case "%": {
      let relativeTo = finiteOrUndefined(context.relativeTo);
      const parent = context.element?.parentElement;
      if (relativeTo === undefined && parent) {
        relativeTo = context.axis === "height" ? parent.clientHeight : parent.clientWidth;
      }
      return relativeTo === undefined ? null : (numericValue / 100) * relativeTo;
    }
    case "vw":
      return viewportWidth === undefined ? null : (numericValue / 100) * viewportWidth;
    case "vh":
      return viewportHeight === undefined ? null : (numericValue / 100) * viewportHeight;
    case "vmin":
      return viewportWidth === undefined || viewportHeight === undefined
        ? null
        : (numericValue / 100) * Math.min(viewportWidth, viewportHeight);
    case "vmax":
      return viewportWidth === undefined || viewportHeight === undefined
        ? null
        : (numericValue / 100) * Math.max(viewportWidth, viewportHeight);
    case "in":
      return numericValue * 96;
    case "cm":
      return (numericValue * 96) / 2.54;
    case "mm":
      return (numericValue * 96) / 25.4;
    case "q":
      return (numericValue * 96) / 101.6;
    case "pt":
      return (numericValue * 96) / 72;
    case "pc":
      return numericValue * 16;
    default:
      return null;
  }
}
