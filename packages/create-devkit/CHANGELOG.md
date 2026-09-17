# @slicemedia/create-devkit

## 0.2.0

### Minor Changes

- Generate a Spaces deployment integration that selects stable URLs and scoped CDN invalidation.
  Require a project-supplied CDN endpoint ID and add the separate DigitalOcean API token to the
  ignored environment template. Raise the optional Spaces Deployer dependency to ^0.2.0; release
  that product version before publishing this creator change. Deployment stays in the independent
  Spaces Deployer package and is never imported into the browser entry.

## 0.1.1

### Patch Changes

- 38dd3b4: Clarify the wizard multi-select keyboard controls and rename the ambiguous Webflow AI target to Webflow Agent Instructions with an importable-ZIP explanation.
