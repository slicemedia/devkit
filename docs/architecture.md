# Architecture

The default generated project contains the core runtime, local CLI, a neutral `src/main.ts`, and no
feature behavior. Wizard choices add independent branches:

```text
slider              -> Slice Media Swiper Adapter -> upstream Swiper
animations          -> GSAP
tooltips             -> Tippy.js
DigitalOcean Spaces -> Slice Media Spaces Deployer
agent target         -> Slice Media Agent Kit -> only the selected platform files
```

Existing projects may install the `@slicemedia/devkit` convenience entry, which re-exports the core
runtime and exposes addon authoring through `@slicemedia/devkit/addon`. It adds no initialization or
global behavior; projects that prefer the narrowest dependency surface may keep importing core and
addon packages directly.

DevKit browser dependencies are ESM and side-effect-free. The project entry explicitly initializes
selected behavior and builds into one ES2018 IIFE plus optional CSS. The three optional products
are maintained in independent repositories and versions; DevKit references them only when selected.
No package publishes globals, chooses hosting, or writes Webflow state.

Webflow remains responsible for editable structure, components, CMS, styles, and native
interactions. The official Webflow MCP server handles explicitly requested remote inspection and
changes; the DevKit CLI remains local or read-only.
