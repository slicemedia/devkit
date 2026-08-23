# Security Policy

## Reporting a vulnerability

Report a suspected vulnerability through
[GitHub private vulnerability reporting](https://github.com/slicemedia/devkit/security/advisories/new).
Do not disclose it in a public issue, discussion, pull request, or social post before the maintainers
have had an opportunity to investigate.

If GitHub private reporting is unavailable, email `hallo@slicemedia.de`. Include the affected
package and version, impact, reproduction steps, and any proposed mitigation that can be shared
safely. Do not include production credentials, access tokens, personal data, or confidential client
material; provide a neutral reproduction instead.

Reports are handled on a best-effort basis. Slice Media does not promise a particular response or
remediation time. We may ask for additional evidence, coordinate a disclosure date, or close a
report that cannot be reproduced or does not cross a security boundary.

## Supported versions

| Release line                                       | Security maintenance        |
| -------------------------------------------------- | --------------------------- |
| Current `0.x` minor on `latest`                    | Supported                   |
| Active release candidate on `next`                 | Supported during evaluation |
| Older minor lines and unsupported Node.js versions | Not normally supported      |

Before `1.0.0`, documented breaking changes may ship in a minor version. Consumers should pin or
review minor updates according to their risk requirements. Maintained DevKit releases support Node
22.13+ and Node 24; browser runtime support also depends on the target project's build and browser
policy.

## Security boundaries

- Keep Webflow OAuth data, site IDs, deployment credentials, and targets out of source control.
- Use official Webflow MCP permissions and explicit confirmation for remote writes or publication.
- DevKit does not perform credentialed deployment. Report Spaces Deployer issues in its independent
  repository.
- Inspect source, generated files, bundles, archives, package tarballs, logs, and reachable Git
  history before a release.
- AI-assisted code and documentation still require human security, accessibility, and
  project-specific review.
