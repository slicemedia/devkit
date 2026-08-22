export interface ViewportSnapshot {
  readonly width: number;
  readonly height: number;
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly scale: number;
}

export interface ViewportObserverOptions {
  readonly window?: Window;
  readonly immediate?: boolean;
}

function snapshotsEqual(left: ViewportSnapshot, right: ViewportSnapshot): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.offsetLeft === right.offsetLeft &&
    left.offsetTop === right.offsetTop &&
    left.scale === right.scale
  );
}

export function getViewportSnapshot(targetWindow?: Window): ViewportSnapshot {
  const resolvedWindow = targetWindow ?? (typeof window === "undefined" ? undefined : window);
  if (!resolvedWindow) throw new Error("A browser window is required to read the viewport.");

  const visualViewport = resolvedWindow.visualViewport;
  return Object.freeze({
    width:
      visualViewport?.width ||
      resolvedWindow.document.documentElement.clientWidth ||
      resolvedWindow.innerWidth,
    height:
      visualViewport?.height ||
      resolvedWindow.document.documentElement.clientHeight ||
      resolvedWindow.innerHeight,
    offsetLeft: visualViewport?.offsetLeft ?? 0,
    offsetTop: visualViewport?.offsetTop ?? 0,
    scale: visualViewport?.scale ?? 1,
  });
}

/** Observes layout and visual viewport changes and returns an idempotent cleanup function. */
export function observeViewport(
  listener: (snapshot: ViewportSnapshot, previous: ViewportSnapshot | null) => void,
  options: ViewportObserverOptions = {},
): () => void {
  const targetWindow = options.window ?? (typeof window === "undefined" ? undefined : window);
  if (!targetWindow) throw new Error("A browser window is required to observe the viewport.");

  const visualViewport = targetWindow.visualViewport;
  let active = true;
  let snapshot = getViewportSnapshot(targetWindow);

  const update = () => {
    if (!active) return;
    const next = getViewportSnapshot(targetWindow);
    if (snapshotsEqual(snapshot, next)) return;
    const previous = snapshot;
    snapshot = next;
    listener(next, previous);
  };

  targetWindow.addEventListener("resize", update, { passive: true });
  targetWindow.addEventListener("orientationchange", update, { passive: true });
  visualViewport?.addEventListener("resize", update, { passive: true });
  visualViewport?.addEventListener("scroll", update, { passive: true });

  if (options.immediate ?? true) listener(snapshot, null);

  return () => {
    if (!active) return;
    active = false;
    targetWindow.removeEventListener("resize", update);
    targetWindow.removeEventListener("orientationchange", update);
    visualViewport?.removeEventListener("resize", update);
    visualViewport?.removeEventListener("scroll", update);
  };
}
