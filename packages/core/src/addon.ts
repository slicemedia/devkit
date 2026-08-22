import { createEmitter } from "./emitter.js";
import { DevKitAggregateError } from "./errors.js";
import type {
  AddonDefinition,
  AddonDefinitionInput,
  AddonEnvironment,
  AddonEnvironmentInput,
  AddonInstance,
  AddonInstanceEventMap,
  AddonLifecycleHooks,
  AddonLifecycleMethod,
  AddonMetadata,
  AddonSetupContext,
  AddonStatus,
  Cleanup,
} from "./types.js";

const DEFAULT_LIFECYCLE = Object.freeze([
  "init",
  "refresh",
  "destroy",
  "setOptions",
  "getState",
  "on",
] satisfies readonly AddonLifecycleMethod[]);

const ADDON_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DATA_ATTRIBUTE_PATTERN = /^data-wft-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class AddonDefinitionError extends TypeError {
  override readonly name = "AddonDefinitionError";
}

export class AddonLifecycleError extends Error {
  override readonly name = "AddonLifecycleError";
}

function freezeOptions<Options extends object>(options: Options): Readonly<Options> {
  return Object.freeze({ ...options }) as Readonly<Options>;
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim() === "") throw new AddonDefinitionError(`${field} must not be empty.`);
}

/**
 * Defines and validates the complete static contract for an addon. This function does not access
 * browser globals and is safe to call from an ESM module at import time.
 */
export function defineAddon<
  const Options extends object,
  State = unknown,
  Events extends object = object,
>(input: AddonDefinitionInput<Options, State, Events>): AddonDefinition<Options, State, Events> {
  if (
    typeof input.defaultOptions !== "object" ||
    input.defaultOptions === null ||
    Array.isArray(input.defaultOptions)
  ) {
    throw new AddonDefinitionError("defaultOptions must be an object.");
  }
  if (typeof input.setup !== "function") {
    throw new AddonDefinitionError("setup must be a function.");
  }
  if (!ADDON_NAME_PATTERN.test(input.name)) {
    throw new AddonDefinitionError(
      `Addon name "${input.name}" must be a lowercase, hyphen-separated identifier.`,
    );
  }
  assertNonEmpty(input.version, "version");
  assertNonEmpty(input.description, "description");
  assertNonEmpty(input.entry, "entry");

  const seenAttributes = new Set<string>();
  const attributes = (input.attributes ?? []).map((attribute) => {
    if (!DATA_ATTRIBUTE_PATTERN.test(attribute.name)) {
      throw new AddonDefinitionError(
        `Addon attribute "${attribute.name}" must use lowercase data-wft-* terminology.`,
      );
    }
    if (seenAttributes.has(attribute.name)) {
      throw new AddonDefinitionError(`Addon attribute "${attribute.name}" is duplicated.`);
    }
    seenAttributes.add(attribute.name);
    return Object.freeze({
      ...attribute,
      ...(attribute.values ? { values: Object.freeze([...attribute.values]) } : {}),
    });
  });

  const seenOptions = new Set<string>();
  const options = (input.options ?? []).map((option) => {
    if (seenOptions.has(option.name)) {
      throw new AddonDefinitionError(`Addon option "${option.name}" is duplicated.`);
    }
    seenOptions.add(option.name);
    return Object.freeze({ ...option });
  });

  const dependencies = (input.dependencies ?? []).map((dependency) => {
    assertNonEmpty(dependency.name, "dependency name");
    return Object.freeze({ ...dependency });
  });

  const lifecycle = [...new Set(input.lifecycle ?? DEFAULT_LIFECYCLE)];

  return Object.freeze({
    name: input.name,
    version: input.version,
    description: input.description,
    attributes: Object.freeze(attributes),
    options: Object.freeze(options),
    defaultOptions: freezeOptions(input.defaultOptions),
    dependencies: Object.freeze(dependencies),
    placement: input.placement ?? "body-end",
    entry: input.entry,
    lifecycle: Object.freeze(lifecycle),
    setup: input.setup,
  });
}

/** Returns static, serializable addon information without executing its setup function. */
export function getAddonMetadata<Options extends object>(
  definition: AddonDefinition<Options, unknown, object>,
): AddonMetadata<Options> {
  return Object.freeze({
    name: definition.name,
    version: definition.version,
    description: definition.description,
    attributes: definition.attributes,
    options: definition.options,
    defaultOptions: definition.defaultOptions,
    dependencies: definition.dependencies,
    placement: definition.placement,
    entry: definition.entry,
    lifecycle: definition.lifecycle,
  });
}

function resolveEnvironment(input: AddonEnvironmentInput): AddonEnvironment {
  const ambientWindow = typeof window === "undefined" ? undefined : window;
  const ambientDocument = typeof document === "undefined" ? undefined : document;
  const resolvedWindow = input.window ?? input.document?.defaultView ?? ambientWindow;
  const resolvedDocument = input.document ?? input.window?.document ?? ambientDocument;

  if (!resolvedWindow || !resolvedDocument) {
    throw new AddonLifecycleError(
      "Addon initialization requires a browser window and document. Pass an explicit environment when testing.",
    );
  }

  return { window: resolvedWindow, document: resolvedDocument };
}

class AddonInstanceImplementation<
  Options extends object,
  State,
  Events extends object,
> implements AddonInstance<Options, State, Events> {
  readonly definition: AddonDefinition<Options, State, Events>;

  private readonly environmentInput: AddonEnvironmentInput;
  private readonly emitter = createEmitter<Record<PropertyKey, unknown>>();
  private currentStatus: AddonStatus = "idle";
  private currentOptions: Readonly<Options>;
  private hooks: AddonLifecycleHooks<Options, State> | undefined;
  private abortController: AbortController | undefined;
  private cleanupStack: Cleanup[] = [];
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    definition: AddonDefinition<Options, State, Events>,
    initialOptions: Partial<Options>,
    environmentInput: AddonEnvironmentInput,
  ) {
    this.definition = definition;
    this.environmentInput = environmentInput;
    this.currentOptions = freezeOptions({
      ...definition.defaultOptions,
      ...initialOptions,
    } as Options);
  }

  get status(): AddonStatus {
    return this.currentStatus;
  }

  get options(): Readonly<Options> {
    return this.currentOptions;
  }

  init(): Promise<void> {
    return this.enqueue(() => this.initialize());
  }

  refresh(): Promise<void> {
    return this.enqueue(async () => {
      if (this.currentStatus !== "ready" && !(this.currentStatus === "error" && this.hooks)) {
        throw new AddonLifecycleError(
          `Cannot refresh addon "${this.definition.name}" before it is initialized.`,
        );
      }

      this.setStatus("refreshing");
      try {
        await this.hooks?.refresh?.();
        this.setStatus("ready");
      } catch (error) {
        this.setStatus("error");
        this.emitCore("error", { operation: "refresh", error });
        throw error;
      }
    });
  }

  destroy(): Promise<void> {
    return this.enqueue(async () => {
      if (this.currentStatus === "destroyed") return;
      if (this.currentStatus === "idle") {
        this.setStatus("destroyed");
        return;
      }

      this.setStatus("destroying");
      const errors = await this.teardown(true);
      this.setStatus("destroyed");
      if (errors.length > 0) {
        const error = new DevKitAggregateError(
          errors,
          `Addon "${this.definition.name}" encountered errors while being destroyed.`,
        );
        this.emitCore("error", { operation: "destroy", error });
        throw error;
      }
    });
  }

  setOptions(next: Partial<Options>): Promise<void> {
    return this.enqueue(async () => {
      const previous = this.currentOptions;
      const current = freezeOptions({ ...previous, ...next } as Options);
      this.currentOptions = current;

      try {
        if (this.hooks) await this.hooks.setOptions?.(current, previous);
      } catch (error) {
        this.currentOptions = previous;
        this.emitCore("error", { operation: "setOptions", error });
        throw error;
      }

      this.emitCore("options", { previous, current });
    });
  }

  getState(): State | undefined {
    return this.hooks?.getState?.();
  }

  on<EventName extends keyof AddonInstanceEventMap<Options, Events>>(
    event: EventName,
    listener: (payload: AddonInstanceEventMap<Options, Events>[EventName]) => void,
  ): () => void {
    return this.emitter.on(event, listener as (payload: unknown) => void);
  }

  private enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async initialize(): Promise<void> {
    if (this.currentStatus === "ready") return;

    if (this.hooks || this.cleanupStack.length > 0 || this.abortController) {
      const teardownErrors = await this.teardown(true);
      if (teardownErrors.length > 0) {
        throw new DevKitAggregateError(
          teardownErrors,
          `Addon "${this.definition.name}" could not cleanly reset before initialization.`,
        );
      }
    }

    this.setStatus("initializing");
    this.abortController = new AbortController();

    try {
      const environment = resolveEnvironment(this.environmentInput);
      const context = this.createSetupContext(environment, this.abortController);
      this.hooks = await this.definition.setup(context);
      await this.hooks.init?.();
      this.setStatus("ready");
    } catch (initializationError) {
      const teardownErrors = await this.teardown(true);
      this.setStatus("error");
      const error =
        teardownErrors.length === 0
          ? initializationError
          : new DevKitAggregateError(
              [initializationError, ...teardownErrors],
              `Addon "${this.definition.name}" failed to initialize and clean up.`,
            );
      this.emitCore("error", { operation: "init", error });
      throw error;
    }
  }

  private createSetupContext(
    environment: AddonEnvironment,
    controller: AbortController,
  ): AddonSetupContext<Options, Events> {
    const getOptions = () => this.currentOptions;
    const emit = <EventName extends keyof Events>(event: EventName, payload: Events[EventName]) => {
      this.emitter.emit(event, payload);
    };
    const onCleanup = (cleanup: Cleanup) => {
      if (controller.signal.aborted) {
        throw new AddonLifecycleError("Cannot register cleanup after addon teardown.");
      }
      this.cleanupStack.push(cleanup);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const index = this.cleanupStack.indexOf(cleanup);
        if (index >= 0) this.cleanupStack.splice(index, 1);
      };
    };
    return {
      ...environment,
      get options() {
        return getOptions();
      },
      signal: controller.signal,
      emit,
      onCleanup,
    };
  }

  private async teardown(callDestroyHook: boolean): Promise<unknown[]> {
    const errors: unknown[] = [];

    if (callDestroyHook) {
      try {
        await this.hooks?.destroy?.();
      } catch (error) {
        errors.push(error);
      }
    }

    this.abortController?.abort();
    this.abortController = undefined;

    while (this.cleanupStack.length > 0) {
      const cleanup = this.cleanupStack.pop();
      if (!cleanup) continue;
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }

    this.hooks = undefined;
    return errors;
  }

  private setStatus(status: AddonStatus): void {
    if (status === this.currentStatus) return;
    const previous = this.currentStatus;
    this.currentStatus = status;
    this.emitCore("status", { previous, current: status });
  }

  private emitCore<EventName extends "status" | "error" | "options">(
    event: EventName,
    payload: AddonInstanceEventMap<Options, object>[EventName],
  ): void {
    this.emitter.emit(event, payload);
  }
}

/** Creates an inert addon instance. Browser work begins only when `init()` is called. */
export function createAddon<
  Options extends object,
  State = unknown,
  Events extends object = object,
>(
  definition: AddonDefinition<Options, State, Events>,
  initialOptions: Partial<Options> = {},
  environment: AddonEnvironmentInput = {},
): AddonInstance<Options, State, Events> {
  return new AddonInstanceImplementation(definition, initialOptions, environment);
}
