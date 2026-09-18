import type {
  AddonCondition,
  AddonDiagnostics,
  AddonInspectionContext,
  AddonValueConstraints,
} from "./inspection-types.js";

export type MaybePromise<Value> = Value | PromiseLike<Value>;

export type Cleanup = () => MaybePromise<void>;

export type DataWftAttribute = `data-wft-${string}`;

export type AddonPlacement = "head" | "body-end";

export type AddonLifecycleMethod =
  "init" | "refresh" | "destroy" | "setOptions" | "getState" | "on";

export type AddonValueType = "boolean" | "number" | "string" | "selector" | "enum";

export interface AddonAttribute<OptionKey extends string = string> extends AddonValueConstraints {
  readonly name: DataWftAttribute;
  readonly description: string;
  readonly type: AddonValueType;
  readonly option?: OptionKey;
  readonly required?: boolean;
  readonly values?: readonly string[];
}

export interface AddonStructureAttribute {
  readonly name: DataWftAttribute;
  /** Overrides the attribute metadata for this element role only. */
  readonly required?: boolean;
  readonly when?: AddonCondition;
}

/** Expected element roles, shared by setup documentation and read-only DOM inspection. */
export interface AddonStructureNode<OptionKey extends string = string> {
  /** Unique within this addon's structure; also preserves expansion state in DevTools. */
  readonly id: string;
  readonly label: string;
  /** Neutral default selector; project-specific selectors stay in the consuming project. */
  readonly selector: string;
  /** Explicitly read this selector from the instance's current options when inspecting. */
  readonly selectorOption?: OptionKey;
  /** Nested roles default to descendants; child means an immediate child of each parent. */
  readonly relationship?: "child" | "descendant" | "self" | "self-or-descendant";
  /** Find descendants in the nearest explicit shared scope, including external controls. */
  readonly scopeSelector?: string;
  /** Nested roles default to required. The root defaults to optional on a given page. */
  readonly required?: boolean;
  readonly when?: AddonCondition;
  readonly min?: number;
  readonly max?: number;
  readonly uniqueBy?: DataWftAttribute;
  readonly references?: {
    readonly attribute: DataWftAttribute;
    readonly target: string;
    readonly targetAttribute: DataWftAttribute;
  };
  readonly attributes: readonly AddonStructureAttribute[];
  readonly children?: readonly AddonStructureNode<OptionKey>[];
}

export interface AddonOptionMetadata<
  OptionKey extends string = string,
> extends AddonValueConstraints {
  readonly name: OptionKey;
  readonly description: string;
  readonly type: AddonValueType;
  readonly required?: boolean;
  readonly values?: readonly string[];
}

export type AddonDependencyKind = "package" | "script" | "style";

export interface AddonDependency {
  readonly name: string;
  readonly version?: string;
  readonly kind?: AddonDependencyKind;
  readonly optional?: boolean;
  /** An explicitly declared browser global path; presence alone does not prove readiness. */
  readonly global?: string;
  readonly when?: AddonCondition;
}

export interface AddonUsage {
  readonly setup: readonly string[];
  /** Neutral markup showing the contract, never copied project markup. */
  readonly markup?: string;
  readonly notes?: readonly string[];
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
  /** Use the same root-specific options that DevTools inspects. */
  resolveOptions(root: Element): Readonly<Options>;
  emit<EventName extends keyof Events>(event: EventName, payload: Events[EventName]): void;
  onCleanup(cleanup: Cleanup): () => void;
}

export interface AddonLifecycleHooks<Options extends object, State = unknown> {
  init?(): MaybePromise<void>;
  refresh?(): MaybePromise<void>;
  destroy?(): MaybePromise<void>;
  setOptions?(next: Readonly<Options>, previous: Readonly<Options>): MaybePromise<void>;
  getState?(): State;
  inspect?(context: AddonInspectionContext<Options>): AddonDiagnostics;
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
  readonly usage?: AddonUsage;
  readonly structure?: AddonStructureNode<Extract<keyof Options, string>>;
  readonly scope?: "component" | "global";
}

export interface AddonDefinition<
  Options extends object,
  State = unknown,
  Events extends object = object,
> extends AddonMetadata<Options> {
  resolveOptions?(context: AddonInspectionContext<Options>): Readonly<Options>;
  inspect?(context: AddonInspectionContext<Options>): AddonDiagnostics;
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
  readonly usage?: AddonUsage;
  readonly structure?: AddonStructureNode<Extract<keyof Options, string>>;
  readonly scope?: "component" | "global";
  resolveOptions?(context: AddonInspectionContext<Options>): Readonly<Options>;
  inspect?(context: AddonInspectionContext<Options>): AddonDiagnostics;
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

export interface AddonLifecycleEvent {
  readonly status: AddonStatus;
}

export type AddonInstanceEventMap<Options extends object, Events extends object> = Events & {
  readonly status: AddonStatusChange;
  readonly error: AddonErrorEvent;
  readonly options: AddonOptionsChange<Options>;
  readonly init: AddonLifecycleEvent;
  readonly refresh: AddonLifecycleEvent;
  readonly destroy: AddonLifecycleEvent;
};

export interface AddonInstance<
  Options extends object,
  State = unknown,
  Events extends object = object,
> {
  readonly definition: AddonDefinition<Options, State, Events>;
  readonly status: AddonStatus;
  readonly options: Readonly<Options>;
  resolveOptions(root: Element): Readonly<Options>;
  inspect(root?: Element): AddonDiagnostics;
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
