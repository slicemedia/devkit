export type ScriptPlacement = "head" | "body-end";

export interface AddonEntry {
  readonly name: string;
  readonly input: string;
  readonly version?: string;
  readonly description: string;
  readonly placement: ScriptPlacement;
  readonly dependencies: readonly string[];
  readonly attributes: readonly string[];
  readonly scriptAttributes: Readonly<Record<string, string>>;
  readonly defaultOptions?: Readonly<Record<string, unknown>>;
  readonly api: Readonly<Record<string, unknown>>;
}

export interface CommandResult<T = unknown> {
  readonly ok: boolean;
  readonly command: string;
  readonly summary: string;
  readonly data: T;
}
