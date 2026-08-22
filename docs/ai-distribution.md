# Agent Kit integration

Slice Media Agent Kit is maintained at
[`slicemedia/agent-kit`](https://github.com/slicemedia/agent-kit), outside this repository. DevKit
always supplies a concise, project-owned `WEBFLOW_PROJECT.md`. When the wizard selects one or more agent targets,
the generated project adds `@slicemedia/agent-kit` and an `agents:generate` script with exactly
those Codex, Claude, Cursor, Copilot, or Webflow targets.

Install dependencies with the package manager selected in the wizard, then run its
`agents:generate` script. Agent Kit preserves the project guide and does not claim it as generated
output. Unselected platform files are not created. Agent Kit owns MCP version routing, skill
validation, the standalone Codex plugin, and its generated metadata under `.slicemedia/agent-kit/`.

Official Webflow skills remain external rather than being copied into DevKit.
