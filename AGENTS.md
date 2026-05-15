# Furry AI State Agent Instructions

This project is paired with the `furry_companion` Codex MCP server.

When the `furry_companion` MCP tool is available, you MUST publish agent presence as work phases change. In Codex this tool may appear as `mcp__furry_companion__set_state`; call it with the same state payload as `set_state`.

- Before analyzing or reading context: call `set_state({ state: "thinking" })`
- Before planning implementation: call `set_state({ state: "planning" })`
- Before editing files: call `set_state({ state: "coding" })`
- Before debugging failures: call `set_state({ state: "debugging" })`
- Before running compile, package, lint, or tests: call `set_state({ state: "testing" })`
- When work completes successfully: call `set_state({ state: "success" })`
- When work is blocked by an unrecoverable error: call `set_state({ state: "error" })`

These calls update the VSCode sidebar webview through:

```text
Codex -> furry_companion MCP tool -> local IPC -> Furry AI State webview
```

If the MCP tool is unavailable in the current Codex session, continue the coding task normally and note that the session must be restarted after MCP configuration changes.
