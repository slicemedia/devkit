export type ScriptPlacement = "head" | "body-end";

export interface EntryUsage {
  readonly setup: readonly string[];
  readonly markup?: string;
  readonly notes?: readonly string[];
}

export interface AttributeDocumentation {
  readonly name: string;
  readonly description?: string;
  readonly type?: string;
  readonly required?: boolean;
  readonly option?: string;
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly format?: "css-length" | "url" | "json";
  readonly target?: "root" | "document";
}

export type ConditionDocumentation =
  | { readonly option: string; readonly equals: string | number | boolean | null }
  | { readonly attribute: string; readonly equals: string | null }
  | { readonly media: string }
  | { readonly all: readonly ConditionDocumentation[] }
  | { readonly any: readonly ConditionDocumentation[] }
  | { readonly not: ConditionDocumentation };

export interface DependencyDocumentation {
  readonly name: string;
  readonly global?: string;
  readonly optional?: boolean;
  readonly when?: ConditionDocumentation;
}

/** Serializable counterpart of the addon's shared structure metadata; no runtime dependency. */
export interface StructureDocumentation {
  readonly id: string;
  readonly label: string;
  readonly selector: string;
  readonly selectorOption?: string;
  readonly relationship?: "child" | "descendant" | "self" | "self-or-descendant";
  readonly scopeSelector?: string;
  readonly when?: ConditionDocumentation;
  readonly min?: number;
  readonly max?: number;
  readonly uniqueBy?: string;
  readonly references?: {
    readonly attribute: string;
    readonly target: string;
    readonly targetAttribute: string;
  };
  readonly required?: boolean;
  readonly attributes: readonly {
    readonly name: string;
    readonly required?: boolean;
    readonly when?: ConditionDocumentation;
  }[];
  readonly children?: readonly StructureDocumentation[];
}

export interface ProjectBundle {
  readonly input: string;
  readonly scriptFile: string;
  readonly cssFile?: string;
}

export interface AddonEntry {
  readonly name: string;
  readonly kind?: "addon" | "project";
  readonly input: string;
  readonly version?: string;
  readonly description: string;
  readonly placement: ScriptPlacement;
  readonly dependencies: readonly string[];
  readonly attributes: readonly string[];
  readonly scriptAttributes: Readonly<Record<string, string>>;
  readonly defaultOptions?: Readonly<Record<string, unknown>>;
  readonly api: Readonly<Record<string, unknown>>;
  readonly attributeDetails?: readonly AttributeDocumentation[];
  readonly usage?: EntryUsage;
  readonly structure?: StructureDocumentation;
  readonly scope?: "component" | "global";
  readonly dependencyDetails?: readonly DependencyDocumentation[];
  /** Explicit inert metadata module. Project composition entries must never be loaded for discovery. */
  readonly definition?: { readonly module: string; readonly export: string };
  /** Browser entry and independent output paths, relative to the project and dist respectively. */
  readonly bundle?: ProjectBundle;
}

export interface CommandResult<T = unknown> {
  readonly ok: boolean;
  readonly command: string;
  readonly summary: string;
  readonly data: T;
  /** Human output only; deliberately omitted from the JSON envelope. */
  readonly text?: string;
}
