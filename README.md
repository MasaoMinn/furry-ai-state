# Furry AI State

Standalone VSCode extension for displaying AI companion state illustrations in a sidebar webview.

It listens to the `furry-companion-mcp` local IPC JSON Lines bridge and maps agent states to bundled illustrations:

- `thinking`, `planning`, `idle` -> `media/thinking.png`
- `coding`, `testing`, `debugging`, `error` -> `media/building.png`
- `success` -> `media/completed.png`

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

## Install MCP For Agents

Codex local development:

```bash
codex mcp add furry_companion -- node D:\IntegratedSourceOnDesktop\mcp-server\dist\index.js
```

After npm publish:

```bash
codex mcp add furry_companion -- npx -y furry-companion-mcp
```

Cursor and Claude Desktop use the same MCP server shape:

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

Restart the agent after changing MCP configuration.
