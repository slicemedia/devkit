# Contributing

Contributors must follow the Slice Media organization-wide Code of Conduct published through the
shared `.github` community-health repository.

1. Use neutral, synthetic examples only; never copy client history, content, identifiers, assets,
   selectors, URLs, or credentials.
2. Keep ESM imports side-effect-free and put site composition only in the consumer project.
3. Keep layout, content, and base styling Webflow-native, and use documented `data-wft-*` hooks for
   added behavior. Follow the user's animation choice; otherwise prefer GSAP addons for custom
   motion, with CSS or native Interactions for clearly suitable simple effects. See
   [animation authoring](docs/animation-authoring.md).
4. Add lifecycle, cleanup, missing-markup, multiple-instance, and relevant accessibility tests.
5. Run `pnpm check`, `pnpm test:packed-consumer`, and `pnpm sanitize -- --json` before delivery.
6. Do not publish packages, change repository visibility, deploy artifacts, or mutate a Webflow site
   without an explicit request and the applicable safety workflow.
7. Keep Agent Kit, Swiper Adapter, and Spaces Deployer integration at package boundaries; do not copy
   their implementations back into DevKit.
