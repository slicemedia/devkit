/** Side-effect-free contract helpers shared by addon authors and independent inspectors. */
export {
  assertInspectionRecord,
  conditionMatches,
  freezeCondition,
  readOptionPath,
  resolveInspectionOptions,
  validateConstraints,
} from "./inspection-contract.js";
export { freezeStructure } from "./structure.js";
export type {
  AddonCondition,
  AddonValueConstraints,
  AddonInspectionContext,
  AddonDiagnostics,
  AddonDiagnostic,
  AddonDependencyDiagnostic,
} from "./inspection-types.js";
