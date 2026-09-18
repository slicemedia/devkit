import { createEmitter } from "./emitter.js";
import type { Emitter } from "./emitter.js";
import { DevKitAggregateError } from "./errors.js";
import type { MaybePromise } from "./types.js";

export type DevKitConfig = Readonly<Record<string, unknown>>;

export interface RuntimeAddonRegistration<Value = unknown> {
  readonly name: string;
  readonly version: string;
  readonly value: Value;
}

export type RuntimeQueueTask = (runtime: DevKitRuntime) => MaybePromise<void>;

export type RuntimeReadyCallback<Value = unknown> = (
  addon: Value,
  runtime: DevKitRuntime,
) => MaybePromise<void>;

export type RuntimeQueueItem =
  | RuntimeQueueTask
  | { readonly type: "configure"; readonly config: DevKitConfig }
  | { readonly type: "register"; readonly addon: RuntimeAddonRegistration };

export interface DevKitRuntimeQueue {
  readonly length: number;
  readonly idle: Promise<void>;
  push(...items: readonly RuntimeQueueItem[]): number;
}

export interface RuntimeVersionConflict {
  readonly code: "VERSION_MISMATCH";
  readonly activeVersion: string;
  readonly requestedVersion: string;
  readonly detectedAt: string;
}

export interface RuntimeEventMap {
  readonly configured: {
    readonly previous: DevKitConfig;
    readonly current: DevKitConfig;
  };
  readonly registered: RuntimeAddonRegistration;
  readonly conflict: RuntimeVersionConflict;
  readonly error: { readonly item: RuntimeQueueItem; readonly error: unknown };
}

export interface DevKitRuntime {
  /** Registered addon APIs are also available by name to plain browser scripts. */
  readonly [name: string]: unknown;
  readonly kind: "slicemedia-devkit-runtime";
  readonly version: string;
  readonly config: DevKitConfig;
  readonly queue: DevKitRuntimeQueue;
  readonly ready: Promise<void>;
  readonly conflicts: readonly RuntimeVersionConflict[];
  readonly addons: readonly RuntimeAddonRegistration[];
  /** Includes pending and failed instances without making their APIs ready. */
  readonly inspectionAddons: readonly RuntimeAddonRegistration[];
  trackAddon<Value>(registration: RuntimeAddonRegistration<Value>): RuntimeAddonRegistration<Value>;
  configure(config: DevKitConfig): DevKitConfig;
  registerAddon<Value>(registration: RuntimeAddonRegistration<Value>): "registered" | "reused";
  getAddon<Value = unknown>(name: string): RuntimeAddonRegistration<Value> | undefined;
  /** One-shot, cancellable callback for an API registered by the project after initialization. */
  whenReady<Value = unknown>(name: string, callback: RuntimeReadyCallback<Value>): () => void;
  on<EventName extends keyof RuntimeEventMap>(
    event: EventName,
    listener: (payload: RuntimeEventMap[EventName]) => void,
  ): () => void;
  recordConflict(conflict: RuntimeVersionConflict): void;
}

export interface DevKitBootstrap {
  readonly config?: DevKitConfig;
  readonly queue?: readonly RuntimeQueueItem[];
}

export type DevKitGlobalValue = DevKitRuntime | DevKitBootstrap | RuntimeQueueItem[];

export interface DevKitHost {
  slicemediaDevKit?: DevKitGlobalValue;
}

export interface InstallRuntimeOptions {
  readonly version: string;
  readonly window?: DevKitHost;
  readonly config?: DevKitConfig;
  readonly queue?: readonly RuntimeQueueItem[];
}

export type RuntimeInstallResult =
  | { readonly status: "installed"; readonly runtime: DevKitRuntime }
  | { readonly status: "reused"; readonly runtime: DevKitRuntime }
  | {
      readonly status: "conflict";
      readonly runtime: DevKitRuntime;
      readonly conflict: RuntimeVersionConflict;
    };

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

function createDeferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  let rejectPromise: ((error: unknown) => void) | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
    reject: (error) => rejectPromise?.(error),
  };
}

class RuntimeQueueImplementation implements DevKitRuntimeQueue {
  private pending = 0;
  private chain: Promise<void> = Promise.resolve();
  private currentCycle: Deferred | undefined;
  private idlePromise: Promise<void> = Promise.resolve();
  private currentErrors: unknown[] = [];

  constructor(
    private readonly execute: (item: RuntimeQueueItem) => Promise<void>,
    private readonly onError: (item: RuntimeQueueItem, error: unknown) => void,
  ) {}

  get length(): number {
    return this.pending;
  }

  get idle(): Promise<void> {
    return this.idlePromise;
  }

  push(...items: readonly RuntimeQueueItem[]): number {
    if (items.length === 0) return this.pending;
    if (this.pending === 0) {
      this.currentCycle = createDeferred();
      this.idlePromise = this.currentCycle.promise;
      this.currentErrors = [];
      // Queue work is allowed to be fire-and-forget; consumers that care can await runtime.ready.
      void this.currentCycle.promise.catch(() => undefined);
    }

    for (const item of items) {
      this.pending += 1;
      this.chain = this.chain
        .then(async () => {
          try {
            await this.execute(item);
          } catch (error) {
            this.currentErrors.push(error);
            try {
              this.onError(item, error);
            } catch (notificationError) {
              this.currentErrors.push(notificationError);
            }
          }
        })
        .then(() => {
          this.pending -= 1;
          if (this.pending !== 0) return;
          const cycle = this.currentCycle;
          const errors = this.currentErrors;
          this.currentCycle = undefined;
          this.currentErrors = [];
          if (!cycle) return;
          if (errors.length === 1) cycle.reject(errors[0]);
          else if (errors.length > 1) {
            cycle.reject(new DevKitAggregateError(errors, "Runtime queue failed."));
          } else cycle.resolve();
        });
    }

    return this.pending;
  }
}

class DevKitRuntimeImplementation implements DevKitRuntime {
  readonly [name: string]: unknown;
  readonly kind = "slicemedia-devkit-runtime" as const;
  readonly version: string;
  readonly queue: DevKitRuntimeQueue;

  private currentConfig: DevKitConfig;
  private readonly conflictList: RuntimeVersionConflict[] = [];
  private readonly addonMap = new Map<string, RuntimeAddonRegistration>();
  private readonly inspectionMap = new Map<string, RuntimeAddonRegistration>();
  private readonly emitter: Emitter<RuntimeEventMap> = createEmitter<RuntimeEventMap>();

  constructor(version: string, config: DevKitConfig) {
    this.version = version;
    this.currentConfig = Object.freeze({ ...config });
    this.queue = new RuntimeQueueImplementation(
      (item) => this.execute(item),
      (item, error) => this.emitter.emit("error", { item, error }),
    );
  }

  get config(): DevKitConfig {
    return this.currentConfig;
  }

  get ready(): Promise<void> {
    return this.queue.idle;
  }

  get conflicts(): readonly RuntimeVersionConflict[] {
    return this.conflictList;
  }

  get addons(): readonly RuntimeAddonRegistration[] {
    return Object.freeze([...this.addonMap.values()]);
  }

  get inspectionAddons(): readonly RuntimeAddonRegistration[] {
    return Object.freeze([...new Map([...this.inspectionMap, ...this.addonMap]).values()]);
  }

  trackAddon<Value>(
    registration: RuntimeAddonRegistration<Value>,
  ): RuntimeAddonRegistration<Value> {
    if (!registration.name.trim() || !registration.version.trim())
      throw new TypeError("Inspection registrations require a name and version.");
    const existing =
      this.addonMap.get(registration.name) ?? this.inspectionMap.get(registration.name);
    if (existing) {
      if (existing.version !== registration.version)
        throw new Error(
          `Addon "${registration.name}" is already tracked at version ${existing.version}.`,
        );
      return existing as RuntimeAddonRegistration<Value>;
    }
    if (registration.name in this || ["then", "catch", "finally"].includes(registration.name))
      throw new TypeError(`Addon name "${registration.name}" is reserved by the runtime.`);
    const record = Object.freeze({ ...registration });
    this.inspectionMap.set(registration.name, record);
    return record;
  }

  configure(config: DevKitConfig): DevKitConfig {
    const previous = this.currentConfig;
    this.currentConfig = Object.freeze({ ...previous, ...config });
    this.emitter.emit("configured", { previous, current: this.currentConfig });
    return this.currentConfig;
  }

  registerAddon<Value>(registration: RuntimeAddonRegistration<Value>): "registered" | "reused" {
    if (registration.name.trim() === "" || registration.version.trim() === "") {
      throw new TypeError("Runtime addon registrations require a name and version.");
    }

    const existing = this.addonMap.get(registration.name);
    if (existing) {
      if (existing.version === registration.version) return "reused";
      throw new Error(
        `Addon "${registration.name}" is already registered at version ${existing.version}.`,
      );
    }

    const normalized = Object.freeze({ ...registration });
    if (registration.name in this || ["then", "catch", "finally"].includes(registration.name)) {
      throw new TypeError(`Addon name "${registration.name}" is reserved by the runtime.`);
    }
    Object.defineProperty(this, registration.name, {
      value: registration.value,
      enumerable: true,
      writable: false,
      configurable: false,
    });
    this.addonMap.set(registration.name, normalized);
    this.emitter.emit("registered", normalized);
    return "registered";
  }

  getAddon<Value = unknown>(name: string): RuntimeAddonRegistration<Value> | undefined {
    return this.addonMap.get(name) as RuntimeAddonRegistration<Value> | undefined;
  }

  whenReady<Value = unknown>(name: string, callback: RuntimeReadyCallback<Value>): () => void {
    if (name.trim() === "" || typeof callback !== "function") {
      throw new TypeError("whenReady requires an addon name and callback.");
    }
    let active = true;
    let unsubscribe = (): void => {};
    const deliver = (registration: RuntimeAddonRegistration): void => {
      if (!active || registration.name !== name) return;
      unsubscribe();
      this.queue.push(async () => {
        if (!active) return;
        active = false;
        await callback(registration.value as Value, this);
      });
    };
    const existing = this.getAddon(name);
    if (existing) deliver(existing);
    else unsubscribe = this.on("registered", deliver);
    return () => {
      active = false;
      unsubscribe();
    };
  }

  on<EventName extends keyof RuntimeEventMap>(
    event: EventName,
    listener: (payload: RuntimeEventMap[EventName]) => void,
  ): () => void {
    return this.emitter.on(event, listener);
  }

  recordConflict(conflict: RuntimeVersionConflict): void {
    if (
      this.conflictList.some(
        (candidate) =>
          candidate.activeVersion === conflict.activeVersion &&
          candidate.requestedVersion === conflict.requestedVersion,
      )
    ) {
      return;
    }
    this.conflictList.push(Object.freeze({ ...conflict }));
    this.emitter.emit("conflict", conflict);
  }

  private async execute(item: RuntimeQueueItem): Promise<void> {
    if (typeof item === "function") {
      await item(this);
      return;
    }
    if (item.type === "configure") {
      this.configure(item.config);
      return;
    }
    this.registerAddon(item.addon);
  }
}

function isRuntime(value: DevKitGlobalValue | undefined): value is DevKitRuntime {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "kind" in value &&
    value.kind === "slicemedia-devkit-runtime" &&
    "recordConflict" in value &&
    typeof value.recordConflict === "function"
  );
}

function resolveHost(explicitHost?: DevKitHost): DevKitHost {
  if (explicitHost) return explicitHost;
  if (typeof window === "undefined") {
    throw new Error("A browser window is required to install the Slice Media DevKit runtime.");
  }
  return window;
}

function readBootstrap(value: DevKitGlobalValue | undefined): {
  config: DevKitConfig;
  queue: readonly RuntimeQueueItem[];
} {
  if (value === undefined) return { config: {}, queue: [] };
  if (Array.isArray(value)) return { config: {}, queue: value };
  if (isRuntime(value)) return { config: {}, queue: [] };

  const queue = value.queue ?? [];
  if (!Array.isArray(queue))
    throw new TypeError("Slice Media DevKit bootstrap queue must be an array.");
  return { config: value.config ?? {}, queue };
}

/**
 * Explicitly installs the versioned global runtime. A different existing version is retained and
 * reported as a conflict; it is never overwritten.
 */
export function installDevKitRuntime(options: InstallRuntimeOptions): RuntimeInstallResult {
  if (options.version.trim() === "") throw new TypeError("Runtime version must not be empty.");
  const host = resolveHost(options.window);
  const existing = host.slicemediaDevKit;

  if (isRuntime(existing)) {
    if (existing.version !== options.version) {
      const conflict: RuntimeVersionConflict = Object.freeze({
        code: "VERSION_MISMATCH",
        activeVersion: existing.version,
        requestedVersion: options.version,
        detectedAt: new Date().toISOString(),
      });
      existing.recordConflict(conflict);
      return { status: "conflict", runtime: existing, conflict };
    }

    if (options.config) existing.configure(options.config);
    if (options.queue) existing.queue.push(...options.queue);
    return { status: "reused", runtime: existing };
  }

  const bootstrap = readBootstrap(existing);
  const runtime = new DevKitRuntimeImplementation(options.version, {
    ...bootstrap.config,
    ...options.config,
  });
  host.slicemediaDevKit = runtime;
  runtime.queue.push(...bootstrap.queue, ...(options.queue ?? []));
  return { status: "installed", runtime };
}

declare global {
  interface Window {
    slicemediaDevKit?: DevKitGlobalValue;
  }
}
