# Slice Media DevKit

Slice Media DevKit is AI-first development infrastructure for teams building with Webflow. It is a
neutral starting point for small enhancements and large codebases alike: Webflow keeps ownership of
editable layout, components, styles, CMS, forms, and content, while addon scripts provide explicitly
selected interactive behavior and custom animations on that markup.

Under the hood, DevKit provides a typed browser lifecycle, an addon authoring API, a local
development/build CLI, read-only Webflow inspection, and an interactive project wizard. Every
public addon builds into its own standalone ES2018 IIFE plus optional CSS. Generated projects start without feature markup,
selectors, integrations, or hosting assumptions.

For custom animation work, prefer GSAP addons while keeping markup and base styles editable in
Webflow. Follow an explicit user choice first; CSS is suitable for simple state effects, and native
Interactions are suitable when straightforward motion benefits from Designer ownership. See
[animation authoring](docs/animation-authoring.md) for the decision and lifecycle guidance.

## Start a project

To work from source, clone this repository and use Node 22.13+ or Node 24 with pnpm >=11.21 and
<12:

```sh
pnpm install
pnpm create:devkit
```

Launch the creator through npm, pnpm, or Yarn. With no directory argument, the wizard proposes a
new `webflow-project` folder; pass `.` to initialize an empty current folder.

```sh
npm create @slicemedia/devkit@next [directory]
pnpm dlx @slicemedia/create-devkit@next [directory]
yarn dlx @slicemedia/create-devkit@next [directory]
```

The wizard asks which package manager the generated project should use and whether it should
install dependencies immediately. It adds only selected capabilities. Optional integration files
are examples and remain disconnected from public addon/project entries until a human or agent deliberately
composes them.

For an existing codebase, `@slicemedia/devkit` is the optional convenience entry. Direct core and
addon packages remain available when a project prefers the narrowest dependency surface.

```ts
import { createBreakpointService } from "@slicemedia/devkit";
import { defineAddon } from "@slicemedia/devkit/addon";
```

```ts
// Optional addon reference; never loaded by the package root.
import { createExampleAddon } from "@slicemedia/devkit-addon/example";

const addon = createExampleAddon();
await addon.init();
```

```ts
// Optional Slice Media Swiper Adapter, maintained as an independent product.
import { createResponsiveSwiper } from "@slicemedia/swiper-adapter";
import "swiper/css";

createResponsiveSwiper({ target: "[data-wft-slider]", observeMutations: true }).init();
```

In a generated project, use the selected manager's `dev` script for the CORS-enabled local server
and its `build` script for separate files at `dist/addons/<name>.js`. Load only the addon scripts
needed on each Webflow page. Optional project scripts are separate outputs. Hosting stays project-owned. Teams choosing
DigitalOcean Spaces can install the independent `@slicemedia/spaces-deployer` package and use its
reviewed plan/apply workflow. The generated Spaces integration requires Spaces Deployer 0.2 or
newer and selects stable URLs with scoped CDN invalidation. Supply a dedicated project prefix,
the matching CDN endpoint ID, and a DigitalOcean API token during apply. With Spaces Deployer 0.2.1
or newer, bucket versioning is optional; enable it to retain prior files for rollback. Uploads are
verified with version IDs when available, or ETags and planned metadata otherwise. Immutable
release URLs remain available through the deployer's explicit `immutable` mode.

## Product family

- **Slice Media DevKit** — optional `@slicemedia/devkit` convenience entry, core lifecycle, addon
  API, local/read-only CLI, creator, and starter
- **[Slice Media Agent Kit](https://github.com/slicemedia/agent-kit)** — independently maintained,
  target-selective Codex, Claude, Cursor, Copilot, and Webflow instructions
- **[Slice Media Swiper Adapter](https://github.com/slicemedia/swiper-adapter)** — optional
  Webflow-specific adapter around upstream Swiper
- **[Slice Media Spaces Deployer](https://github.com/slicemedia/spaces-deployer)** — optional
  version-preserving deployment for DigitalOcean Spaces

Agent Kit connects projects to the official Webflow MCP server; DevKit does not duplicate the MCP
server or perform remote writes and publishing. If the wizard selects agent targets, the project
adds `@slicemedia/agent-kit`; the generated `agents:generate` script creates only those targets
through the selected package manager.

DevKit source uses the MIT License. Generated client projects remain project-owned and receive no
automatic license.

Maintained releases target Node 22.13+ and Node 24. Core browser output is platform-neutral. The
CLI and wizard are continuously checked on Linux and Windows; hosting and account-specific shell
automation remain outside DevKit.

Project workflows are documented in [generated Webflow setup guides](docs/setup-guides.md),
[opt-in runtime helpers and window callbacks](docs/runtime-helpers.md), and
[private production sourcemaps](docs/private-sourcemaps.md). The complete
[counter example](docs/examples/on-demand-counter/README.md) stays in repository documentation
and is not installed in generated projects.

## Versioning and maintenance

DevKit follows Semantic Versioning. Before `1.0.0`, a minor release may contain a documented
breaking change; patch releases are reserved for compatible fixes. The current `0.x` minor line and
the active npm `next` candidate receive maintenance. Older minor lines are supported only when the
maintainers explicitly announce an exception. Maintenance is best-effort and does not include a
response-time or remediation SLA.

The npm tag `next` identifies the release currently being evaluated. The tag `latest` identifies
the version recommended for general use. Tags can move between already published versions; they
are not part of the semantic version itself.

## Independent project notice

Slice Media DevKit is independently developed by Slice Media. It is not affiliated with, endorsed
by, or sponsored by Webflow, Inc. Webflow and related marks belong to their respective owners.

## AI disclaimer

AI tools materially assisted the implementation and documentation of this project. AI-generated
work can contain defects, security issues, accessibility regressions, and incorrect assumptions; it
cannot guarantee production behavior. Human review, accessibility and security checks, and
project-specific testing remain required before release.
