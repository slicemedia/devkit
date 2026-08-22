import { execFile } from "node:child_process";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import semver from "semver";

const executeFile = promisify(execFile);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryPrefix = "slicemedia-devkit-packed-consumer-";
const maximumOutputBytes = 24 * 1024 * 1024;

const devkitPackages = [
  { id: "devkit", name: "@slicemedia/devkit", directory: "packages/devkit" },
  { id: "core", name: "@slicemedia/devkit-core", directory: "packages/core" },
  { id: "addon", name: "@slicemedia/devkit-addon", directory: "packages/addon" },
  { id: "cli", name: "@slicemedia/devkit-cli", directory: "packages/cli" },
  { id: "creator", name: "@slicemedia/create-devkit", directory: "packages/create-devkit" },
];

const managers = ["pnpm", "npm", "yarn"];
const capabilities = ["slider", "animations", "tooltips", "digitalocean-spaces"];
const agentTargets = ["codex", "claude", "cursor", "copilot", "webflow"];
const variants = [
  { id: "neutral", capabilities: [], agentTargets: [] },
  ...capabilities.map((capability) => ({
    id: capability,
    capabilities: [capability],
    agentTargets: [],
  })),
  { id: "all-capabilities", capabilities, agentTargets: [] },
  { id: "all-agent-targets", capabilities: [], agentTargets },
];

const capabilityIntegrations = {
  slider: "src/integrations/slider.ts",
  animations: "src/integrations/animations.ts",
  tooltips: "src/integrations/tooltips.ts",
  "digitalocean-spaces": "src/integrations/spaces-deployment.ts",
};

const agentOutputs = [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursor/rules/00-foundation.mdc",
  ".github/copilot-instructions.md",
  ".slicemedia/agent-kit/webflow-agent-instructions.zip",
];

const externalProducts = [
  {
    key: "agentKit",
    name: "@slicemedia/agent-kit",
    id: "agent-kit",
    environment: "SLICEMEDIA_AGENT_KIT_TARBALL",
    option: "--agent-kit-tarball",
  },
  {
    key: "swiperAdapter",
    name: "@slicemedia/swiper-adapter",
    id: "swiper-adapter",
    environment: "SLICEMEDIA_SWIPER_ADAPTER_TARBALL",
    option: "--swiper-adapter-tarball",
  },
  {
    key: "spacesDeployer",
    name: "@slicemedia/spaces-deployer",
    id: "spaces-deployer",
    environment: "SLICEMEDIA_SPACES_DEPLOYER_TARBALL",
    option: "--spaces-deployer-tarball",
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function log(message) {
  console.info(`[release-candidate] ${message}`);
}

function parseCandidateInputs(argv, environment = process.env) {
  const byOption = new Map(externalProducts.map((product) => [product.option, product]));
  const configured = new Map();
  let fullFamily = ["1", "true"].includes(
    (environment.SLICEMEDIA_FULL_FAMILY ?? "").toLocaleLowerCase("en-US"),
  );

  for (const product of externalProducts) {
    const value = environment[product.environment]?.trim();
    if (value) configured.set(product.name, resolve(value));
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--full-family") {
      fullFamily = true;
      continue;
    }
    const equalIndex = argument.indexOf("=");
    const option = equalIndex === -1 ? argument : argument.slice(0, equalIndex);
    const product = byOption.get(option);
    if (product === undefined) throw new Error(`Unknown release-candidate option: ${argument}`);
    const value = equalIndex === -1 ? argv[index + 1] : argument.slice(equalIndex + 1);
    if (!value || (equalIndex === -1 && value.startsWith("--"))) {
      throw new Error(`${option} requires a tarball path.`);
    }
    if (equalIndex === -1) index += 1;
    configured.set(product.name, resolve(value));
  }

  if (fullFamily) {
    const missing = externalProducts.filter((product) => !configured.has(product.name));
    if (missing.length > 0) {
      throw new Error(
        `Full-family mode requires real tarballs via ${missing
          .map(({ option, environment: variable }) => `${option} or ${variable}`)
          .join(", ")}.`,
      );
    }
  }

  return { configured, fullFamily };
}

async function run(command, args, options = {}) {
  log(`${command} ${args.join(" ")}`);
  try {
    const result = await executeFile(command, args, {
      cwd: options.cwd,
      env: { ...process.env, CI: "1", ...options.env },
      maxBuffer: maximumOutputBytes,
    });
    if (options.printOutput === true && result.stdout.trim()) console.info(result.stdout.trim());
    if (result.stderr.trim()) console.error(result.stderr.trim());
    return result.stdout;
  } catch (error) {
    if (error && typeof error === "object") {
      if (typeof error.stdout === "string" && error.stdout.trim())
        console.error(error.stdout.trim());
      if (typeof error.stderr === "string" && error.stderr.trim())
        console.error(error.stderr.trim());
    }
    throw error;
  }
}

function assertSafeTemporaryRoot(root, canonicalTemporaryDirectory) {
  const resolvedRoot = resolve(root);
  assert(
    dirname(resolvedRoot) === canonicalTemporaryDirectory &&
      basename(resolvedRoot).startsWith(temporaryPrefix),
    `Refusing to operate on unsafe temporary path: ${resolvedRoot}`,
  );
}

async function createTemporaryRoot() {
  const canonicalTemporaryDirectory = await realpath(tmpdir());
  const root = await mkdtemp(join(canonicalTemporaryDirectory, temporaryPrefix));
  assertSafeTemporaryRoot(root, canonicalTemporaryDirectory);
  return { root, canonicalTemporaryDirectory };
}

function fileDependency(path) {
  return pathToFileURL(path).href;
}

async function packDevKitPackages(packDirectory) {
  await mkdir(packDirectory, { recursive: true });
  const tarballs = new Map();
  for (const definition of devkitPackages) {
    const tarball = join(packDirectory, `${definition.id}.tgz`);
    await run("pnpm", ["pack", "--out", tarball, "--json"], {
      cwd: join(workspaceRoot, definition.directory),
    });
    const archiveStat = await stat(tarball);
    assert(archiveStat.isFile() && archiveStat.size > 0, `Missing package archive: ${tarball}`);
    tarballs.set(definition.name, tarball);
  }
  return tarballs;
}

async function externalVersions() {
  const source = await readFile(join(workspaceRoot, "config/external-products.json"), "utf8");
  const configuration = JSON.parse(source);
  return Object.fromEntries(
    Object.entries(configuration.products).map(([key, product]) => [key, product.range.slice(1)]),
  );
}

function compatibilityFixtures(versions) {
  return [
    {
      id: "agent-kit",
      name: "@slicemedia/agent-kit",
      version: versions.agentKit,
      manifest: { bin: { "slicemedia-agent-kit": "./bin.js" } },
      executable: "bin.js",
      files: {
        "index.js": "export {};\n",
        "index.d.ts": "export {};\n",
        "bin.js": `#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
if (args[0] !== "generate") throw new Error("Compatibility fixture supports generate only.");
const root = resolve(value("--root") ?? ".");
const targets = (value("--targets") ?? "").split(",").filter(Boolean);
const outputs = {
  codex: "AGENTS.md",
  claude: "CLAUDE.md",
  cursor: ".cursor/rules/00-foundation.mdc",
  copilot: ".github/copilot-instructions.md",
  webflow: ".slicemedia/agent-kit/webflow-agent-instructions.zip",
};
for (const target of targets) {
  const relativePath = outputs[target];
  if (!relativePath) throw new Error(\`Unknown compatibility target: \${target}\`);
  const path = resolve(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  const contents = target === "webflow"
    ? Buffer.from("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "base64")
    : \`# Compatibility-only \${target} adapter\n\`;
  await writeFile(path, contents);
}
`,
      },
    },
    {
      id: "swiper-adapter",
      name: "@slicemedia/swiper-adapter",
      version: versions.swiperAdapter,
      manifest: { peerDependencies: { swiper: "^14.1.0" } },
      files: {
        "index.js": `export function createResponsiveSwiper(options) {
  let initialized = false;
  return {
    init() { initialized = true; },
    refresh() {},
    update() {},
    destroy() { initialized = false; },
    setOptions() {},
    getState() { return { initialized, enabled: initialized, instanceCount: 0 }; },
    on() { return () => {}; },
    options,
  };
}
`,
        "index.d.ts": `import type { SwiperOptions } from "swiper/types";
export interface ResponsiveSwiperOptions {
  target: string | HTMLElement | Iterable<HTMLElement>;
  swiper?: SwiperOptions;
  enabled?: { minWidth?: number; maxWidth?: number } | ((viewportWidth: number) => boolean);
  observeMutations?: boolean;
}
export interface ResponsiveSwiperController {
  init(): void;
  refresh(): void;
  update(): void;
  destroy(): void;
  setOptions(options: Partial<ResponsiveSwiperOptions>): void;
  getState(): { initialized: boolean; enabled: boolean; instanceCount: number };
  on(event: string, listener: (state: unknown) => void): () => void;
}
export declare function createResponsiveSwiper(options: ResponsiveSwiperOptions): ResponsiveSwiperController;
`,
      },
    },
    {
      id: "spaces-deployer",
      name: "@slicemedia/spaces-deployer",
      version: versions.spacesDeployer,
      manifest: {},
      files: {
        "index.js": `export async function createDeploymentPlan(options) {
  return { schemaVersion: 2, planId: "fixture-plan", sourceDirectory: options.directory, target: options, releaseVersion: options.releaseVersion, artifactSetDigest: "fixture", files: [] };
}
export async function applyDeploymentPlan(plan) {
  return { schemaVersion: 2, operation: "slicemedia.spaces-deployer.deploy", status: "applied", planId: plan.planId, target: plan.target, releaseVersion: plan.releaseVersion, artifactSetDigest: plan.artifactSetDigest, timestamp: new Date(0).toISOString(), files: [] };
}
`,
        "index.d.ts": `export interface SpacesDeploymentPlan {
  readonly schemaVersion: 2;
  readonly planId: string;
  readonly sourceDirectory: string;
  readonly target: { endpoint: string; region: string; bucket: string; prefix: string };
  readonly releaseVersion: string;
  readonly artifactSetDigest: string;
  readonly files: readonly unknown[];
}
export interface SpacesDeploymentReceipt {
  readonly schemaVersion: 2;
  readonly operation: "slicemedia.spaces-deployer.deploy";
  readonly status: "applied" | "failed";
  readonly planId: string;
  readonly target: SpacesDeploymentPlan["target"];
  readonly releaseVersion: string;
  readonly artifactSetDigest: string;
  readonly timestamp: string;
  readonly files: readonly unknown[];
}
export interface CreateDeploymentPlanOptions {
  directory: string;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  releaseVersion: string;
}
export declare function createDeploymentPlan(options: CreateDeploymentPlanOptions): Promise<SpacesDeploymentPlan>;
export declare function applyDeploymentPlan(plan: SpacesDeploymentPlan, options: unknown): Promise<SpacesDeploymentReceipt>;
`,
      },
    },
  ];
}

async function prepareExternalTarballs(root, packDirectory, candidateInputs) {
  const tarballs = new Map();
  const sourceRoot = join(root, "compatibility-fixtures");
  const versions = await externalVersions();
  const fixtures = new Map(
    compatibilityFixtures(versions).map((fixture) => [fixture.name, fixture]),
  );

  for (const product of externalProducts) {
    const supplied = candidateInputs.configured.get(product.name);
    if (supplied !== undefined) {
      const suppliedStat = await stat(supplied).catch(() => undefined);
      if (suppliedStat?.isFile() !== true) {
        throw new Error(`Real ${product.name} tarball does not exist: ${supplied}`);
      }
      const manifest = JSON.parse(await run("tar", ["-xOf", supplied, "package/package.json"]));
      if (manifest.name !== product.name) {
        throw new Error(
          `Expected ${product.name} tarball; found ${JSON.stringify(manifest.name)}.`,
        );
      }
      const compatibleRange = `^${versions[product.key]}`;
      if (!semver.satisfies(manifest.version, compatibleRange, { includePrerelease: true })) {
        throw new Error(`${product.name}@${manifest.version} does not satisfy ${compatibleRange}.`);
      }
      const tarball = join(packDirectory, `${product.id}-real.tgz`);
      await copyFile(supplied, tarball);
      tarballs.set(product.name, tarball);
      log(`using real ${product.name}@${manifest.version} candidate tarball`);
      continue;
    }

    const fixture = fixtures.get(product.name);
    assert(fixture !== undefined, `Missing compatibility fixture for ${product.name}.`);
    const directory = join(sourceRoot, fixture.id);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      `${JSON.stringify(
        {
          name: fixture.name,
          version: fixture.version,
          type: "module",
          files: Object.keys(fixture.files),
          main: "./index.js",
          types: "./index.d.ts",
          exports: { ".": { types: "./index.d.ts", import: "./index.js" } },
          ...fixture.manifest,
        },
        null,
        2,
      )}\n`,
    );
    for (const [name, contents] of Object.entries(fixture.files)) {
      await writeFile(join(directory, name), contents);
    }
    if (fixture.executable !== undefined) {
      await chmod(join(directory, fixture.executable), 0o755);
    }
    const tarball = join(packDirectory, `${fixture.id}-contract.tgz`);
    await run("pnpm", ["pack", "--out", tarball, "--json"], { cwd: directory });
    tarballs.set(fixture.name, tarball);
    log(`using compatibility-only ${fixture.name}@${fixture.version} contract tarball`);
  }
  return tarballs;
}

async function writeWorkspaceOverrides(directory, tarballs) {
  const lines = ["packages: []", "", "overrides:"];
  for (const definition of devkitPackages) {
    lines.push(
      `  ${JSON.stringify(definition.name)}: ${JSON.stringify(fileDependency(tarballs.get(definition.name)))}`,
    );
  }
  await writeFile(join(directory, "pnpm-workspace.yaml"), `${lines.join("\n")}\n`);
}

async function installPackedRunner(directory, tarballs) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    `${JSON.stringify(
      {
        name: "slicemedia-devkit-packed-runner",
        version: "0.0.0",
        private: true,
        type: "module",
        packageManager: "pnpm@11.21.0",
        engines: { node: ">=22.13.0 <23 || >=24.0.0 <25" },
        dependencies: Object.fromEntries(
          devkitPackages.map(({ name }) => [name, fileDependency(tarballs.get(name))]),
        ),
      },
      null,
      2,
    )}\n`,
  );
  await writeWorkspaceOverrides(directory, tarballs);
  await run("pnpm", ["install", "--no-frozen-lockfile"], { cwd: directory });
}

async function verifyPackedAddonBoundary(runnerDirectory) {
  const script = `
    const root = await import("@slicemedia/devkit-addon");
    if ("createExampleAddon" in root || "exampleAddonDefinition" in root) {
      throw new Error("Addon root leaked the optional example exports.");
    }
    if (globalThis.slicemediaDevKit !== undefined) {
      throw new Error("Addon root installed the optional DevKit runtime.");
    }
    const example = await import("@slicemedia/devkit-addon/example");
    if (typeof example.createExampleAddon !== "function") {
      throw new Error("Explicit addon example subpath is unavailable.");
    }
  `;
  await run("node", ["--input-type=module", "--eval", script], { cwd: runnerDirectory });
}

async function verifyPackedMetaPackage(runnerDirectory) {
  const script = `
    const root = await import("@slicemedia/devkit");
    if (typeof root.whenDomReady !== "function" || typeof root.defineAddon !== "function") {
      throw new Error("DevKit convenience root does not expose the browser runtime.");
    }
    const addon = await import("@slicemedia/devkit/addon");
    if (typeof addon.defineAddon !== "function") {
      throw new Error("DevKit addon convenience subpath is unavailable.");
    }
    if ("createExampleAddon" in root || "createExampleAddon" in addon) {
      throw new Error("DevKit convenience entry leaked the optional addon example.");
    }
    if (globalThis.slicemediaDevKit !== undefined) {
      throw new Error("DevKit convenience entry installed a global runtime.");
    }
  `;
  await run("node", ["--input-type=module", "--eval", script], { cwd: runnerDirectory });
}

async function loadScaffoldProject(runnerDirectory) {
  const moduleUrl = pathToFileURL(
    join(runnerDirectory, "node_modules", "@slicemedia", "create-devkit", "dist", "index.js"),
  ).href;
  const creator = await import(moduleUrl);
  assert(typeof creator.scaffoldProject === "function", "Packed creator API is unavailable.");
  return creator.scaffoldProject;
}

async function injectLocalTarballs(projectDirectory, tarballs) {
  const packagePath = join(projectDirectory, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  for (const section of ["dependencies", "devDependencies"]) {
    for (const name of Object.keys(packageJson[section] ?? {})) {
      const tarball = tarballs.get(name);
      if (tarball !== undefined) packageJson[section][name] = fileDependency(tarball);
    }
  }
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function assertMissing(path, message) {
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error(message);
}

async function assertGeneratedProjectShape(
  projectDirectory,
  manager,
  selectedCapabilities,
  selectedAgentTargets,
) {
  const [main, projectGuidance, packageSource] = await Promise.all([
    readFile(join(projectDirectory, "src/main.ts"), "utf8"),
    readFile(join(projectDirectory, "WEBFLOW_PROJECT.md"), "utf8"),
    readFile(join(projectDirectory, "package.json"), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  assert(packageJson.packageManager.startsWith(`${manager}@`), "Wrong package-manager metadata.");
  assert(projectGuidance.includes("Webflow project guidance"), "Project guidance is missing.");
  assert(!main.includes("integrations/"), "Generated main entry auto-imports an integration.");
  assert(packageJson.dependencies["@slicemedia/devkit-core"], "Generated project omits core.");
  assert(packageJson.devDependencies["@slicemedia/devkit-cli"], "Generated project omits CLI.");
  if (selectedAgentTargets.length > 0) {
    assert(packageJson.devDependencies["@slicemedia/agent-kit"], "Agent project omits Agent Kit.");
    assert(
      packageJson.scripts["agents:generate"]?.includes(selectedAgentTargets.join(",")),
      "Agent project has the wrong generation command.",
    );
  } else {
    assert(
      !packageJson.devDependencies["@slicemedia/agent-kit"],
      "Neutral project installs Agent Kit.",
    );
    assert(!packageJson.scripts["agents:generate"], "Neutral project configures agents.");
  }

  for (const capability of capabilities) {
    const integration = join(projectDirectory, capabilityIntegrations[capability]);
    if (selectedCapabilities.includes(capability)) {
      await access(integration);
    } else {
      await assertMissing(integration, `Unselected ${capability} integration was generated.`);
    }
  }
  if (selectedCapabilities.length === 0) {
    await assertMissing(
      join(projectDirectory, "src/integrations"),
      "Neutral scaffold contains integrations.",
    );
  }
  await Promise.all(
    agentOutputs.map((output) =>
      assertMissing(
        join(projectDirectory, output),
        "Scaffolding generated Agent Kit output before explicit generation.",
      ),
    ),
  );
  await assertMissing(join(projectDirectory, "LICENSE"), "Generated project received a license.");
}

function managerCommand(manager, action) {
  if (manager === "pnpm") {
    if (action === "install") return ["pnpm", ["install", "--no-frozen-lockfile"]];
    return ["pnpm", ["run", action]];
  }
  if (manager === "npm") {
    if (action === "install") return ["npm", ["install"]];
    return ["npm", ["run", action]];
  }
  if (action === "install") return ["corepack", ["yarn", "install", "--no-immutable"]];
  return ["corepack", ["yarn", "run", action]];
}

async function assertManagerVersion(manager, projectDirectory) {
  const [command, args] =
    manager === "yarn" ? ["corepack", ["yarn", "--version"]] : [manager, ["--version"]];
  const version = (await run(command, args, { cwd: projectDirectory })).trim();
  const expected = manager === "pnpm" ? /^11\./u : manager === "npm" ? /^1[01]\./u : /^4\./u;
  assert(expected.test(version), `Expected ${manager} release line; found ${version}.`);
}

function parseCommandResult(output, command) {
  const result = JSON.parse(output);
  assert(result.ok === true, `${command} did not report success.`);
  assert(result.command === command, `${command} returned an unexpected command receipt.`);
  return result;
}

async function exerciseProject(projectDirectory, manager, selectedAgentTargets) {
  await assertManagerVersion(manager, projectDirectory);
  const [installCommand, installArguments] = managerCommand(manager, "install");
  await run(installCommand, installArguments, { cwd: projectDirectory });
  for (const script of ["typecheck", "build"]) {
    const [command, args] = managerCommand(manager, script);
    await run(command, args, { cwd: projectDirectory });
  }
  await access(join(projectDirectory, "dist/project.js"));

  if (selectedAgentTargets.length > 0) {
    const [command, args] = managerCommand(manager, "agents:generate");
    await run(command, args, { cwd: projectDirectory });
    await Promise.all(agentOutputs.map((output) => access(join(projectDirectory, output))));
  }

  const cli = join(projectDirectory, "node_modules", "@slicemedia", "devkit-cli", "dist", "bin.js");
  parseCommandResult(
    await run("node", [cli, "sanitize", "--root", ".", "--json"], { cwd: projectDirectory }),
    "sanitize",
  );
}

async function main() {
  const [nodeMajor = 0, nodeMinor = 0] = process.versions.node
    .split(".")
    .slice(0, 2)
    .map((part) => Number.parseInt(part, 10));
  assert(
    (nodeMajor === 22 && nodeMinor >= 13) || nodeMajor === 24,
    `Release-candidate gate requires Node 22.13+ or 24; found ${process.version}.`,
  );
  const candidateInputs = parseCandidateInputs(process.argv.slice(2));
  log(
    candidateInputs.fullFamily
      ? "full-family mode requires and uses real external candidate tarballs"
      : "compatibility mode may use synthetic external contract tarballs",
  );
  const { root: temporaryRoot, canonicalTemporaryDirectory } = await createTemporaryRoot();
  try {
    const relativeToWorkspace = relative(workspaceRoot, temporaryRoot);
    assert(
      relativeToWorkspace.startsWith("..") && !isAbsolute(relativeToWorkspace),
      "Temporary consumer must be outside the workspace.",
    );

    const packDirectory = join(temporaryRoot, "packs");
    const runnerDirectory = join(temporaryRoot, "runner");
    const devkitTarballs = await packDevKitPackages(packDirectory);
    const compatibilityTarballs = await prepareExternalTarballs(
      temporaryRoot,
      packDirectory,
      candidateInputs,
    );
    const allTarballs = new Map([...devkitTarballs, ...compatibilityTarballs]);

    await installPackedRunner(runnerDirectory, devkitTarballs);
    await verifyPackedMetaPackage(runnerDirectory);
    await verifyPackedAddonBoundary(runnerDirectory);
    parseCommandResult(
      await run(
        "pnpm",
        ["exec", "slicemedia-devkit", "sanitize", "--root", packDirectory, "--json"],
        { cwd: runnerDirectory },
      ),
      "sanitize",
    );

    const scaffoldProject = await loadScaffoldProject(runnerDirectory);
    for (const manager of managers) {
      for (const variant of variants) {
        const projectDirectory = join(temporaryRoot, "consumers", manager, variant.id);
        const receipt = await scaffoldProject({
          targetDirectory: projectDirectory,
          projectName: `packed-${manager}-${variant.id}`,
          packageManager: manager,
          capabilities: variant.capabilities,
          agentTargets: variant.agentTargets,
        });
        assert(receipt.schemaVersion === 2, "Scaffold receipt has the wrong schema.");
        assert(receipt.packageManager === manager, "Scaffold receipt has the wrong manager.");
        assert(
          JSON.stringify(receipt.capabilities) === JSON.stringify(variant.capabilities),
          "Scaffold receipt has the wrong capabilities.",
        );
        assert(
          JSON.stringify(receipt.agentTargets) === JSON.stringify(variant.agentTargets),
          "Scaffold receipt has the wrong agent targets.",
        );
        await assertGeneratedProjectShape(
          projectDirectory,
          manager,
          variant.capabilities,
          variant.agentTargets,
        );
        await injectLocalTarballs(projectDirectory, allTarballs);
        await exerciseProject(projectDirectory, manager, variant.agentTargets);
        log(`${manager}/${variant.id} passed`);
      }
    }

    log("packed DevKit and all pnpm/npm/Yarn capability and agent consumers passed");
  } finally {
    assertSafeTemporaryRoot(temporaryRoot, canonicalTemporaryDirectory);
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    log(`removed isolated root ${temporaryRoot}`);
  }
}

await main();
