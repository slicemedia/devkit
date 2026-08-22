export const WEBFLOW_BREAKPOINTS = Object.freeze({
  tiny: 0,
  small: 480,
  medium: 768,
  main: 992,
});

export type WebflowBreakpoint = keyof typeof WEBFLOW_BREAKPOINTS;

export type WebflowBreakpointMap = Readonly<Record<WebflowBreakpoint, number>>;

export interface BreakpointSnapshot {
  readonly name: WebflowBreakpoint;
  readonly width: number;
  readonly minWidth: number;
  readonly maxWidth: number | null;
}

export interface BreakpointSubscriptionOptions {
  readonly immediate?: boolean;
}

export interface BreakpointService {
  getSnapshot(): BreakpointSnapshot;
  isAtLeast(breakpoint: WebflowBreakpoint): boolean;
  subscribe(
    listener: (snapshot: BreakpointSnapshot, previous: BreakpointSnapshot | null) => void,
    options?: BreakpointSubscriptionOptions,
  ): () => void;
  refresh(): BreakpointSnapshot;
  destroy(): void;
}

export interface BreakpointServiceOptions {
  readonly window?: Window;
  readonly breakpoints?: WebflowBreakpointMap;
}

const BREAKPOINT_ORDER = ["tiny", "small", "medium", "main"] as const;

function validateBreakpoints(breakpoints: WebflowBreakpointMap): void {
  let previous = -Infinity;
  for (const name of BREAKPOINT_ORDER) {
    const value = breakpoints[name];
    if (!Number.isFinite(value) || value < 0 || value <= previous) {
      throw new RangeError("Webflow breakpoint minimum widths must be finite and ascending.");
    }
    previous = value;
  }
  if (breakpoints.tiny !== 0) {
    throw new RangeError("The Webflow tiny breakpoint must start at 0px.");
  }
}

export function getWebflowBreakpoint(
  width: number,
  breakpoints: WebflowBreakpointMap = WEBFLOW_BREAKPOINTS,
): BreakpointSnapshot {
  if (!Number.isFinite(width) || width < 0) {
    throw new RangeError("Viewport width must be a finite, non-negative number.");
  }
  validateBreakpoints(breakpoints);

  let index = 0;
  for (let candidate = 1; candidate < BREAKPOINT_ORDER.length; candidate += 1) {
    const name = BREAKPOINT_ORDER[candidate];
    if (name && width >= breakpoints[name]) index = candidate;
  }

  const name = BREAKPOINT_ORDER[index] ?? "tiny";
  const nextName = BREAKPOINT_ORDER[index + 1];
  return Object.freeze({
    name,
    width,
    minWidth: breakpoints[name],
    maxWidth: nextName ? breakpoints[nextName] - 1 : null,
  });
}

/** Creates a lazily-listening service for Webflow's native main/medium/small/tiny ranges. */
export function createBreakpointService(options: BreakpointServiceOptions = {}): BreakpointService {
  const targetWindow = options.window ?? (typeof window === "undefined" ? undefined : window);
  if (!targetWindow) throw new Error("A browser window is required to observe breakpoints.");

  const breakpoints = options.breakpoints ?? WEBFLOW_BREAKPOINTS;
  validateBreakpoints(breakpoints);
  let snapshot = getWebflowBreakpoint(targetWindow.innerWidth, breakpoints);
  let listening = false;
  let destroyed = false;
  const listeners = new Set<
    (snapshot: BreakpointSnapshot, previous: BreakpointSnapshot | null) => void
  >();

  const refresh = (): BreakpointSnapshot => {
    if (destroyed) return snapshot;
    const next = getWebflowBreakpoint(targetWindow.innerWidth, breakpoints);
    const previous = snapshot;
    snapshot = next;
    if (next.name !== previous.name) {
      for (const listener of [...listeners]) listener(next, previous);
    }
    return snapshot;
  };

  const start = () => {
    if (listening || destroyed) return;
    listening = true;
    targetWindow.addEventListener("resize", refresh, { passive: true });
  };

  const stop = () => {
    if (!listening) return;
    listening = false;
    targetWindow.removeEventListener("resize", refresh);
  };

  return {
    getSnapshot: () => snapshot,
    isAtLeast: (breakpoint) => snapshot.width >= breakpoints[breakpoint],
    subscribe(listener, subscriptionOptions = {}) {
      if (destroyed) throw new Error("Cannot subscribe to a destroyed breakpoint service.");
      listeners.add(listener);
      start();
      if (subscriptionOptions.immediate ?? true) listener(snapshot, null);

      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      listeners.clear();
    },
  };
}
