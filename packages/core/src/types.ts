export type MaybePromise<Value> = Value | PromiseLike<Value>;

export type Cleanup = () => MaybePromise<void>;

export type DataWftAttribute = `data-wft-${string}`;

export type AddonPlacement = "head" | "body-end";

export type AddonLifecycleMethod =
  "init" | "refresh" | "destroy" | "setOptions" | "getState" | "on";

export type AddonValueType = "boolean" | "number" | "string" | "selector" | "enum";

export interface AddonAttribute<OptionKey extends string = string> {
  readonly name: DataWftAttribute;
  readonly description: string;
  readonly type: AddonValueType;
  readonly option?: OptionKey;
  readonly required?: boolean;
  readonly values?: readonly string[];
}

export interface AddonOptionMetadata<OptionKey extends string = string> {
  readonly name: OptionKey;
  readonly description: string;
  readonly type: AddonValueType;
  readonly required?: boolean;
}

export type AddonDependencyKind = "package" | "script" | "style";

export interface AddonDependency {
  readonly name: string;
  readonly version?: string;
  readonly kind?: AddonDependencyKind;
  readonly optional?: boolean;
}

export type AddonStatus =
  "idle" | "initializing" | "ready" | "refreshing" | "destroying" | "destroyed" | "error";

export interface AddonEnvironment {
  readonly window: Window;
  readonly document: Document;
}

export interface AddonEnvironmentInput {
  readonly window?: Window;
  readonly document?: Document;
}

export interface AddonSetupContext<
  Options extends object,
  Events extends object = object,
> extends AddonEnvironment {
  readonly options: Readonly<Options>;
  readonly signal: AbortSignal;
  emit<EventName extends keyof Events>(event: EventName, payload: Events[EventName]): void;
  onCleanup(cleanup: Cleanup): () => void;
}

export interface AddonLifecycleHooks<Options extends object, State = unknown> {
  init?(): MaybePromise<void>;
  refresh?(): MaybePromise<void>;
  destroy?(): MaybePromise<void>;
  setOptions?(next: Readonly<Options>, previous: Readonly<Options>): MaybePromise<void>;
  getState?(): State;
}

export interface AddonMetadata<Options extends object> {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly attributes: readonly AddonAttribute<Extract<keyof Options, string>>[];
  readonly options: readonly AddonOptionMetadata<Extract<keyof Options, string>>[];
  readonly defaultOptions: Readonly<Options>;
  readonly dependencies: readonly AddonDependency[];
  readonly placement: AddonPlacement;
  readonly entry: string;
  readonly lifecycle: readonly AddonLifecycleMethod[];
}

export interface AddonDefinition<
  Options extends object,
  State = unknown,
  Events extends object = object,
> extends AddonMetadata<Options> {
  setup(
    context: AddonSetupContext<Options, Events>,
  ): MaybePromise<AddonLifecycleHooks<Options, State>>;
}

export interface AddonDefinitionInput<
  Options extends object,
  State = unknown,
  Events extends object = object,
> {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly attributes?: readonly AddonAttribute<Extract<keyof Options, string>>[];
  readonly options?: readonly AddonOptionMetadata<Extract<keyof Options, string>>[];
  readonly defaultOptions: Options;
  readonly dependencies?: readonly AddonDependency[];
  readonly placement?: AddonPlacement;
  readonly entry: string;
  readonly lifecycle?: readonly AddonLifecycleMethod[];
  setup(
    context: AddonSetupContext<Options, Events>,
  ): MaybePromise<AddonLifecycleHooks<Options, State>>;
}

export interface AddonStatusChange {
  readonly previous: AddonStatus;
  readonly current: AddonStatus;
}

export interface AddonErrorEvent {
  readonly operation: Exclude<AddonLifecycleMethod, "getState" | "on">;
  readonly error: unknown;
}

export interface AddonOptionsChange<Options extends object> {
  readonly previous: Readonly<Options>;
  readonly current: Readonly<Options>;
}

export type AddonInstanceEventMap<Options extends object, Events extends object> = Events & {
  readonly status: AddonStatusChange;
  readonly error: AddonErrorEvent;
  readonly options: AddonOptionsChange<Options>;
};

export interface AddonInstance<
  Options extends object,
  State = unknown,
  Events extends object = object,
> {
  readonly definition: AddonDefinition<Options, State, Events>;
  readonly status: AddonStatus;
  readonly options: Readonly<Options>;
  init(): Promise<void>;
  refresh(): Promise<void>;
  destroy(): Promise<void>;
  setOptions(options: Partial<Options>): Promise<void>;
  getState(): State | undefined;
  on<EventName extends keyof AddonInstanceEventMap<Options, Events>>(
    event: EventName,
    listener: (payload: AddonInstanceEventMap<Options, Events>[EventName]) => void,
  ): () => void;
}
