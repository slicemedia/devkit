import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AGENT_TARGETS,
  PACKAGE_MANAGERS,
  PROJECT_CAPABILITIES,
  scaffoldProject,
  type AgentTarget,
  type PackageManager,
  type ProjectCapability,
} from "./scaffold.js";
import {
  DEFAULT_DEVKIT_VERSION_RANGE,
  EXTERNAL_PRODUCT_VERSION_RANGES,
} from "./versions.generated.js";

const templateRoot = resolve(import.meta.dirname, "../../../templates/starter");
const baseDependencies = { "@slicemedia/devkit-core": DEFAULT_DEVKIT_VERSION_RANGE };

const packageManagerExpectations: Record<
  PackageManager,
  {
    metadata: string;
    commands: string[];
    npmrc?: string;
    yarnrc?: string;
  }
> = {
  pnpm: {
    metadata: "pnpm@11.21.0",
    commands: [
      "pnpm install",
      "pnpm dev",
      "pnpm typecheck",
      "pnpm build",
      "pnpm catalog -- --json",
      "pnpm devkit -- <command>",
      "pnpm agents:generate",
    ],
    npmrc: "engine-strict=true\nminimum-release-age-strict=true\nsave-exact=true\n",
  },
  npm: {
    metadata: "npm@10.9.8",
    commands: [
      "npm install",
      "npm run dev",
      "npm run typecheck",
      "npm run build",
      "npm run catalog -- --json",
      "npm run devkit -- <command>",
      "npm run agents:generate",
    ],
    npmrc: "engine-strict=true\nsave-exact=true\n",
  },
  yarn: {
    metadata: "yarn@4.18.0",
    commands: [
      "yarn install",
      "yarn dev",
      "yarn typecheck",
      "yarn build",
      "yarn catalog --json",
      "yarn devkit <command>",
      "yarn agents:generate",
    ],
    yarnrc: "nodeLinker: node-modules\n",
  },
};

const capabilityExpectations: Record<
  ProjectCapability,
  { dependencies: Record<string, string>; integration: string; markers: string[] }
> = {
  slider: {
    dependencies: {
      "@slicemedia/swiper-adapter": EXTERNAL_PRODUCT_VERSION_RANGES.swiperAdapter,
      swiper: "^14.1.0",
    },
    integration: "src/integrations/slider.ts",
    markers: ["createResponsiveSwiper", 'import "swiper/css"', "data-wft-slider"],
  },
  animations: {
    dependencies: { gsap: "^3.13.0" },
    integration: "src/integrations/animations.ts",
    markers: ['from "gsap"'],
  },
  tooltips: {
    dependencies: { "tippy.js": "^6.3.7" },
    integration: "src/integrations/tooltips.ts",
    markers: ['from "tippy.js"', 'import "tippy.js/dist/tippy.css"', "data-wft-tooltip"],
  },
  "digitalocean-spaces": {
    dependencies: {
      "@slicemedia/spaces-deployer": EXTERNAL_PRODUCT_VERSION_RANGES.spacesDeployer,
    },
    integration: "src/integrations/spaces-deployment.ts",
    markers: ["createDeploymentPlan", "applyDeploymentPlan", "ProjectSpacesPlanConfig"],
  },
};

const agentPaths: Record<AgentTarget, string> = {
  codex: "AGENTS.md",
  claude: "CLAUDE.md",
  cursor: ".cursor/rules/00-foundation.mdc",
  copilot: ".github/copilot-instructions.md",
  webflow: ".slicemedia/agent-kit/webflow-agent-instructions.zip",
};

async function createTarget(label: string): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), `slicemedia-create-devkit-${label}-`));
  return join(parent, "project");
}

async function scaffold(
  label: string,
  capabilities: readonly ProjectCapability[] = [],
  agentTargets: readonly AgentTarget[] = [],
  packageManager: PackageManager = "pnpm",
) {
  const targetDirectory = await createTarget(label);
  const receipt = await scaffoldProject({
    targetDirectory,
    projectName: `${label}-project`,
    packageManager,
    capabilities,
    agentTargets,
    templateRoot,
  });
  return { receipt, targetDirectory };
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

interface GeneratedPackage {
  packageManager: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
}

async function generatedPackage(target: string): Promise<GeneratedPackage> {
  return JSON.parse(await readFile(join(target, "package.json"), "utf8")) as GeneratedPackage;
}

describe("scaffoldProject", () => {
  it("creates a neutral schema-v2 project with no optional products", async () => {
    const { receipt, targetDirectory } = await scaffold("none");
    const packageJson = await generatedPackage(targetDirectory);

    expect(receipt).toMatchObject({
      schemaVersion: 2,
      projectName: "none-project",
      targetDirectory,
      packageManager: "pnpm",
      capabilities: [],
      agentTargets: [],
      dependencies: baseDependencies,
      integrationFiles: [],
    });
    expect(packageJson.dependencies).toEqual(baseDependencies);
    expect(packageJson.devDependencies).toMatchObject({
      "@slicemedia/devkit-cli": DEFAULT_DEVKIT_VERSION_RANGE,
      typescript: "6.0.3",
    });
    expect(packageJson.devDependencies).not.toHaveProperty("@slicemedia/agent-kit");
    expect(packageJson.scripts).not.toHaveProperty("agents:generate");
    expect(packageJson.scripts.build).toBe("slicemedia-devkit build");
    await expect(readFile(join(targetDirectory, "WEBFLOW_PROJECT.md"), "utf8")).resolves.toContain(
      "Webflow project guidance",
    );
    expect(await exists(join(targetDirectory, "src", "integrations"))).toBe(false);
    for (const path of Object.values(agentPaths)) {
      expect(await exists(join(targetDirectory, path))).toBe(false);
    }

    const main = await readFile(join(targetDirectory, "src", "main.ts"), "utf8");
    expect(main).not.toContain("integrations/");
    const receiptPath = ".slicemedia/devkit/scaffold-receipt.json";
    expect(receipt.writtenFiles).toContain(receiptPath);
    expect(JSON.parse(await readFile(join(targetDirectory, receiptPath), "utf8"))).toEqual(receipt);
  });

  it.each(PACKAGE_MANAGERS)(
    "generates %s-specific metadata, configuration, and commands",
    async (packageManager) => {
      const { receipt, targetDirectory } = await scaffold(
        `manager-${packageManager}`,
        [],
        ["codex"],
        packageManager,
      );
      const expectation = packageManagerExpectations[packageManager];
      const packageJson = await generatedPackage(targetDirectory);
      const readme = await readFile(join(targetDirectory, "README.md"), "utf8");

      expect(receipt.packageManager).toBe(packageManager);
      expect(packageJson.packageManager).toBe(expectation.metadata);
      for (const command of expectation.commands) expect(readme).toContain(`\`${command}\``);

      if (expectation.npmrc === undefined) {
        expect(await exists(join(targetDirectory, ".npmrc"))).toBe(false);
        expect(receipt.writtenFiles).not.toContain(".npmrc");
      } else {
        await expect(readFile(join(targetDirectory, ".npmrc"), "utf8")).resolves.toBe(
          expectation.npmrc,
        );
        expect(receipt.writtenFiles).toContain(".npmrc");
      }

      if (expectation.yarnrc === undefined) {
        expect(await exists(join(targetDirectory, ".yarnrc.yml"))).toBe(false);
        expect(receipt.writtenFiles).not.toContain(".yarnrc.yml");
      } else {
        await expect(readFile(join(targetDirectory, ".yarnrc.yml"), "utf8")).resolves.toBe(
          expectation.yarnrc,
        );
        expect(receipt.writtenFiles).toContain(".yarnrc.yml");
        await expect(readFile(join(targetDirectory, ".gitignore"), "utf8")).resolves.toContain(
          ".yarn/install-state.gz\n",
        );
      }

      expect(await exists(join(targetDirectory, "pnpm-lock.yaml"))).toBe(false);
      expect(await exists(join(targetDirectory, "package-lock.json"))).toBe(false);
      expect(await exists(join(targetDirectory, "yarn.lock"))).toBe(false);
    },
  );

  it("accepts an existing empty target directory", async () => {
    const targetDirectory = await createTarget("empty-current-directory");
    await mkdir(targetDirectory, { recursive: true });

    const receipt = await scaffoldProject({
      targetDirectory,
      projectName: "empty-current-directory-project",
      packageManager: "npm",
      capabilities: [],
      agentTargets: [],
      templateRoot,
    });

    expect(receipt.targetDirectory).toBe(targetDirectory);
    expect(receipt.packageManager).toBe("npm");
    await expect(access(join(targetDirectory, "package.json"))).resolves.toBeUndefined();
  });

  it("rejects an unsupported package manager before writing files", async () => {
    const targetDirectory = await createTarget("unsupported-manager");
    await expect(
      scaffoldProject({
        targetDirectory,
        projectName: "unsupported-manager-project",
        packageManager: "bun" as PackageManager,
        capabilities: [],
        agentTargets: [],
        templateRoot,
      }),
    ).rejects.toThrow("Unsupported package manager: bun");
    expect(await exists(targetDirectory)).toBe(false);
  });

  it.each(PROJECT_CAPABILITIES)(
    "installs only the %s dependency mapping and writes a disconnected typed integration",
    async (capability) => {
      const { receipt, targetDirectory } = await scaffold(capability, [capability]);
      const expectation = capabilityExpectations[capability];
      const packageJson = await generatedPackage(targetDirectory);

      expect(receipt.capabilities).toEqual([capability]);
      expect(receipt.dependencies).toEqual({ ...baseDependencies, ...expectation.dependencies });
      expect(receipt.integrationFiles).toEqual([expectation.integration]);
      expect(packageJson.dependencies).toEqual({
        ...baseDependencies,
        ...expectation.dependencies,
      });
      const integration = await readFile(join(targetDirectory, expectation.integration), "utf8");
      for (const marker of expectation.markers) expect(integration).toContain(marker);
      expect(await readFile(join(targetDirectory, "src", "main.ts"), "utf8")).not.toContain(
        expectation.integration,
      );

      if (capability === "digitalocean-spaces") {
        expect(integration).not.toMatch(/https?:\/\//u);
        expect(integration).not.toContain("accessKeyId:");
        expect(integration).not.toContain("secretAccessKey:");
        expect(integration).toContain('createDeploymentPlan({ ...config, mode: "stable" })');
        expect(integration).toContain("cdnEndpointId: string;");
        const environment = await readFile(join(targetDirectory, ".env.example"), "utf8");
        expect(environment).toContain("DIGITALOCEAN_SPACES_SECRET_ACCESS_KEY=\n");
        expect(environment).toContain("DIGITALOCEAN_TOKEN=\n");
      } else {
        expect(await readFile(join(targetDirectory, ".env.example"), "utf8")).not.toContain(
          "SPACES_",
        );
      }
    },
  );

  it.each(AGENT_TARGETS)(
    "configures only the selected %s Agent Kit target",
    async (agentTarget) => {
      const { receipt, targetDirectory } = await scaffold(
        `agent-${agentTarget}`,
        [],
        [agentTarget],
      );
      const packageJson = await generatedPackage(targetDirectory);

      expect(receipt.agentTargets).toEqual([agentTarget]);
      expect(receipt.agentGenerateCommand).toBe(
        `slicemedia-agent-kit generate --root . --profile project --targets ${agentTarget}`,
      );
      expect(packageJson.devDependencies).toHaveProperty(
        "@slicemedia/agent-kit",
        EXTERNAL_PRODUCT_VERSION_RANGES.agentKit,
      );
      expect(packageJson.scripts["agents:generate"]).toBe(receipt.agentGenerateCommand);
      await expect(access(join(targetDirectory, "WEBFLOW_PROJECT.md"))).resolves.toBeUndefined();
      for (const path of Object.values(agentPaths)) {
        expect(await exists(join(targetDirectory, path))).toBe(false);
      }
    },
  );

  it("records every selected product in canonical order without auto-importing it", async () => {
    const { receipt, targetDirectory } = await scaffold(
      "all",
      [...PROJECT_CAPABILITIES].reverse(),
      [...AGENT_TARGETS].reverse(),
    );
    const packageJson = await generatedPackage(targetDirectory);

    expect(receipt.capabilities).toEqual(PROJECT_CAPABILITIES);
    expect(receipt.agentTargets).toEqual(AGENT_TARGETS);
    expect(receipt.integrationFiles).toEqual(
      PROJECT_CAPABILITIES.map((capability) => capabilityExpectations[capability].integration),
    );
    expect(packageJson.dependencies).toEqual(
      Object.assign(
        {},
        baseDependencies,
        ...PROJECT_CAPABILITIES.map(
          (capability) => capabilityExpectations[capability].dependencies,
        ),
      ),
    );
    expect(packageJson.scripts["agents:generate"]).toContain(
      "--targets codex,claude,cursor,copilot,webflow",
    );
    for (const path of Object.values(agentPaths)) {
      expect(await exists(join(targetDirectory, path))).toBe(false);
    }

    const devkitConfig = JSON.parse(
      await readFile(join(targetDirectory, "devkit.config.json"), "utf8"),
    ) as { entries: Array<{ api: { capabilities: ProjectCapability[] } }> };
    expect(devkitConfig.entries).toHaveLength(1);
    expect(devkitConfig.entries[0]?.api.capabilities).toEqual(PROJECT_CAPABILITIES);
    expect(await readFile(join(targetDirectory, "src", "main.ts"), "utf8")).not.toContain(
      "integrations/",
    );
  });

  it("supports independent external product versions", async () => {
    const targetDirectory = await createTarget("versions");
    const receipt = await scaffoldProject({
      targetDirectory,
      projectName: "versions-project",
      packageManager: "pnpm",
      capabilities: ["slider", "digitalocean-spaces"],
      agentTargets: ["codex"],
      devkitVersion: "1.2.0",
      agentKitVersion: "~2.0.0-rc.1",
      swiperAdapterVersion: ">=3.0.0 <4.0.0",
      spacesDeployerVersion: "4.0.0 - 4.9.9",
      templateRoot,
    });

    expect(receipt.dependencies).toMatchObject({
      "@slicemedia/devkit-core": "1.2.0",
      "@slicemedia/swiper-adapter": ">=3.0.0 <4.0.0",
      "@slicemedia/spaces-deployer": "4.0.0 - 4.9.9",
    });
    expect(receipt.devDependencies).toMatchObject({
      "@slicemedia/devkit-cli": "1.2.0",
      "@slicemedia/agent-kit": "~2.0.0-rc.1",
    });
  });

  it.each(
    [
      ["tag-latest", "latest"],
      ["tag-next", "next"],
      ["wildcard", "*"],
      ["x-wildcard-major-lower", "1.x"],
      ["x-wildcard-major-upper", "1.X"],
      ["x-wildcard-patch", "1.2.x"],
      ["implicit-major-wildcard", "1"],
      ["implicit-patch-wildcard", "1.2"],
      ["url", "https://example.test/package.tgz"],
      ["file", "file:../package"],
      ["git", "git+https://github.com/example/package.git"],
      ["github", "github:example/package"],
      ["malformed", "^1..2"],
    ].flatMap(([category, range]) =>
      ["devkitVersion", "agentKitVersion", "swiperAdapterVersion", "spacesDeployerVersion"].map(
        (option) => [option, category, range] as const,
      ),
    ),
  )("rejects %s %s dependency override %j before writing", async (option, category, range) => {
    const targetDirectory = await createTarget(`invalid-${option}-${category}`);
    await expect(
      scaffoldProject({
        targetDirectory,
        projectName: "invalid-version-project",
        packageManager: "pnpm",
        capabilities: ["slider", "digitalocean-spaces"],
        agentTargets: ["codex"],
        [option]: range,
        templateRoot,
      }),
    ).rejects.toThrow("controlled npm semantic-version range");
    expect(await exists(targetDirectory)).toBe(false);
  });

  it("refuses every non-empty target without an overwrite escape hatch", async () => {
    const targetDirectory = await createTarget("existing");
    await writeFile(targetDirectory, "not a directory");
    await expect(
      scaffoldProject({
        targetDirectory,
        projectName: "existing-project",
        packageManager: "pnpm",
        capabilities: [],
        agentTargets: [],
        templateRoot,
      }),
    ).rejects.toThrow("new directory");

    const directory = await createTarget("non-empty");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "notes.txt"), "preserve");
    await expect(
      scaffoldProject({
        targetDirectory: directory,
        projectName: "non-empty-project",
        packageManager: "pnpm",
        capabilities: [],
        agentTargets: [],
        templateRoot,
      }),
    ).rejects.toThrow("not empty");
    await expect(readFile(join(directory, "notes.txt"), "utf8")).resolves.toBe("preserve");
  });
});
