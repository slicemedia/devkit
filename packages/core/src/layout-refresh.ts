export interface LayoutRefreshOptions {
  readonly root?: Document | HTMLElement;
  readonly debounceMs?: number;
  readonly observeImages?: boolean;
  readonly observeFonts?: boolean;
  readonly observeMutations?: boolean;
  readonly refreshOnWindowLoad?: boolean;
  /** Additional settling passes after window.load, in milliseconds. Defaults to 300/1000/2000. */
  readonly loadDelays?: readonly number[];
  readonly refreshOnResize?: boolean;
  readonly signal?: AbortSignal;
  readonly onRefresh?: (diagnostic: LayoutRefreshDiagnostic) => void;
}

export interface LayoutRefreshDiagnostic {
  readonly status: "refreshed" | "skipped" | "error";
  readonly reasons: readonly string[];
  readonly timestamp: number;
  readonly error?: unknown;
}

export interface LayoutRefreshState {
  readonly active: boolean;
  readonly pendingReasons: readonly string[];
  readonly pendingLoadPasses: number;
  readonly observedImageCount: number;
  readonly refreshCount: number;
  readonly skippedCount: number;
  readonly errorCount: number;
  readonly lastRefresh: LayoutRefreshDiagnostic | undefined;
}

export interface LayoutRefreshGuard {
  schedule(reason?: string): void;
  refreshNow(reason?: string): void;
  getState(): LayoutRefreshState;
  destroy(): void;
}

/**
 * Opt-in coalescing of image, font, content and window-load settling changes.
 * Pass () => ScrollTrigger.refresh() for GSAP. Return false when a dependency is unavailable;
 * diagnostics record a skipped pass. No listeners, timers or globals are installed on import.
 */
export function createLayoutRefreshGuard(
  refresh: () => void | boolean,
  options: LayoutRefreshOptions = {},
): LayoutRefreshGuard {
  const root =
    options.root ?? (typeof globalThis.document === "undefined" ? undefined : globalThis.document);
  if (!root) throw new Error("A document is required for layout refresh observation.");
  const document = root.nodeType === 9 ? (root as Document) : root.ownerDocument!;
  const window = document.defaultView;
  if (!window) throw new Error("A browser window is required for layout refresh observation.");
  const debounceMs = options.debounceMs ?? 80;
  const loadDelays = [...(options.loadDelays ?? [300, 1000, 2000])];
  for (const delay of [debounceMs, ...loadDelays]) {
    if (!Number.isFinite(delay) || delay < 0)
      throw new RangeError("Layout refresh delays must be non-negative finite numbers.");
  }
  let active = !options.signal?.aborted;
  let timer: number | undefined;
  let refreshing = false;
  let observer: MutationObserver | undefined;
  let observedImageCount = 0;
  let refreshCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let lastRefresh: LayoutRefreshDiagnostic | undefined;
  const pendingReasons = new Set<string>();
  const loadTimers = new Set<number>();
  const seenImages = new WeakSet<HTMLImageElement>();
  const decodedImages = new WeakSet<HTMLImageElement>();
  const fonts = document.fonts;

  const observe = (): void => {
    observer?.observe(root, { childList: true, subtree: true, characterData: true });
  };
  const runRefresh = (): void => {
    if (!active || refreshing) return;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    const reasons = Object.freeze([...pendingReasons]);
    pendingReasons.clear();
    refreshing = true;
    // Pinning can move nodes synchronously. Do not observe the refresh's own mutations.
    observer?.disconnect();
    try {
      const result = refresh();
      const status = result === false ? "skipped" : "refreshed";
      if (result === false) skippedCount += 1;
      else refreshCount += 1;
      lastRefresh = Object.freeze({ status, reasons, timestamp: Date.now() });
    } catch (error) {
      errorCount += 1;
      lastRefresh = Object.freeze({ status: "error", reasons, timestamp: Date.now(), error });
    } finally {
      refreshing = false;
      if (active) observe();
    }
    options.onRefresh?.(lastRefresh!);
  };
  const schedule = (reason = "manual"): void => {
    if (!active || refreshing) return;
    pendingReasons.add(reason);
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(runRefresh, debounceMs);
  };
  const watchImages = (): void => {
    if (!active || !(options.observeImages ?? true)) return;
    const images = [...root.querySelectorAll<HTMLImageElement>("img")];
    if (root.nodeName === "IMG") images.push(root as HTMLImageElement);
    for (const image of images) {
      if (!seenImages.has(image)) {
        seenImages.add(image);
        observedImageCount += 1;
      }
      if (decodedImages.has(image) || !image.complete || typeof image.decode !== "function")
        continue;
      decodedImages.add(image);
      void image.decode().then(
        () => schedule("image-decode"),
        () => schedule("image-decode-error"),
      );
    }
  };
  const onImage = (event: Event): void => {
    if ((event.target as Element | null)?.nodeName !== "IMG") return;
    watchImages();
    schedule(`image-${event.type}`);
  };
  const onFonts = (event: Event): void => schedule(`fonts-${event.type}`);
  const onResize = (): void => schedule("resize");
  const onWindowLoad = (): void => {
    if (!active) return;
    window.removeEventListener("load", onWindowLoad);
    schedule("window-load");
    for (const delay of loadDelays) {
      const id = window.setTimeout(() => {
        loadTimers.delete(id);
        schedule(`window-load+${delay}ms`);
      }, delay);
      loadTimers.add(id);
    }
  };
  const destroy = (): void => {
    active = false;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    for (const id of loadTimers) window.clearTimeout(id);
    loadTimers.clear();
    pendingReasons.clear();
    observer?.disconnect();
    root.removeEventListener("load", onImage, true);
    root.removeEventListener("error", onImage, true);
    window.removeEventListener("load", onWindowLoad);
    window.removeEventListener("resize", onResize);
    fonts?.removeEventListener("loadingdone", onFonts);
    fonts?.removeEventListener("loadingerror", onFonts);
    options.signal?.removeEventListener("abort", destroy);
  };

  if (active) {
    if (options.observeImages ?? true) {
      root.addEventListener("load", onImage, true);
      root.addEventListener("error", onImage, true);
      watchImages();
    }
    if ((options.observeFonts ?? true) && fonts) {
      void fonts.ready.then(
        () => schedule("fonts-ready"),
        () => schedule("fonts-error"),
      );
      fonts.addEventListener("loadingdone", onFonts);
      fonts.addEventListener("loadingerror", onFonts);
    }
    if ((options.observeMutations ?? true) && typeof window.MutationObserver === "function") {
      observer = new window.MutationObserver(() => {
        watchImages();
        schedule("mutation");
      });
      observe();
    }
    if (options.refreshOnWindowLoad ?? true) {
      if (document.readyState === "complete") onWindowLoad();
      else window.addEventListener("load", onWindowLoad, { once: true });
    }
    if (options.refreshOnResize) window.addEventListener("resize", onResize, { passive: true });
    options.signal?.addEventListener("abort", destroy, { once: true });
  }
  return {
    schedule,
    refreshNow(reason = "manual") {
      if (!active || refreshing) return;
      pendingReasons.add(reason);
      runRefresh();
    },
    getState: () =>
      Object.freeze({
        active,
        pendingReasons: Object.freeze([...pendingReasons]),
        pendingLoadPasses: loadTimers.size,
        observedImageCount,
        refreshCount,
        skippedCount,
        errorCount,
        lastRefresh,
      }),
    destroy,
  };
}
