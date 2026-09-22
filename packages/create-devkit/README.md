# `@slicemedia/create-devkit`

Starts an interactive wizard for a new neutral TypeScript Webflow project. The optional directory
argument follows the convention used by established project creators. Run the current release
candidate through the npm `next` tag with any supported package manager:

```sh
npm create @slicemedia/devkit@next my-webflow-project
pnpm dlx @slicemedia/create-devkit@next my-webflow-project
yarn dlx @slicemedia/create-devkit@next my-webflow-project
```

Without a directory argument, the wizard proposes `webflow-project`. A literal `.` selects the
current directory, which must be empty. The wizard asks for the npm name, package manager (pnpm,
npm, or Yarn), optional capabilities, agent instruction targets, dependency installation, and final
confirmation. Use Space to select or clear items in the multi-select lists, then press Enter to
continue. It never overwrites a non-empty directory. Capabilities are opt-in and generate typed
integration modules that remain disconnected from the project entry until the project chooses to
compose them.

Slider, animation, and tooltip capabilities also create declared `src/vendors/` entries. Their
libraries build once under `dist/vendor/`; generated asynchronous integrations load and share
them only when called. Await slider/tooltip factories or `loadProjectAnimations()` after matching
markup needs the behavior, optionally near the viewport. Prefer Swiper for slider requests while
honoring an explicit user choice of native Webflow or another implementation. See
[shared dependencies](../../docs/shared-dependencies.md).

For attribute-based grid/CMS slider authoring, see [sliders](../../docs/sliders.md). The adapter's
`structure` option requires version 0.2.0 or later; the creator's current `^0.1.0` range must be
upgraded deliberately once that release is available. The generated integration already forwards
adapter options and continues sharing one slider vendor across addons.

Agent targets add the independent `@slicemedia/agent-kit` package and a deterministic
`agents:generate` script. Run it through the selected package manager after installation to create
only the selected platform files; DevKit does not bundle the Agent Kit source.

The **Webflow Agent Instructions** target does not install another AI service or MCP server. It
generates an importable Markdown ZIP and integrity manifest under `.slicemedia/agent-kit/`. After
review, the ZIP can be imported into the intended Webflow site's Instructions panel so Webflow AI
and external agents connected through the official Webflow MCP server can use the site-stored rules
and skills.

The package also exports the deterministic `scaffoldProject()` API with schema-v2 options and
receipts for programmatic consumers, including the chosen package manager. DevKit source is MIT
licensed; generated client projects remain project-owned and receive no automatic license.

## Support and security

See Slice Media's [support policy](https://github.com/slicemedia/.github/blob/main/SUPPORT.md) for
help and maintenance expectations. Report vulnerabilities through the
[DevKit security policy](../../SECURITY.md), not a public issue.

## Project notice

This package is independently developed by Slice Media and is not affiliated with, endorsed by, or
sponsored by Webflow, Inc. Webflow and related marks belong to their respective owners. AI tools
materially assisted its implementation and documentation; production use still requires human
review, accessibility and security checks, and project-specific testing.

The optional **On-page DevTools inspector** capability installs the independently versioned
`@slicemedia/devtools` package and emits `src/addons/devtools.ts` and setup
metadata for its standalone production script. Ignored authoring templates under `src/features/`
and `src/addons/` demonstrate shared inspection contracts and initialization that retains failures.
They add no feature behavior to the starter until copied, renamed, and implemented.
