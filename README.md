# Furry AI State

`furry-ai-state` is a VSCode extension for visualizing what an AI coding agent is doing. It displays companion illustrations, the current agent phase, optional status text, and the active file reported by the agent runtime.

The extension works with `furry-companion-mcp`, a companion MCP runtime that receives agent state updates through the `set_state` tool and broadcasts them to the VSCode webview through a local IPC bridge.

```text
AI client
-> furry-companion-mcp set_state tool
-> local JSON Lines IPC bridge
-> furry-ai-state VSCode extension
-> sidebar or editor webview
```

Project document and instruction: [Feishu document](https://kcnhl2uub4k0.feishu.cn/wiki/OuBCwjPX7iBL9PkZOjccKvGQnGf?from=from_copylink)

## Download

### Install From VSIX

Download `furry-ai-state-0.1.0.vsix` from this repository's release artifacts, then install it in VSCode:

```bash
code --install-extension furry-ai-state-0.1.0.vsix
```

You can also install it from VSCode with `Extensions: Install from VSIX...`.

### Build Locally

Clone the repository, install dependencies, and package the extension:

```bash
npm install
npm run package
```

The generated plugin file is:

```text
furry-ai-state-0.1.0.vsix
```
