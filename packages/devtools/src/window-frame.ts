import type { DevToolsPreferences } from "./preferences.js";

interface FrameElements {
  document: Document;
  panel: HTMLElement;
  launcher: HTMLButtonElement;
  toolbar: HTMLElement;
  preferences: DevToolsPreferences;
  savePreferences(changes: DevToolsPreferences): void;
  onResize(): void;
}

type Edge = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
interface Drag {
  target: HTMLElement;
  pointerId: number;
  x: number;
  y: number;
  rect: DOMRect;
  edge?: Edge;
  changed: boolean;
}

const edgeNames: Record<Edge, string> = {
  n: "top",
  ne: "top right",
  e: "right",
  se: "bottom right",
  s: "bottom",
  sw: "bottom left",
  w: "left",
  nw: "top left",
};
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

/** Window geometry stays local; only an explicit size change persists preferences. */
export function bindWindowFrame(elements: FrameElements): {
  constrainPosition(): void;
  stopDragging(): void;
  cleanup(): void;
} {
  const { document, panel, launcher, toolbar, preferences, savePreferences, onResize } = elements;
  const window = document.defaultView!;
  let moved = false;
  let drag: Drag | undefined;
  let preferredWidth = preferences.width;
  let preferredHeight = preferences.height;

  const bounds = () => {
    const dockTop = launcher.getBoundingClientRect().top;
    return {
      left: 8,
      top: 8,
      right: Math.max(8, window.innerWidth - 8),
      bottom: Math.max(
        8,
        Math.min(window.innerHeight - 50, dockTop > 0 ? dockTop - 6 : window.innerHeight - 50),
      ),
    };
  };

  const position = (left: number, top: number): void => {
    const rect = panel.getBoundingClientRect();
    const limit = bounds();
    Object.assign(panel.style, {
      left: `${clamp(left, limit.left, limit.right - rect.width)}px`,
      top: `${clamp(top, limit.top, limit.bottom - rect.height)}px`,
      bottom: "auto",
      transform: "none",
    });
  };

  const constrainPosition = (): void => {
    if (panel.hidden) return;
    const rect = panel.getBoundingClientRect();
    const limit = bounds();
    const width = limit.right - limit.left;
    const height = limit.bottom - limit.top;
    if (preferredWidth !== undefined)
      panel.style.width = `${clamp(preferredWidth, Math.min(360, width), width)}px`;
    if (preferredHeight !== undefined)
      panel.style.height = `${clamp(preferredHeight, Math.min(240, height), height)}px`;
    if (moved) position(rect.left, rect.top);
    onResize();
  };

  const resize = (rect: DOMRect, edge: Edge, dx: number, dy: number): boolean => {
    const limit = bounds();
    let { left, right, top, bottom } = rect;
    if (edge.includes("w"))
      left = clamp(rect.left + dx, limit.left, right - Math.min(360, right - limit.left));
    if (edge.includes("e"))
      right = clamp(rect.right + dx, left + Math.min(360, limit.right - left), limit.right);
    if (edge.includes("n"))
      top = clamp(rect.top + dy, limit.top, bottom - Math.min(240, bottom - limit.top));
    if (edge.includes("s"))
      bottom = clamp(rect.bottom + dy, top + Math.min(240, limit.bottom - top), limit.bottom);
    const width = right - left;
    const height = bottom - top;
    const current = panel.getBoundingClientRect();
    if (width === current.width && height === current.height) return false;
    moved = true;
    Object.assign(panel.style, {
      left: `${left}px`,
      top: `${top}px`,
      bottom: "auto",
      transform: "none",
      width: `${width}px`,
      height: `${height}px`,
    });
    preferredWidth = width;
    preferredHeight = height;
    onResize();
    return true;
  };

  const saveSize = (): void => {
    if (preferredWidth !== undefined && preferredHeight !== undefined) {
      savePreferences({ width: preferredWidth, height: preferredHeight });
    }
  };

  const stopDragging = (): void => {
    const previous = drag;
    drag = undefined;
    toolbar.classList.remove("dragging");
    previous?.target.classList.remove("resizing");
    if (previous?.target.hasPointerCapture?.(previous.pointerId)) {
      previous.target.releasePointerCapture(previous.pointerId);
    }
  };

  const begin = (event: PointerEvent, target: HTMLElement, edge?: Edge): void => {
    if (event.button !== 0 || event.isPrimary === false || drag) return;
    event.preventDefault();
    drag = {
      target,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rect: panel.getBoundingClientRect(),
      changed: false,
      ...(edge ? { edge } : {}),
    };
    target.setPointerCapture?.(event.pointerId);
    target.classList.add(edge ? "resizing" : "dragging");
  };

  const handleMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.edge) {
      // Always calculate from the gesture's original rectangle to keep the opposite edge fixed.
      const changed = resize(drag.rect, drag.edge, event.clientX - drag.x, event.clientY - drag.y);
      drag.changed ||= changed;
    } else {
      moved = true;
      position(drag.rect.left + event.clientX - drag.x, drag.rect.top + event.clientY - drag.y);
    }
  };

  const handleEnd = (event: PointerEvent): void => {
    if (drag?.pointerId !== event.pointerId) return;
    if (event.type === "pointerup" && drag.edge && drag.changed) saveSize();
    stopDragging();
  };

  const handleToolbarDown = (event: PointerEvent): void => {
    if (
      event
        .composedPath()
        .some(
          (target) =>
            target instanceof window.Element &&
            target.matches("button, input, summary, a, .opacity-popover"),
        )
    )
      return;
    begin(event, toolbar);
  };

  const delta = (event: KeyboardEvent): [number, number] => {
    const distance = event.shiftKey ? 40 : 10;
    return [
      event.key === "ArrowRight" ? distance : event.key === "ArrowLeft" ? -distance : 0,
      event.key === "ArrowDown" ? distance : event.key === "ArrowUp" ? -distance : 0,
    ];
  };
  const handleToolbarKey = (event: KeyboardEvent): void => {
    if (event.target !== toolbar) return;
    const [dx, dy] = delta(event);
    if (!dx && !dy) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    moved = true;
    position(rect.left + dx, rect.top + dy);
  };

  const handles = (Object.keys(edgeNames) as Edge[]).map((edge) => {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = `window-resize window-resize-${edge}`;
    handle.setAttribute("aria-label", `Resize inspector from ${edgeNames[edge]}`);
    handle.title = `Resize from ${edgeNames[edge]} · Arrow keys adjust size`;
    const down = (event: PointerEvent): void => begin(event, handle, edge);
    const key = (event: KeyboardEvent): void => {
      const [dx, dy] = delta(event);
      if (!dx && !dy) return;
      event.preventDefault();
      if (resize(panel.getBoundingClientRect(), edge, dx, dy)) saveSize();
    };
    handle.addEventListener("pointerdown", down);
    handle.addEventListener("keydown", key);
    panel.append(handle);
    return { handle, down, key };
  });

  toolbar.addEventListener("pointerdown", handleToolbarDown);
  toolbar.addEventListener("keydown", handleToolbarKey);
  panel.addEventListener("pointermove", handleMove);
  panel.addEventListener("pointerup", handleEnd);
  panel.addEventListener("pointercancel", handleEnd);
  panel.addEventListener("lostpointercapture", handleEnd);
  window.addEventListener("resize", constrainPosition);

  return {
    constrainPosition,
    stopDragging,
    cleanup() {
      stopDragging();
      toolbar.removeEventListener("pointerdown", handleToolbarDown);
      toolbar.removeEventListener("keydown", handleToolbarKey);
      panel.removeEventListener("pointermove", handleMove);
      panel.removeEventListener("pointerup", handleEnd);
      panel.removeEventListener("pointercancel", handleEnd);
      panel.removeEventListener("lostpointercapture", handleEnd);
      window.removeEventListener("resize", constrainPosition);
      for (const { handle, down, key } of handles) {
        handle.removeEventListener("pointerdown", down);
        handle.removeEventListener("keydown", key);
        handle.remove();
      }
    },
  };
}
