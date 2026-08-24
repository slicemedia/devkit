#!/usr/bin/env node
import Enquirer from "enquirer";
import { spawn } from "node:child_process";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGENT_TARGETS,
  PACKAGE_MANAGERS,
  PROJECT_CAPABILITIES,
  scaffoldProject,
  type AgentTarget,
  type PackageManager,
  type ProjectCapability,
} from "./scaffold.js";

export const usage = `Usage: create-slicemedia-devkit [directory]

Starts an interactive wizard for a new Webflow project. If no directory is provided, the wizard
suggests webflow-project. Use . to initialize the current directory. Existing non-empty directories
are never overwritten.

Options:
  -h, --help  Show this help message.`;

export interface ParsedCliArgs {
  readonly help: boolean;
  readonly targetDirectory?: string;
}

export interface SpawnedCommand {
  once(event: "error", listener: (error: Error) => void): this;
  once(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
}

export type CommandSpawner = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    shell: false;
    stdio: "inherit";
  },
) => SpawnedCommand;

const capabilityLabels: Record<ProjectCapability, string> = {
  slider: "Responsive slider (Swiper)",
  animations: "Animations (GSAP)",
  tooltips: "Tooltips (Tippy.js)",
  "digitalocean-spaces": "DigitalOcean Spaces deployment",
};

const agentTargetLabels: Record<AgentTarget, string> = {
  codex: "Codex",
  claude: "Claude",
  cursor: "Cursor",
  copilot: "GitHub Copilot",
  webflow: "Webflow Agent Instructions",
};

const agentTargetHints: Partial<Record<AgentTarget, string>> = {
  webflow: "Importable Markdown ZIP stored with the Webflow site",
};

const packageManagerLabels: Record<PackageManager, string> = {
  pnpm: "pnpm",
  npm: "npm",
  yarn: "Yarn",
};

const packageManagerCommands: Record<
  PackageManager,
  { readonly install: string; readonly agentsGenerate: string; readonly dev: string }
> = {
  pnpm: {
    install: "pnpm install",
    agentsGenerate: "pnpm agents:generate",
    dev: "pnpm dev",
  },
  npm: {
    install: "npm install",
    agentsGenerate: "npm run agents:generate",
    dev: "npm run dev",
  },
  yarn: {
    install: "yarn install",
    agentsGenerate: "yarn agents:generate",
    dev: "yarn dev",
  },
};

export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const positionals: string[] = [];
  let help = false;
  let positionalOnly = false;

  for (const value of argv) {
    if (!positionalOnly && value === "--") {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && (value === "--help" || value === "-h")) {
      help = true;
      continue;
    }
    if (!positionalOnly && value.startsWith("-")) {
      throw new Error(`Unknown option: ${value}`);
    }
    if (value.trim() === "") throw new Error("Project directory must not be empty.");
    positionals.push(value);
  }

  if (positionals.length > 1) {
    throw new Error("Expected at most one project directory.");
  }

  const targetDirectory = positionals[0];
  return {
    help,
    ...(targetDirectory === undefined ? {} : { targetDirectory }),
  };
}

function npmProjectName(value: string): boolean | string {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(value)
    ? true
    : "Enter a valid lowercase npm package name.";
}

function selectedLabel(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

export function multiSelectPromptMessage(label: string): string {
  return `${label} (use Space to select one or more; press Enter to continue)`;
}

function defaultSpawnCommand(
  command: string,
  args: string[],
  options: { cwd: string; shell: false; stdio: "inherit" },
): SpawnedCommand {
  return spawn(command, args, options) as SpawnedCommand;
}

export async function installProjectDependencies(
  packageManager: PackageManager,
  targetDirectory: string,
  spawnCommand: CommandSpawner = defaultSpawnCommand,
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawnCommand(packageManager, ["install"], {
      cwd: resolve(targetDirectory),
      shell: false,
      stdio: "inherit",
    });
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const outcome = code === null ? `signal ${signal ?? "unknown"}` : `exit code ${code}`;
      rejectPromise(new Error(`${packageManager} install failed with ${outcome}.`));
    });
  });
}

export function followUpCommands(
  packageManager: PackageManager,
  options: { readonly includeInstall: boolean; readonly includeAgentGeneration: boolean },
): string[] {
  const commands = packageManagerCommands[packageManager];
  return [
    ...(options.includeInstall ? [commands.install] : []),
    ...(options.includeAgentGeneration ? [commands.agentsGenerate] : []),
    commands.dev,
  ];
}

export function installFailureMessage(
  packageManager: PackageManager,
  targetDirectory: string,
  error: unknown,
): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Project was created at ${targetDirectory}, but dependency installation failed: ${detail}\nThe generated files remain in place. Run "${packageManagerCommands[packageManager].install}" manually in ${targetDirectory}.`;
}

export async function runWizard(cliTargetDirectory?: string): Promise<void> {
  const targetDirectory =
    cliTargetDirectory ??
    (
      await Enquirer.prompt<{ targetDirectory: string }>({
        type: "input",
        name: "targetDirectory",
        message: "Project directory",
        initial: "webflow-project",
        validate: (value) => (value.trim() === "" ? "Enter a project directory." : true),
      })
    ).targetDirectory;
  const { projectName } = await Enquirer.prompt<{ projectName: string }>({
    type: "input",
    name: "projectName",
    message: "npm project name",
    initial: basename(resolve(targetDirectory)),
    validate: npmProjectName,
  });
  const { capabilities } = await Enquirer.prompt<{ capabilities: ProjectCapability[] }>({
    type: "multiselect",
    name: "capabilities",
    message: multiSelectPromptMessage("Optional capabilities"),
    choices: PROJECT_CAPABILITIES.map((capability) => ({
      name: capability,
      message: capabilityLabels[capability],
    })),
  });
  const { agentTargets } = await Enquirer.prompt<{ agentTargets: AgentTarget[] }>({
    type: "multiselect",
    name: "agentTargets",
    message: multiSelectPromptMessage("Agent instruction targets"),
    choices: AGENT_TARGETS.map((target) => ({
      name: target,
      message: agentTargetLabels[target],
      ...(agentTargetHints[target] === undefined ? {} : { hint: agentTargetHints[target] }),
    })),
  });
  const { packageManager } = await Enquirer.prompt<{ packageManager: PackageManager }>({
    type: "select",
    name: "packageManager",
    message: "Package manager",
    choices: PACKAGE_MANAGERS.map((manager) => ({
      name: manager,
      message: packageManagerLabels[manager],
    })),
    initial: PACKAGE_MANAGERS.indexOf("pnpm"),
  });
  const { shouldInstall } = await Enquirer.prompt<{ shouldInstall: boolean }>({
    type: "confirm",
    name: "shouldInstall",
    message: `Install dependencies with ${packageManager}?`,
    initial: true,
  });
  const destination = resolve(targetDirectory);
  const { confirmed } = await Enquirer.prompt<{ confirmed: boolean }>({
    type: "confirm",
    name: "confirmed",
    message: `Create ${projectName} at ${destination}? Capabilities: ${selectedLabel(
      capabilities.map((capability) => capabilityLabels[capability]),
    )}. Agents: ${selectedLabel(
      agentTargets.map((target) => agentTargetLabels[target]),
    )}. Package manager: ${packageManager}. Install dependencies: ${shouldInstall ? "yes" : "no"}.`,
    initial: true,
  });
  if (!confirmed) {
    console.info("Project creation cancelled; no files were written.");
    return;
  }

  const receipt = await scaffoldProject({
    targetDirectory: destination,
    projectName,
    capabilities,
    agentTargets,
    packageManager,
  });
  console.info(
    `Created ${receipt.projectName} at ${receipt.targetDirectory} with ${selectedLabel(
      receipt.capabilities.map((capability) => capabilityLabels[capability]),
    )} capabilities.`,
  );

  if (shouldInstall) {
    console.info(`Installing dependencies with ${packageManager}...`);
    try {
      await installProjectDependencies(packageManager, receipt.targetDirectory);
    } catch (error) {
      throw new Error(installFailureMessage(packageManager, receipt.targetDirectory, error), {
        cause: error,
      });
    }
    console.info(`Installed dependencies with ${packageManager}.`);
  }

  const commands = followUpCommands(packageManager, {
    includeInstall: !shouldInstall,
    includeAgentGeneration: receipt.agentTargets.length > 0,
  });
  console.info(
    `Next steps (run in ${receipt.targetDirectory}):\n${commands
      .map((command) => `  ${command}`)
      .join("\n")}`,
  );
}

export async function runCli(argv: readonly string[]): Promise<void> {
  const parsed = parseCliArgs(argv);
  if (parsed.help) {
    console.info(usage);
    return;
  }
  await runWizard(parsed.targetDirectory);
}

function isCliEntrypoint(): boolean {
  const invokedPath = process.argv[1];
  if (invokedPath === undefined) return false;
  if (resolve(invokedPath) === resolve(fileURLToPath(import.meta.url))) return true;
  return /^create-slicemedia-devkit(?:\.js)?$/u.test(basename(invokedPath));
}

if (isCliEntrypoint()) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
