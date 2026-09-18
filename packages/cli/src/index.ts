export { runCli, type CliDependencies } from "./commands.js";
export {
  buildSiteBundle,
  type BuildSiteBundleOptions,
  type BuildSiteBundleResult,
} from "./build.js";
export { discoverAddonEntries } from "./discovery.js";
export {
  buildScripts,
  type BuildScriptsOptions,
  type BuildScriptsResult,
  type BuiltScript,
} from "./scripts-build.js";
export {
  documentEntry,
  renderCatalog,
  renderSetupGuide,
  type DocumentationOptions,
  type DocumentedEntry,
} from "./documentation.js";
export {
  forbiddenTermsFromEnvironment,
  sanitizeTree,
  type SanitizeFinding,
  type SanitizeOptions,
  type SanitizeResult,
} from "./sanitize.js";
export type {
  AddonEntry,
  AttributeDocumentation,
  CommandResult,
  EntryUsage,
  ProjectBundle,
} from "./types.js";
export {
  WebflowClient,
  WebflowHttpError,
  webflowOAuthTokenFromEnvironment,
  webflowTokenFromEnvironment,
  type AppliedScript,
  type RegisteredScript,
  type SiteCustomCode,
  type WebflowComponentProperty,
  type WebflowClientOptions,
  type WebflowSite,
} from "./webflow/client.js";
export { parseRenderedScripts, scanApiScripts, scanRenderedScripts } from "./webflow/scan.js";
