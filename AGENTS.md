# Furry AI State Agent Instructions

This project is paired with the `furry_companion` Codex MCP server.

When the `furry_companion` MCP tool is available, you MUST publish agent presence as work phases change. In Codex this tool may appear as `mcp__furry_companion__set_state`; call it with the same state payload as `set_state`.

- Before analyzing or reading context: call `set_state({ state: "thinking", message: "Reading the request and workspace context." })`
- Before planning implementation: call `set_state({ state: "planning", message: "Planning the implementation steps." })`
- Before editing files: call `set_state({ state: "coding", message: "Editing the primary implementation file.", file: "src/example.ts" })`
- Before debugging failures: call `set_state({ state: "debugging", message: "Investigating a failed build or runtime issue." })`
- Before running compile, package, lint, or tests: call `set_state({ state: "testing", message: "Running validation commands." })`
- When work completes successfully: call `set_state({ state: "success", message: "Implementation and verification are complete." })`
- When work is blocked by an unrecoverable error: call `set_state({ state: "error", message: "Blocked by an unrecoverable error." })`

Use `file` only when there is a meaningful current code file. Use `message` for the status detail shown in the sidebar webview.

These calls update the VSCode webview through:

```text
Codex -> furry_companion MCP tool -> local IPC -> Furry AI State sidebar/editor webview
```

If the MCP tool is unavailable in the current Codex session, continue the coding task normally and note that the session must be restarted after MCP configuration changes.

## Project Components

### furry-ai-state

`furry-ai-state` is the VSCode extension in this workspace. It owns the editor UI:

- registers the `Furry AI State` Activity Bar container and `AI State` webview view.
- connects to the local IPC bridge with Node `net`.
- parses newline-delimited JSON state events from `furry-companion-mcp`.
- renders the current state image, state label, connection status, optional `message`, and optional `file`.
- automatically reconnects when the IPC bridge is unavailable or restarted.

Important files:

- `src/extension.ts`: extension activation and command registration.
- `src/companionController.ts`: wires configuration, IPC client events, and the webview provider.
- `src/companionIpcClient.ts`: connects to the local IPC path and emits state/connection changes.
- `src/stateViewProvider.ts`: builds the shared webview HTML, posts state updates, and switches the webview between sidebar and editor positions.
- `media/main.js`: webview-side DOM update script.
- `media/styles.css`: webview styling.

### furry-companion-mcp

`furry-companion-mcp` is the MCP server project in `D:\IntegratedSourceOnDesktop\mcp-server`. It owns the agent-facing runtime:

- exposes a stdio MCP tool named `set_state`.
- validates supported states and optional detail fields.
- emits state events on an internal event bus.
- starts a local JSON Lines IPC bridge for UI consumers.
- supports multiple running MCP processes: the first process owns the IPC bridge, and later processes relay their state events into the existing bridge.
- includes agent instruction snippets under `skills/` for Codex, Cursor, and Claude-style workflows.

The MCP server uses stdio for MCP communication. It does not expose MCP over websocket.

## Extension Behavior

The extension listens to the `furry-companion-mcp` local IPC JSON Lines bridge and maps agent states to bundled illustrations:

- `thinking`, `planning`, `idle` -> `media/images/thinking.png`
- `coding`, `testing`, `debugging`, `error` -> `media/images/building.png`
- `success` -> `media/images/completed.png`

The webview also renders optional state details from the MCP runtime:

- `message`: short text describing what the AI agent is doing.
- `file`: the current code file being edited, shown when the agent publishes one.

Users can run `Furry AI State: Set Webview Position` from the command palette to choose where the webview is shown:

- `sidebar`: use the contributed `AI State` sidebar webview, matching the original behavior.
- `editor`: open the same webview in an editor tab via `vscode.window.createWebviewPanel`.

Switching to `editor` clears the sidebar webview, opens the editor `WebviewPanel`, and closes the sidebar container through `workbench.action.closeSidebar`; switching to `sidebar` disposes the editor `WebviewPanel`. State updates should only be posted to the active display mode.

When the user clicks the Activity Bar icon, route the visible view through `furry-ai-state.webviewPosition`: `sidebar` initializes and shows the contributed sidebar view, while `editor` opens the editor panel and closes the sidebar instead of rendering sidebar content.

Do not call sidebar focus commands from the sidebar visibility route when `webviewPosition` is `sidebar`; the Activity Bar click already made the view visible, and refocusing it again causes visible flicker.

The command is `furry-ai-state.setWebviewPosition`. It may be called with an optional argument of `"sidebar"` or `"editor"`; without an argument it shows a Quick Pick.

The webview page must not scroll. `media/main.js` dynamically computes the available image-frame height from the visible text/button rows, then sizes the image from its natural aspect ratio against both the available width and height. The image must not be forced to fill the webview width; it should scale only as large as possible while keeping the full image and all text visible.

## Development

```bash
npm install
npm run compile
```

Launch the extension from VSCode with `Run Extension`.

## Runtime

Codex is configured to start the local MCP server automatically:

```toml
[mcp_servers.furry_companion]
command = "node"
args = ['D:\IntegratedSourceOnDesktop\mcp-server\dist\index.js']
```

Restart the Codex session after changing MCP configuration. The current session cannot hot-load newly added MCP tools.

The extension connects to the default IPC path:

- Windows: `\\.\pipe\furry-companion-mcp`
- macOS/Linux: `/tmp/furry-companion-mcp.sock`

Configure a custom path with `furry-ai-state.ipcPath`.

Configure the webview location with `furry-ai-state.webviewPosition`:

- `sidebar`
- `editor`

Multiple `furry-companion-mcp` processes are supported. The first process owns the IPC bridge, and later processes relay their state events into the existing bridge.

Example state payload:

```ts
set_state({
  state: "coding",
  message: "Updating the webview state renderer.",
  file: "src/stateViewProvider.ts"
})
```

## Install MCP For Agents

There are two supported installation paths.

### Option 1: Send This Sentence To The Agent

Send this sentence to Codex or another agent that can edit its own MCP configuration:

```text
Please add the furry_companion MCP server to your MCP configuration with command "node" and args ["D:\\IntegratedSourceOnDesktop\\mcp-server\\dist\\index.js"], then restart the agent session so the new MCP tool is loaded.
```

For Codex, the equivalent command is:

```bash
codex mcp add furry_companion -- node D:\IntegratedSourceOnDesktop\mcp-server\dist\index.js
```

After npm publish, use the package entry instead:

```text
Please add the furry_companion MCP server to your MCP configuration with command "npx" and args ["-y", "furry-companion-mcp"], then restart the agent session so the new MCP tool is loaded.
```

### Option 2: Configure MCP Manually

Add this MCP server entry to the client configuration.

Codex stores MCP configuration in `C:\Users\MMKJ\.codex\config.toml`:

```toml
[mcp_servers.furry_companion]
command = "node"
args = ['D:\IntegratedSourceOnDesktop\mcp-server\dist\index.js']
```

Cursor and Claude Desktop use the common `mcpServers` JSON shape:

```json
{
  "mcpServers": {
    "furry_companion": {
      "command": "node",
      "args": ["D:\\IntegratedSourceOnDesktop\\mcp-server\\dist\\index.js"]
    }
  }
}
```

After npm publish, the manual JSON configuration can use `npx`:

```json
{
  "mcpServers": {
    "furry_companion": {
      "command": "npx",
      "args": ["-y", "furry-companion-mcp"]
    }
  }
}
```

Restart the agent after changing MCP configuration. Current agent sessions usually cannot hot-load newly added MCP tools.
