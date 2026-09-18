import type { AddonEnvironment, AddonStatus, DataWftAttribute } from "./types.js";

export type AddonCondition =
  | { readonly option: string; readonly equals: string | number | boolean | null }
  | { readonly attribute: DataWftAttribute; readonly equals: string | null }
  | { readonly media: string }
  | { readonly all: readonly AddonCondition[] }
  | { readonly any: readonly AddonCondition[] }
  | { readonly not: AddonCondition };

export interface AddonValueConstraints {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly format?: "css-length" | "url" | "json";
  /** Selector attributes must match a target in the declared scope. */
  readonly target?: "root" | "document";
}

export interface AddonInspectionContext<Options extends object = object> extends AddonEnvironment {
  readonly options: Readonly<Options>;
  readonly root?: Element;
  readonly status: AddonStatus;
}

export interface AddonDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly element?: Element;
}

export interface AddonDependencyDiagnostic {
  readonly name: string;
  readonly state: "available" | "loading" | "missing" | "inactive" | "unverified";
  readonly message?: string;
}

/** Explicit, synchronous, read-only reporting. Never initialize behaviour or fetch assets here. */
export interface AddonDiagnostics {
  readonly state: "active" | "inactive" | "waiting" | "error" | "unverified";
  readonly message?: string;
  readonly issues?: readonly AddonDiagnostic[];
  readonly dependencies?: readonly AddonDependencyDiagnostic[];
}
