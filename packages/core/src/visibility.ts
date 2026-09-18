export interface ElementVisibility {
  readonly target: Element;
  /** Intersects the configured margin and, by default, the page is visible. */
  readonly visible: boolean;
}

export interface ElementVisibilityOptions {
  readonly root?: Element | Document | null;
  readonly rootMargin?: string;
  readonly threshold?: number;
  readonly respectDocumentVisibility?: boolean;
  readonly signal?: AbortSignal;
}

/**
 * Observe elements for lazy initialization or animation pause/resume. The first notification is
 * paused while awaiting intersection. Without IntersectionObserver, elements activate eagerly.
 * No DOM or animation state is owned by this helper; the caller supplies that policy.
 */
export function observeElementVisibility(
  elements: Iterable<Element>,
  listener: (change: ElementVisibility) => void,
  options: ElementVisibilityOptions = {},
): () => void {
  const targets = [...new Set(elements)];
  if (targets.length === 0 || options.signal?.aborted) return () => {};
  const document = targets[0]!.ownerDocument;
  if (targets.some((target) => target.ownerDocument !== document)) {
    throw new TypeError("Visibility targets must belong to the same document.");
  }
  const threshold = options.threshold ?? 0;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError("Visibility threshold must be between 0 and 1.");
  }
  const Observer = document.defaultView?.IntersectionObserver;
  const intersections = new Map(targets.map((target) => [target, false]));
  const reported = new Map<Element, boolean>();
  let active = true;
  let observer: IntersectionObserver | undefined;

  const notify = (): void => {
    for (const [target, intersects] of intersections) {
      if (!active) break;
      const visible =
        intersects && (!(options.respectDocumentVisibility ?? true) || !document.hidden);
      if (reported.get(target) === visible) continue;
      reported.set(target, visible);
      listener({ target, visible });
    }
  };

  const destroy = (): void => {
    if (!active) return;
    active = false;
    observer?.disconnect();
    document.removeEventListener("visibilitychange", notify);
    options.signal?.removeEventListener("abort", destroy);
    intersections.clear();
    reported.clear();
  };

  try {
    if (typeof Observer === "function") {
      observer = new Observer(
        (entries) => {
          if (!active) return;
          for (const entry of entries) {
            if (intersections.has(entry.target)) {
              intersections.set(
                entry.target,
                entry.isIntersecting && entry.intersectionRatio >= threshold,
              );
            }
          }
          notify();
        },
        { root: options.root ?? null, rootMargin: options.rootMargin ?? "0px", threshold },
      );
      for (const target of targets) observer.observe(target);
    } else {
      for (const target of targets) intersections.set(target, true);
    }
    if (options.respectDocumentVisibility ?? true) {
      document.addEventListener("visibilitychange", notify);
    }
    options.signal?.addEventListener("abort", destroy, { once: true });
    // Consistently asynchronous, so callers can hold the cleanup before their first callback.
    queueMicrotask(() => {
      if (active) notify();
    });
  } catch (error) {
    destroy();
    throw error;
  }
  return destroy;
}

/** Activates once when the first target approaches the viewport, then releases all observers. */
export function observeViewportEntryOnce(
  elements: Iterable<Element>,
  onEnter: (target: Element) => void,
  options: ElementVisibilityOptions = {},
): () => void {
  const destroy = observeElementVisibility(
    elements,
    ({ target, visible }) => {
      if (!visible) return;
      destroy();
      onEnter(target);
    },
    { ...options, rootMargin: options.rootMargin ?? "400px 0px" },
  );
  return destroy;
}
