interface DrawerElements {
  panel: HTMLElement;
  header: HTMLElement;
  drawer: HTMLDetailsElement;
  summary: HTMLElement;
  content: HTMLElement;
  handle: HTMLElement;
}

/** Resizes only the drawer's scroll area; the panel and page keep their own geometry. */
export function bindDrawerResize(elements: DrawerElements): {
  refresh(): void;
  stopDragging(): void;
  cleanup(): void;
} {
  const { panel, header, drawer, summary, content, handle } = elements;
  const window = panel.ownerDocument.defaultView;
  let preferredHeight: number | undefined;
  let drag: { pointerId: number; startY: number; startHeight: number } | undefined;

  const bounds = (): { min: number; max: number } => {
    // Leave at least a third of small layouts, or 96px on larger ones, for the addon panes.
    const available = Math.max(
      0,
      panel.clientHeight - header.offsetHeight - summary.offsetHeight - 1,
    );
    const max = Math.floor(available - Math.min(96, available / 3));
    return { min: Math.min(64, max), max };
  };

  const stopDragging = (): void => {
    const pointerId = drag?.pointerId;
    drag = undefined;
    handle.classList.remove("resizing");
    if (pointerId !== undefined && handle.hasPointerCapture?.(pointerId)) {
      handle.releasePointerCapture(pointerId);
    }
  };

  const refresh = (): void => {
    if (panel.hidden || drawer.hidden || !drawer.open) {
      stopDragging();
      return;
    }
    const { min, max } = bounds();
    content.style.setProperty("--drawer-limit", `${max}px`);
    content.classList.toggle("resized", preferredHeight !== undefined);
    if (preferredHeight === undefined) content.style.removeProperty("height");
    else content.style.height = `${Math.max(min, Math.min(preferredHeight, max))}px`;
    const height = Math.round(content.getBoundingClientRect().height);
    handle.setAttribute("aria-valuemin", String(min));
    handle.setAttribute("aria-valuemax", String(max));
    handle.setAttribute("aria-valuenow", String(height));
    handle.setAttribute("aria-valuetext", `${height} pixels`);
  };

  const resize = (height: number): void => {
    const { min, max } = bounds();
    preferredHeight = Math.max(min, Math.min(height, max));
    refresh();
  };

  const reset = (): void => {
    preferredHeight = undefined;
    refresh();
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.isPrimary === false || !drawer.open) return;
    event.preventDefault();
    event.stopPropagation();
    refresh();
    handle.focus({ preventScroll: true });
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: content.getBoundingClientRect().height,
    };
    handle.setPointerCapture?.(event.pointerId);
    handle.classList.add("resizing");
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    resize(drag.startHeight + drag.startY - event.clientY);
  };

  const handlePointerEnd = (event: PointerEvent): void => {
    if (drag?.pointerId === event.pointerId) stopDragging();
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (!["ArrowUp", "ArrowDown", "Home", "End", "Enter"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const { min, max } = bounds();
    const step = event.shiftKey ? 40 : 10;
    if (event.key === "Enter") reset();
    else if (event.key === "Home") resize(min);
    else if (event.key === "End") resize(max);
    else resize(content.getBoundingClientRect().height + (event.key === "ArrowUp" ? step : -step));
  };

  handle.addEventListener("pointerdown", handlePointerDown);
  handle.addEventListener("pointermove", handlePointerMove);
  handle.addEventListener("pointerup", handlePointerEnd);
  handle.addEventListener("pointercancel", handlePointerEnd);
  handle.addEventListener("lostpointercapture", handlePointerEnd);
  handle.addEventListener("keydown", handleKeydown);
  handle.addEventListener("dblclick", reset);
  drawer.addEventListener("toggle", refresh);
  window?.addEventListener("resize", refresh);

  return {
    refresh,
    stopDragging,
    cleanup() {
      stopDragging();
      handle.removeEventListener("pointerdown", handlePointerDown);
      handle.removeEventListener("pointermove", handlePointerMove);
      handle.removeEventListener("pointerup", handlePointerEnd);
      handle.removeEventListener("pointercancel", handlePointerEnd);
      handle.removeEventListener("lostpointercapture", handlePointerEnd);
      handle.removeEventListener("keydown", handleKeydown);
      handle.removeEventListener("dblclick", reset);
      drawer.removeEventListener("toggle", refresh);
      window?.removeEventListener("resize", refresh);
    },
  };
}
