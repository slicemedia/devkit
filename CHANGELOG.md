# Changelog

This file records notable changes to the five packages in the Slice Media DevKit fixed release
group. Changes after the initial release are prepared with Changesets.

## 0.1.0 - 2026-08-23

Initial public release.

### Included

- A typed, dependency-free browser runtime for addon lifecycle, DOM readiness, events, shared
  assets, breakpoints, viewport state, and CSS-length helpers.
- Side-effect-free addon authoring primitives plus one explicitly imported neutral lifecycle
  example for people and AI agents.
- A local CLI for CORS-enabled development, ES2018 project bundles, addon catalogs, diagnostics,
  sanitization, and read-only Webflow inspection.
- An interactive creator with safe directory handling, pnpm/npm/Yarn selection, optional
  installation, capability-based dependencies, and target-selective Agent Kit integration.
- A neutral starter that keeps optional integration modules disconnected until the project
  deliberately composes them.
- Complete MIT package metadata, Node 22.13 and Node 24 support, Linux and Windows CI, packed
  consumer matrices, archive inspection, sanitization, and protected npm trusted-publishing gates.
- Compatibility configuration for the independently maintained Slice Media Agent Kit, Swiper
  Adapter, and Spaces Deployer packages.

### Release policy

The `0.1.0` files consolidate the development history that established the initial public API.
There are no pending Changesets for that work, so the first public package version remains
`0.1.0`. Every publishable change after this baseline requires a new Changeset.
