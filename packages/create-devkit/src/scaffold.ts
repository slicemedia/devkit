import { lstat, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, parse, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_DEVKIT_VERSION_RANGE,
  EXTERNAL_PRODUCT_VERSION_RANGES,
} from "./versions.generated.js";

const requireModule = createRequire(import.meta.url);
const semver = requireModule("semver") as {
  validRange(value: string): string | null;
};
const explicitSemverVersion =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const explicitSemverComparator =
  /^(?:[<>]=?|[=~^])?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export const PROJECT_CAPABILITIES = [
  "slider",
  "animations",
  "tooltips",
  "digitalocean-spaces",
] as const;

export type ProjectCapability = (typeof PROJECT_CAPABILITIES)[number];

export const AGENT_TARGETS = ["codex", "claude", "cursor", "copilot", "webflow"] as const;

export type AgentTarget = (typeof AGENT_TARGETS)[number];

export const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn"] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export interface ScaffoldOptions {
  targetDirectory: string;
  projectName: string;
  packageManager: PackageManager;
  capabilities: readonly ProjectCapability[];
  agentTargets: readonly AgentTarget[];
  devkitVersion?: string;
  agentKitVersion?: string;
  swiperAdapterVersion?: string;
  spacesDeployerVersion?: string;
  templateRoot?: string;
}

export interface ScaffoldReceipt {
  schemaVersion: 2;
  projectName: string;
  targetDirectory: string;
  packageManager: PackageManager;
  capabilities: readonly ProjectCapability[];
  agentTargets: readonly AgentTarget[];
  dependencies: Readonly<Record<string, string>>;
  devDependencies: Readonly<Record<string, string>>;
  integrationFiles: readonly string[];
  agentGenerateCommand?: string;
  writtenFiles: readonly string[];
}

interface ResolvedVersions {
  devkit: string;
  agentKit: string;
  swiperAdapter: string;
  spacesDeployer: string;
}

interface CapabilityDefinition {
  dependencies(versions: ResolvedVersions): Readonly<Record<string, string>>;
  environmentVariables?: readonly string[];
  integrationFile: string;
  renderIntegration(): string;
}

const packageManagerMetadata: Record<PackageManager, string> = {
  pnpm: "pnpm@11.21.0",
  npm: "npm@10.9.8",
  yarn: "yarn@4.18.0",
};

const packageManagerCommands: Record<
  PackageManager,
  {
    install: string;
    dev: string;
    typecheck: string;
    build: string;
    catalog: string;
    devkit: string;
    agentsGenerate: string;
  }
> = {
  pnpm: {
    install: "pnpm install",
    dev: "pnpm dev",
    typecheck: "pnpm typecheck",
    build: "pnpm build",
    catalog: "pnpm catalog -- --json",
    devkit: "pnpm devkit -- <command>",
    agentsGenerate: "pnpm agents:generate",
  },
  npm: {
    install: "npm install",
    dev: "npm run dev",
    typecheck: "npm run typecheck",
    build: "npm run build",
    catalog: "npm run catalog -- --json",
    devkit: "npm run devkit -- <command>",
    agentsGenerate: "npm run agents:generate",
  },
  yarn: {
    install: "yarn install",
    dev: "yarn dev",
    typecheck: "yarn typecheck",
    build: "yarn build",
    catalog: "yarn catalog --json",
    devkit: "yarn devkit <command>",
    agentsGenerate: "yarn agents:generate",
  },
};

const baseDependencies = (versions: ResolvedVersions): Readonly<Record<string, string>> => ({
  "@slicemedia/devkit-core": versions.devkit,
});

const capabilityDefinitions: Record<ProjectCapability, CapabilityDefinition> = {
  slider: {
    dependencies: (versions) => ({
      "@slicemedia/swiper-adapter": versions.swiperAdapter,
      swiper: "^14.1.0",
    }),
    integrationFile: "src/integrations/slider.ts",
    renderIntegration: () => `import {
  createResponsiveSwiper,
  type ResponsiveSwiperController,
  type ResponsiveSwiperOptions,
} from "@slicemedia/swiper-adapter";
import "swiper/css";

export const PROJECT_SLIDER_SELECTOR = "[data-wft-slider]" as const;

export type ProjectSliderOptions = Omit<ResponsiveSwiperOptions, "target"> & {
  target?: ResponsiveSwiperOptions["target"];
};

export function createProjectSlider(
  options: ProjectSliderOptions = {},
): ResponsiveSwiperController {
  const { target = PROJECT_SLIDER_SELECTOR, ...swiperOptions } = options;
  return createResponsiveSwiper({
    target,
    observeMutations: true,
    ...swiperOptions,
  });
}
`,
  },
  animations: {
    dependencies: () => ({ gsap: "^3.13.0" }),
    integrationFile: "src/integrations/animations.ts",
    renderIntegration: () => `import { gsap } from "gsap";

/** Project-owned GSAP entry point. Import this module from main.ts when the composition is ready. */
export { gsap };
`,
  },
  tooltips: {
    dependencies: () => ({ "tippy.js": "^6.3.7" }),
    integrationFile: "src/integrations/tooltips.ts",
    renderIntegration:
      () => `import tippy, { type Instance, type MultipleTargets, type Props } from "tippy.js";
import "tippy.js/dist/tippy.css";

export const PROJECT_TOOLTIP_SELECTOR = "[data-wft-tooltip]" as const;

export function createProjectTooltips(
  targets: MultipleTargets = PROJECT_TOOLTIP_SELECTOR,
  options: Partial<Props> = {},
): Instance[] {
  return tippy(targets, options);
}
`,
  },
  "digitalocean-spaces": {
    dependencies: (versions) => ({
      "@slicemedia/spaces-deployer": versions.spacesDeployer,
    }),
    environmentVariables: [
      "DIGITALOCEAN_SPACES_ACCESS_KEY_ID",
      "DIGITALOCEAN_SPACES_SECRET_ACCESS_KEY",
      "DIGITALOCEAN_SPACES_SESSION_TOKEN",
    ],
    integrationFile: "src/integrations/spaces-deployment.ts",
    renderIntegration: () => `import {
  applyDeploymentPlan,
  createDeploymentPlan,
  type SpacesDeploymentPlan,
  type SpacesDeploymentReceipt,
} from "@slicemedia/spaces-deployer";

export interface ProjectSpacesPlanConfig {
  directory: string;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  releaseVersion: string;
}

/** All deployment values are explicit; this helper supplies no account or project defaults. */
export function createProjectDeploymentPlan(
  config: ProjectSpacesPlanConfig,
): Promise<SpacesDeploymentPlan> {
  return createDeploymentPlan(config);
}

export { applyDeploymentPlan };
export type { SpacesDeploymentPlan, SpacesDeploymentReceipt };
`,
  },
};

function assertProjectName(name: string): void {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(name)) {
    throw new Error(`Invalid npm project name: ${name}`);
  }
}

function hasExplicitSemverSyntax(value: string): boolean {
  const clauses = value.split(/\s*\|\|\s*/u);
  return clauses.every((clause) => {
    if (clause === "") return false;
    const hyphenRange = clause.match(/^(\S+)\s+-\s+(\S+)$/u);
    if (hyphenRange !== null) {
      return (
        explicitSemverVersion.test(hyphenRange[1] ?? "") &&
        explicitSemverVersion.test(hyphenRange[2] ?? "")
      );
    }
    return clause.split(/\s+/u).every((token) => explicitSemverComparator.test(token));
  });
}

function assertNpmSemverRange(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value !== value.trim() || !hasExplicitSemverSyntax(value)) {
    throw new Error(`${label} must be a controlled npm semantic-version range.`);
  }
  const normalizedRange = semver.validRange(value);
  if (normalizedRange === null || normalizedRange === "*") {
    throw new Error(`${label} must be a controlled npm semantic-version range.`);
  }
}

function resolveVersions(options: ScaffoldOptions): ResolvedVersions {
  const versions = {
    devkit: options.devkitVersion ?? DEFAULT_DEVKIT_VERSION_RANGE,
    agentKit: options.agentKitVersion ?? EXTERNAL_PRODUCT_VERSION_RANGES.agentKit,
    swiperAdapter: options.swiperAdapterVersion ?? EXTERNAL_PRODUCT_VERSION_RANGES.swiperAdapter,
    spacesDeployer: options.spacesDeployerVersion ?? EXTERNAL_PRODUCT_VERSION_RANGES.spacesDeployer,
  };
  for (const [name, version] of Object.entries(versions)) {
    assertNpmSemverRange(version, `${name} version`);
  }
  return versions;
}

function defaultTemplateRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "template");
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function selectKnown<Value extends string>(
  requested: readonly Value[],
  supported: readonly Value[],
  label: string,
): Value[] {
  const unsupported = requested.filter((value) => !supported.includes(value));
  if (unsupported.length > 0) throw new Error(`Unsupported ${label}: ${unsupported.join(", ")}`);
  const selected = new Set(requested);
  return supported.filter((value) => selected.has(value));
}

async function assertNewProjectTarget(target: string): Promise<void> {
  const targetStat = await lstat(target).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });
  if (targetStat === undefined) return;
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    throw new Error("Target must be a new directory or an existing empty directory.");
  }
  if ((await readdir(target)).length > 0) {
    throw new Error("Target directory is not empty. Choose a new project directory.");
  }
}

async function copyTree(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (["node_modules", "dist", ".slicemedia"].includes(entry.name)) continue;
    const from = join(source, entry.name);
    const destinationName =
      entry.name === "gitignore.template"
        ? ".gitignore"
        : entry.name === "npmrc.template"
          ? ".npmrc"
          : entry.name;
    const to = join(destination, destinationName);
    if (entry.isDirectory()) {
      await copyTree(from, to);
      continue;
    }
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, await readFile(from), { flag: "wx" });
  }
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(relative(root, path));
    }
  }
  await visit(root);
  return files.sort();
}

async function removeFileIfPresent(path: string): Promise<void> {
  await unlink(path).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
  });
}

async function configurePackageManagerFiles(
  target: string,
  packageManager: PackageManager,
): Promise<void> {
  const npmrcPath = join(target, ".npmrc");
  const yarnrcPath = join(target, ".yarnrc.yml");

  if (packageManager === "pnpm") {
    await removeFileIfPresent(yarnrcPath);
    await writeFile(
      npmrcPath,
      "engine-strict=true\nminimum-release-age-strict=true\nsave-exact=true\n",
    );
    return;
  }

  if (packageManager === "npm") {
    await removeFileIfPresent(yarnrcPath);
    await writeFile(npmrcPath, "engine-strict=true\nsave-exact=true\n");
    return;
  }

  await removeFileIfPresent(npmrcPath);
  await writeFile(yarnrcPath, "nodeLinker: node-modules\n");

  const gitignorePath = join(target, ".gitignore");
  const gitignore = await readFile(gitignorePath, "utf8");
  if (!gitignore.split(/\r?\n/u).includes(".yarn/install-state.gz")) {
    const separator = gitignore.endsWith("\n") ? "" : "\n";
    await writeFile(gitignorePath, `${gitignore}${separator}.yarn/install-state.gz\n`);
  }
}

async function configureReadme(target: string, packageManager: PackageManager): Promise<void> {
  if (packageManager === "pnpm") return;
  const readmePath = join(target, "README.md");
  let readme = await readFile(readmePath, "utf8");
  const pnpmCommands = packageManagerCommands.pnpm;
  const selectedCommands = packageManagerCommands[packageManager];
  const replacements = (Object.keys(pnpmCommands) as Array<keyof typeof pnpmCommands>).map(
    (command) => [pnpmCommands[command], selectedCommands[command]] as const,
  );
  replacements.sort(([left], [right]) => right.length - left.length);
  for (const [pnpmCommand, selectedCommand] of replacements) {
    readme = readme.replaceAll(pnpmCommand, selectedCommand);
  }
  await writeFile(readmePath, readme);
}

function capabilityDependencies(
  capabilities: readonly ProjectCapability[],
  versions: ResolvedVersions,
): Record<string, string> {
  const dependencies = Object.assign(
    {},
    baseDependencies(versions),
    ...capabilities.map((capability) => capabilityDefinitions[capability].dependencies(versions)),
  ) as Record<string, string>;
  return Object.fromEntries(
    Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function configureEnvironment(
  target: string,
  capabilities: readonly ProjectCapability[],
): Promise<void> {
  const variables = capabilities.flatMap(
    (capability) => capabilityDefinitions[capability].environmentVariables ?? [],
  );
  if (variables.length === 0) return;
  const environmentPath = join(target, ".env.example");
  const source = await readFile(environmentPath, "utf8");
  const separator = source.endsWith("\n") ? "\n" : "\n\n";
  await writeFile(
    environmentPath,
    `${source}${separator}${variables.map((variable) => `${variable}=`).join("\n")}\n`,
  );
}

interface ConfiguredPackage {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  agentGenerateCommand?: string;
}

async function configurePackage(
  target: string,
  projectName: string,
  packageManager: PackageManager,
  capabilities: readonly ProjectCapability[],
  agentTargets: readonly AgentTarget[],
  versions: ResolvedVersions,
): Promise<ConfiguredPackage> {
  const packagePath = join(target, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    name: string;
    packageManager?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dependencies = capabilityDependencies(capabilities, versions);
  const devDependencies = { ...packageJson.devDependencies };
  for (const dependency of Object.keys(devDependencies)) {
    if (dependency.startsWith("@slicemedia/")) delete devDependencies[dependency];
  }
  devDependencies["@slicemedia/devkit-cli"] = versions.devkit;

  const agentGenerateCommand =
    agentTargets.length === 0
      ? undefined
      : `slicemedia-agent-kit generate --root . --profile project --targets ${agentTargets.join(",")}`;
  if (agentGenerateCommand !== undefined) {
    devDependencies["@slicemedia/agent-kit"] = versions.agentKit;
  }

  packageJson.name = projectName;
  packageJson.packageManager = packageManagerMetadata[packageManager];
  packageJson.dependencies = dependencies;
  packageJson.devDependencies = Object.fromEntries(
    Object.entries(devDependencies).sort(([left], [right]) => left.localeCompare(right)),
  );
  packageJson.scripts = { ...packageJson.scripts };
  if (agentGenerateCommand === undefined) delete packageJson.scripts["agents:generate"];
  else packageJson.scripts["agents:generate"] = agentGenerateCommand;
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  return {
    dependencies,
    devDependencies: packageJson.devDependencies,
    ...(agentGenerateCommand === undefined ? {} : { agentGenerateCommand }),
  };
}

async function writeIntegrations(
  target: string,
  capabilities: readonly ProjectCapability[],
): Promise<string[]> {
  const files: string[] = [];
  for (const capability of capabilities) {
    const definition = capabilityDefinitions[capability];
    const path = join(target, definition.integrationFile);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, definition.renderIntegration(), { flag: "wx" });
    files.push(definition.integrationFile);
  }
  return files;
}

async function configureDevKitEntry(
  target: string,
  capabilities: readonly ProjectCapability[],
): Promise<void> {
  const configPath = join(target, "devkit.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    entries?: Array<{ api?: Record<string, unknown> }>;
  };
  if (config.entries?.length !== 1 || config.entries[0] === undefined) {
    throw new Error("Starter devkit.config.json must declare exactly one project entry.");
  }
  config.entries[0].api = { ...config.entries[0].api, capabilities };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

export async function scaffoldProject(options: ScaffoldOptions): Promise<ScaffoldReceipt> {
  if (options.targetDirectory.trim() === "") throw new Error("Target directory must not be empty.");
  const target = resolve(options.targetDirectory);
  if (target === parse(target).root) {
    throw new Error("Refusing to scaffold into a filesystem root.");
  }
  assertProjectName(options.projectName);
  if (options.packageManager === undefined) throw new Error("Package manager must be selected.");
  const [packageManager] = selectKnown(
    [options.packageManager],
    PACKAGE_MANAGERS,
    "package manager",
  );
  if (packageManager === undefined) throw new Error("Package manager must be selected.");
  const capabilities = selectKnown(options.capabilities, PROJECT_CAPABILITIES, "capabilities");
  const agentTargets = selectKnown(options.agentTargets, AGENT_TARGETS, "agent targets");
  const versions = resolveVersions(options);
  await assertNewProjectTarget(target);
  await mkdir(target, { recursive: true });
  await copyTree(options.templateRoot ?? defaultTemplateRoot(), target);
  await configurePackageManagerFiles(target, packageManager);
  await configureReadme(target, packageManager);

  const configuredPackage = await configurePackage(
    target,
    options.projectName,
    packageManager,
    capabilities,
    agentTargets,
    versions,
  );
  const integrationFiles = await writeIntegrations(target, capabilities);
  await configureEnvironment(target, capabilities);
  await configureDevKitEntry(target, capabilities);

  const receiptPath = ".slicemedia/devkit/scaffold-receipt.json";
  await mkdir(join(target, ".slicemedia", "devkit"), { recursive: true });
  const writtenFiles = [...(await listFiles(target)), receiptPath].sort();
  const receipt: ScaffoldReceipt = {
    schemaVersion: 2,
    projectName: options.projectName,
    targetDirectory: target,
    packageManager,
    capabilities,
    agentTargets,
    dependencies: configuredPackage.dependencies,
    devDependencies: configuredPackage.devDependencies,
    integrationFiles,
    ...(configuredPackage.agentGenerateCommand === undefined
      ? {}
      : { agentGenerateCommand: configuredPackage.agentGenerateCommand }),
    writtenFiles,
  };
  await writeFile(join(target, receiptPath), `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: "wx",
  });
  return receipt;
}
