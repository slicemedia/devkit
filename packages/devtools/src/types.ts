import type {
  AddonAttribute,
  AddonStatus,
  AddonStructureNode,
  AddonUsage,
  DataWftAttribute,
  AddonOptionMetadata,
  AddonDependency,
} from "@slicemedia/devkit-core";
import type {
  AddonDiagnostics,
  AddonDependencyDiagnostic,
  AddonInspectionContext,
  AddonValueConstraints,
} from "@slicemedia/devkit-core";

/** The inspector reads metadata and status; it never invokes addon lifecycle methods. */
export interface InspectableAddon {
  readonly definition: {
    readonly name: string;
    readonly version: string;
    readonly description: string;
    readonly attributes: readonly AddonAttribute[];
    readonly structure?: AddonStructureNode;
    readonly usage?: AddonUsage;
    readonly defaultOptions?: object;
    readonly options?: readonly AddonOptionMetadata[];
    readonly dependencies?: readonly AddonDependency[];
    readonly scope?: "component" | "global";
    resolveOptions?(context: AddonInspectionContext): object;
  };
  readonly status?: AddonStatus;
  readonly options?: object;
  resolveOptions?(root: Element): object;
  inspect?(root?: Element): AddonDiagnostics;
}

export interface DevToolsAttributeRule {
  readonly name: DataWftAttribute;
  /** A descendant requirement means at least one owned descendant per root. */
  readonly on: "root" | "descendant";
  /** Defaults to the attribute's metadata requirement. */
  readonly required?: boolean;
}

export interface DevToolsContract {
  /** The consumer supplies the selector actually used by this addon instance. */
  readonly root: string;
  /** Missing roots are normally "not used on this page", rather than an error. */
  readonly required?: boolean;
  readonly attributes?: readonly DevToolsAttributeRule[];
  /** Project-owned replacement for the definition's structure. Flat attributes take precedence. */
  readonly structure?: AddonStructureNode;
}

export interface DevToolsRegistration {
  readonly addon: InspectableAddon;
  readonly label?: string;
  /** Without a contract, attributes are inventoried across the document only. */
  readonly contract?: DevToolsContract;
  readonly metadataError?: string;
}

export interface DevToolsIssue {
  readonly code:
    | "missing-root"
    | "missing-attribute"
    | "missing-element"
    | "invalid-value"
    | "invalid-contract"
    | "duplicate-registration"
    | "unscoped-requirement"
    | "invalid-count"
    | "duplicate-key"
    | "missing-reference"
    | "orphan-attribute"
    | "invalid-option"
    | "dependency-missing"
    | "runtime-diagnostic"
    | "inspection-failed";
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly attribute?: string;
  readonly element?: Element;
  readonly structureNode?: string;
}

export interface DevToolsAttributeInspection {
  readonly name: string;
  readonly description: string;
  readonly type: AddonAttribute["type"];
  readonly required: boolean;
  readonly elements: readonly Element[];
  readonly values?: readonly string[];
  readonly placement?: "root" | "descendant";
  readonly constraints?: AddonValueConstraints;
  readonly condition?: string;
}

export interface DevToolsStructureInspection {
  readonly id: string;
  readonly label: string;
  readonly selector: string;
  readonly relationship: "root" | "child" | "descendant" | "self" | "self-or-descendant";
  readonly inactiveCount?: number;
  readonly activeCount?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly condition?: string;
  readonly scopeSelector?: string;
  readonly uniqueBy?: string;
  readonly references?: AddonStructureNode["references"];
  readonly required: boolean;
  readonly elements: readonly Element[];
  readonly missingParents: readonly Element[];
  readonly attributes: readonly DevToolsAttributeInspection[];
  readonly children: readonly DevToolsStructureInspection[];
  readonly issues: readonly DevToolsIssue[];
}

export interface DevToolsInstanceInspection {
  readonly root?: Element;
  readonly options: Readonly<Record<string, unknown>>;
  readonly diagnostics: AddonDiagnostics;
  readonly dependencies: readonly AddonDependencyDiagnostic[];
}

export interface DevToolsAddonInspection {
  readonly name: string;
  readonly label: string;
  readonly version: string;
  readonly description: string;
  readonly status: AddonStatus | "unreported";
  /** Undefined means no root contract was supplied. */
  readonly roots?: readonly Element[];
  readonly attributes: readonly DevToolsAttributeInspection[];
  readonly issues: readonly DevToolsIssue[];
  readonly structure?: DevToolsStructureInspection;
  readonly rootSelector?: string;
  readonly instances?: readonly DevToolsInstanceInspection[];
  readonly coverage?: "structure" | "inventory" | "global";
  readonly usage?: AddonUsage;
}

export interface DevToolsSnapshot {
  readonly addons: readonly DevToolsAddonInspection[];
  /** Repeated external script includes, not proof of repeated execution or addon ownership. */
  readonly scriptWarnings: readonly DevToolsScriptWarning[];
  /** Unclaimed hooks are informational: another script may own them. */
  readonly unclaimedAttributes: readonly {
    readonly name: string;
    readonly elements: readonly Element[];
  }[];
}

export interface DevToolsScriptWarning {
  readonly code: "duplicate-script";
  readonly severity: "warning";
  readonly message: string;
  readonly src: string;
  readonly elements: readonly HTMLScriptElement[];
}

export interface DevToolsScanOptions {
  readonly document: Document;
  readonly addons: readonly DevToolsRegistration[];
  /** Excludes inspector-owned nodes, without ignoring similarly named page markup. */
  readonly exclude?: readonly Element[];
}

export interface DevToolsOptions {
  /** Read on each enabled scan. Defaults to inspectable APIs in window.slicemediaDevKit. */
  readonly addons?: readonly DevToolsRegistration[] | (() => readonly DevToolsRegistration[]);
  readonly document?: Document;
  /** Supply the project's style nonce when its CSP requires one. */
  readonly nonce?: string;
}

export interface DevToolsController {
  /** Explicit interaction: setting this flag saves the origin's opt-in/opt-out preference. */
  enabled: boolean;
  init(): void;
  open(): void;
  close(): void;
  /** Disabled inspectors do not scan and return undefined. */
  refresh(): DevToolsSnapshot | undefined;
  getSnapshot(): DevToolsSnapshot | undefined;
  destroy(): void;
}
