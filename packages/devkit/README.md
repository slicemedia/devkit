# `@slicemedia/devkit`

The optional convenience package for Slice Media DevKit. Its root re-exports the side-effect-free
browser runtime from `@slicemedia/devkit-core`; the `@slicemedia/devkit/addon` subpath exposes addon
authoring primitives.

```sh
npm install @slicemedia/devkit@next
```

```ts
import { createBreakpointService, whenDomReady } from "@slicemedia/devkit";
import { defineAddon } from "@slicemedia/devkit/addon";
```

Importing either entry does not install a global runtime, initialize behavior, or load the optional
addon example. Applications that want the smallest dependency surface may continue to install and
import `@slicemedia/devkit-core` or `@slicemedia/devkit-addon` directly.

## Project notice

Licensed under MIT. This package is independently developed by Slice Media and is not affiliated
with, endorsed by, or sponsored by Webflow, Inc. Webflow and related marks belong to their
respective owners. AI tools materially assisted its implementation and documentation; production
use still requires human review, accessibility and security checks, and project-specific testing.
