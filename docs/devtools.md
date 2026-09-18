# On-page DevTools

The optional inspector is now the independently versioned **`@slicemedia/devtools`** package.
Select **On-page DevTools inspector** in the project wizard to install it and generate
`src/addons/devtools.ts`, or install it later. Neutral projects do not depend on the inspector.

- [Package documentation and installation](../packages/devtools/README.md)
- [Standalone hosting without a local server](../packages/devtools/README.md#use-without-a-local-server)
- [Complete usage, controls, activation, and diagnostic limits](../packages/devtools/docs/usage.md)
- [Shared addon inspection API](inspection-api.md)

The project entry still builds to `dist/addons/devtools.js`. The package also ships the ready-made
`dist/devtools.global.js`; either can be hosted with the other addon scripts. No local environment
is needed to use a hosted build. Public npm CDN URLs require a published package version.

Migrate the earlier development imports `@slicemedia/devkit-core/devtools` and
`@slicemedia/devkit/devtools` to `@slicemedia/devtools`. The console API and storage preferences
remain compatible.
