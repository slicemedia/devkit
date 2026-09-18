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
