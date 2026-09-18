import {
  assertInspectionRecord,
  conditionMatches,
  readOptionPath,
  resolveInspectionOptions,
  validateConstraints,
} from "@slicemedia/devkit-core/inspection";
import type {
  AddonDiagnostics,
  AddonInspectionContext,
  AddonDependencyDiagnostic,
} from "@slicemedia/devkit-core";
import type { AddonOptionMetadata } from "@slicemedia/devkit-core";
import type {
  DevToolsAddonInspection,
  DevToolsInstanceInspection,
  DevToolsIssue,
  DevToolsRegistration,
} from "./types.js";
import { valueProblem } from "./values.js";

function validateDiagnostics(value: AddonDiagnostics): AddonDiagnostics {
  assertInspectionRecord(value, "inspect() must return a synchronous diagnostic report.");
  if (
    !value ||
    typeof value !== "object" ||
    !["active", "inactive", "waiting", "error", "unverified"].includes(value.state)
  )
    throw new TypeError(
      "inspect() must return a synchronous diagnostic report with a valid state.",
    );
  if (value.message !== undefined && typeof value.message !== "string")
    throw new TypeError("Diagnostic messages must be strings.");
  if (
    value.issues !== undefined &&
    (!Array.isArray(value.issues) ||
      value.issues.some(
        (issue) =>
          !issue ||
          typeof issue.code !== "string" ||
          typeof issue.message !== "string" ||
          !["info", "warning", "error"].includes(issue.severity),
      ))
  )
    throw new TypeError("Invalid diagnostic issues.");
  if (
    value.dependencies !== undefined &&
    (!Array.isArray(value.dependencies) ||
      value.dependencies.some(
        (dependency) =>
          !dependency ||
          typeof dependency.name !== "string" ||
          !["available", "loading", "missing", "inactive", "unverified"].includes(
            dependency.state,
          ) ||
          (dependency.message !== undefined && typeof dependency.message !== "string"),
      ))
  )
    throw new TypeError("Invalid dependency diagnostics.");
  return value;
}

function optionProblem(
  option: AddonOptionMetadata,
  value: unknown,
  document: Document,
  root?: Element,
): string | undefined {
  validateConstraints(option);
  if (value === undefined || value === null) return option.required ? "is required" : undefined;
  const type = option.type === "selector" || option.type === "enum" ? "string" : option.type;
  if (typeof value !== type) return `must be ${type}`;
  return valueProblem({ ...option, name: "data-wft-option" }, String(value), document, root);
}

/** Explicit read-only providers only: never setup, getState, init, refresh, asset loads or network. */
export function inspectDiagnostics(
  registration: DevToolsRegistration,
  inspection: DevToolsAddonInspection,
  document: Document,
): DevToolsAddonInspection {
  const { addon } = registration;
  const issues: DevToolsIssue[] = [...inspection.issues];
  const candidates: readonly (Element | undefined)[] = inspection.roots?.length
    ? inspection.roots
    : inspection.roots && addon.status !== "error"
      ? []
      : [undefined];
  const instances: DevToolsInstanceInspection[] = candidates.map((root) => {
    let options: Readonly<Record<string, unknown>> = {
      ...addon.definition.defaultOptions,
      ...addon.options,
    };
    const context: AddonInspectionContext = {
      document,
      window: document.defaultView!,
      options,
      status: addon.status ?? "idle",
      ...(root ? { root } : {}),
    };
    let diagnostics: AddonDiagnostics = {
      state: "unverified",
      message: "No runtime diagnostic provider declared.",
    };
    let dependencies: AddonDependencyDiagnostic[] = [];
    try {
      diagnostics = addon.inspect ? validateDiagnostics(addon.inspect(root)) : diagnostics;
      options =
        root && addon.resolveOptions
          ? (addon.resolveOptions(root) as Record<string, unknown>)
          : (resolveInspectionOptions(addon.definition, context) as Record<string, unknown>);
      assertInspectionRecord(options, "resolveOptions must return a synchronous options object.");
      for (const option of addon.definition.options ?? []) {
        const problem = optionProblem(option, readOptionPath(options, option.name), document, root);
        if (problem)
          issues.push({
            code: "invalid-option",
            severity: "error",
            message: `Option ${option.name} ${problem}.`,
            ...(root ? { element: root } : {}),
          });
      }
      if (addon.status === "error" && diagnostics.state !== "error")
        diagnostics = { ...diagnostics, state: "error", message: "Addon lifecycle failed." };
      if (diagnostics.state === "error")
        issues.push({
          code: "runtime-diagnostic",
          severity: "error",
          message: diagnostics.message ?? "Addon reports an error.",
          ...(root ? { element: root } : {}),
        });
      for (const issue of diagnostics.issues ?? []) {
        const element =
          issue.element?.nodeType === 1 && issue.element.ownerDocument === document
            ? issue.element
            : root;
        issues.push({
          code: "runtime-diagnostic",
          severity: issue.severity,
          message: `${issue.code}: ${issue.message}`,
          ...(element ? { element } : {}),
        });
      }
      const reported = new Map(
        diagnostics.dependencies?.map((dependency) => [dependency.name, dependency]),
      );
      dependencies = (addon.definition.dependencies ?? []).map((dependency) => {
        const provided = reported.get(dependency.name);
        reported.delete(dependency.name);
        if (!conditionMatches(dependency.when, { ...context, options }))
          return { name: dependency.name, state: "inactive" };
        const result: AddonDependencyDiagnostic = provided ?? {
          name: dependency.name,
          state: dependency.global
            ? readOptionPath(context.window, dependency.global) == null
              ? "missing"
              : "available"
            : "unverified",
          message: dependency.global
            ? `Global: ${dependency.global}`
            : "No runtime dependency report declared.",
        };
        if (result.state === "missing")
          issues.push({
            code: "dependency-missing",
            severity: dependency.optional ? "warning" : "error",
            message: `${dependency.name}: ${result.message ?? "dependency missing"}`,
            ...(root ? { element: root } : {}),
          });
        return result;
      });
      for (const dependency of reported.values()) {
        dependencies.push(dependency);
        if (dependency.state === "missing")
          issues.push({
            code: "dependency-missing",
            severity: "warning",
            message: `${dependency.name}: ${dependency.message ?? "dependency missing"}`,
            ...(root ? { element: root } : {}),
          });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (addon.status === "error") {
        diagnostics = {
          state: "error",
          message:
            diagnostics.state === "error"
              ? (diagnostics.message ?? "Addon lifecycle failed.")
              : "Addon lifecycle failed.",
        };
        if (!issues.some((issue) => issue.code === "runtime-diagnostic" && issue.element === root))
          issues.push({
            code: "runtime-diagnostic",
            severity: "error",
            message: diagnostics.message!,
            ...(root ? { element: root } : {}),
          });
      } else diagnostics = { state: "unverified", message: `Inspection failed: ${message}` };
      issues.push({
        code: "inspection-failed",
        severity: "warning",
        message: `Inspection failed: ${message}`,
        ...(root ? { element: root } : {}),
      });
    }
    return { ...(root ? { root } : {}), options, diagnostics, dependencies };
  });
  return {
    ...inspection,
    issues,
    instances,
    coverage:
      addon.definition.scope === "global"
        ? "global"
        : inspection.rootSelector
          ? "structure"
          : "inventory",
  };
}
