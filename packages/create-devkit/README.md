# `@slicemedia/create-devkit`

Starts an interactive wizard for a new neutral TypeScript Webflow project. The optional directory
argument follows the convention used by established project creators:

```sh
create-slicemedia-devkit [directory]
create-slicemedia-devkit .
```

Without a directory argument, the wizard proposes `webflow-project`. A literal `.` selects the
current directory, which must be empty. The wizard asks for the npm name, package manager (pnpm,
npm, or Yarn), optional capabilities, agent instruction targets, dependency installation, and final
confirmation. It never overwrites a non-empty directory. Capabilities are opt-in and generate typed
integration modules that remain disconnected from the project entry until the project chooses to
compose them.

Agent targets add the independent `@slicemedia/agent-kit` package and a deterministic
`agents:generate` script. Run it through the selected package manager after installation to create
only the selected platform files; DevKit does not bundle the Agent Kit source.

The package also exports the deterministic `scaffoldProject()` API with schema-v2 options and
receipts for programmatic consumers, including the chosen package manager. DevKit source is MIT
licensed; generated client projects remain project-owned and receive no automatic license.
