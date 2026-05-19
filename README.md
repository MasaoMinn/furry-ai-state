# Furry AI State

`furry-ai-state` is a VSCode sidebar extension for visualizing what an AI coding agent is doing. It displays bundled companion illustrations, the current agent phase, optional status text, and the active file reported by the agent runtime.

project document and instruction: [Feishu document](https://kcnhl2uub4k0.feishu.cn/wiki/OuBCwjPX7iBL9PkZOjccKvGQnGf?from=from_copylink)

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
- `src/stateViewProvider.ts`: builds the webview HTML and posts updates into it.
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

It listens to the `furry-companion-mcp` local IPC JSON Lines bridge and maps agent states to bundled illustrations:

- `thinking`, `planning`, `idle` -> `media/images/thinking.png`
- `coding`, `testing`, `debugging`, `error` -> `media/images/building.png`
- `success` -> `media/images/completed.png`

The webview also renders optional state details from the MCP runtime:

- `message`: short text describing what the AI agent is doing.
- `file`: the current code file being edited, shown when the agent publishes one.

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
