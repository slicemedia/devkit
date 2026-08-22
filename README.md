# Slice Media DevKit

Slice Media DevKit is AI-first development infrastructure for teams building with Webflow. It is a
neutral starting point for small enhancements and large codebases alike: Webflow keeps ownership of
editable layout, components, styles, CMS, forms, and content, while the project bundle adds only the
interactive behavior Webflow does not provide.

Under the hood, DevKit provides a typed browser lifecycle, an addon authoring API, a local
development/build CLI, read-only Webflow inspection, and an interactive project wizard. Every
generated project owns one ES2018 IIFE plus optional CSS and starts without feature markup,
selectors, integrations, or hosting assumptions.

## Start a project

During private development, clone this repository and use Node 22.13+ or Node 24 with pnpm >=11.21
and <12:

```sh
pnpm install
pnpm create:devkit
```

After publication, launch the same creator through npm, pnpm, or Yarn. With no directory argument,
the wizard proposes a new `webflow-project` folder; pass `.` to initialize an empty current folder.

```sh
npm create @slicemedia/devkit@next [directory]
pnpm dlx @slicemedia/create-devkit@next [directory]
yarn dlx @slicemedia/create-devkit@next [directory]
```

The wizard asks which package manager the generated project should use and whether it should
install dependencies immediately. It adds only selected capabilities. Optional integration files
are examples and remain disconnected from `src/main.ts` until a human or agent deliberately
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
and its `build` script for the site-owned bundle. Hosting stays project-owned. Teams choosing
DigitalOcean Spaces can install the independent `@slicemedia/spaces-deployer` package and use its
reviewed plan/apply workflow.

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

DevKit source uses the MIT License. Generated client projects remain project-owned and receive
no automatic license. All repositories and packages stay private until Slice Media explicitly
prepares them for release.

Maintained releases target Node 22.13+ and Node 24. Core browser output is platform-neutral. The
CLI and wizard are continuously checked on Linux and Windows; hosting and account-specific shell
automation remain outside DevKit.

## AI disclaimer

AI assisted heavily in building this project. AI-generated code can contain defects, security
issues, accessibility regressions, and incorrect assumptions; it cannot guarantee bulletproof
production behavior. Human review, accessibility and security checks, and project-specific testing
remain required before release.
