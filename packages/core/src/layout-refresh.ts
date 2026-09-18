export interface LayoutRefreshOptions {
  readonly root?: Document | HTMLElement;
  readonly debounceMs?: number;
  readonly observeImages?: boolean;
  readonly observeFonts?: boolean;
  readonly observeMutations?: boolean;
  readonly signal?: AbortSignal;
}

export interface LayoutRefreshGuard {
  schedule(): void;
  destroy(): void;
}

/**
 * Coalesces late image, font, and content changes into a project-supplied layout refresh.
 * Pass () => ScrollTrigger.refresh() in a GSAP integration. Nothing is installed on import.
 */
export function createLayoutRefreshGuard(
  refresh: () => void,
  options: LayoutRefreshOptions = {},
): LayoutRefreshGuard {
  const root =
    options.root ?? (typeof globalThis.document === "undefined" ? undefined : globalThis.document);
  if (!root) throw new Error("A document is required for layout refresh observation.");
  const document = root.nodeType === 9 ? (root as Document) : root.ownerDocument!;
  const window = document.defaultView;
  if (!window) throw new Error("A browser window is required for layout refresh observation.");
  const debounceMs = options.debounceMs ?? 80;
  if (!Number.isFinite(debounceMs) || debounceMs < 0) {
    throw new RangeError("Layout refresh debounceMs must be a non-negative finite number.");
  }
  let active = !options.signal?.aborted;
  let timer: number | undefined;
  let refreshing = false;
  let observer: MutationObserver | undefined;
  const decodedImages = new WeakSet<HTMLImageElement>();
  const fonts = document.fonts;

  const observe = (): void => {
    observer?.observe(root, { childList: true, subtree: true, characterData: true });
  };
  const schedule = (): void => {
    if (!active || refreshing) return;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!active) return;
      refreshing = true;
      // Pinning can move nodes synchronously. Do not turn our refresh into an observer loop.
      observer?.disconnect();
      try {
        refresh();
      } finally {
        refreshing = false;
        if (active) observe();
      }
    }, debounceMs);
  };

  const watchImages = (): void => {
    if (!active || !(options.observeImages ?? true)) return;
    const images = [...root.querySelectorAll<HTMLImageElement>("img")];
    if (root.nodeName === "IMG") images.push(root as HTMLImageElement);
    for (const image of images) {
      if (decodedImages.has(image) || !image.complete || typeof image.decode !== "function")
        continue;
      decodedImages.add(image);
      void image.decode().then(schedule, schedule);
    }
  };
  const onImage = (event: Event): void => {
    if ((event.target as Element | null)?.nodeName === "IMG") schedule();
  };
  const destroy = (): void => {
    active = false;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    observer?.disconnect();
    root.removeEventListener("load", onImage, true);
    root.removeEventListener("error", onImage, true);
    fonts?.removeEventListener("loadingdone", schedule);
    fonts?.removeEventListener("loadingerror", schedule);
    options.signal?.removeEventListener("abort", destroy);
  };

  if (active) {
    if (options.observeImages ?? true) {
      root.addEventListener("load", onImage, true);
      root.addEventListener("error", onImage, true);
      watchImages();
    }
    if ((options.observeFonts ?? true) && fonts) {
      void fonts.ready.then(schedule, schedule);
      fonts.addEventListener("loadingdone", schedule);
      fonts.addEventListener("loadingerror", schedule);
    }
    if ((options.observeMutations ?? true) && typeof window.MutationObserver === "function") {
      observer = new window.MutationObserver(() => {
        watchImages();
        schedule();
      });
      observe();
    }
    options.signal?.addEventListener("abort", destroy, { once: true });
  }
  return { schedule, destroy };
}
