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
