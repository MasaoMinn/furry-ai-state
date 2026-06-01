# Furry AI State Agent Guide

This workspace is a VSCode extension that displays AI-agent runtime state in a webview. It consumes state events from the paired `furry_companion` MCP runtime through local IPC, then renders an image, state label, connection status, optional `message`, and optional `file`.

## Agent Presence

When the `furry_companion` MCP tool is available, publish work phases with `set_state` / `mcp__furry_companion__set_state`:

- `thinking`: before reading or analyzing context.
- `planning`: before deciding implementation steps.
- `coding`: before editing files; include `file` when one code file is the focus.
- `testing`: before compile, package, lint, or test commands.
- `debugging`: before investigating failed validation or runtime behavior.
- `success`: when implementation and verification finish.
- `error`: when blocked by an unrecoverable problem.

Use short, concrete `message` values because they are shown directly in the webview.

## Project Map

- `src/extension.ts`: extension activation, command registration, and provider wiring.
- `src/companionController.ts`: connects configuration, IPC client events, and webview updates.
- `src/companionIpcClient.ts`: Node `net` IPC client with reconnect behavior.
- `src/stateViewProvider.ts`: shared webview HTML, message handling, state posting, and sidebar/editor switching.
- `media/main.js`: webview DOM updates and image sizing.
- `media/styles.css`: webview layout and styling.
- `src/protocol.ts`: state and connection event types shared inside the extension.

The paired MCP server lives outside this repo at `D:\IntegratedSourceOnDesktop\mcp-server`. It exposes `set_state` over stdio and broadcasts JSON Lines state events through local IPC.

MCP project files are in `D:\IntegratedSourceOnDesktop\mcp-server`; check that repo when changing MCP tool schemas, runtime behavior, IPC payloads, or agent-facing install instructions.

## Behavior Rules

- Supported states are `idle`, `thinking`, `planning`, `coding`, `testing`, `debugging`, `success`, and `error`.
- Image mapping must stay stable:
  - `idle`, `thinking`, `planning` -> `media/images/thinking.png`
  - `coding`, `debugging`, `error` -> `media/images/building.png`
  - `testing` -> `media/images/testing.png`
  - `success` -> `media/images/completed.png`
- Preserve optional `message` and `file` end to end from IPC event to webview rendering.
- Webview initialization and reconnect actions should reset the visible state to `idle` until a new IPC state event arrives; reconnect must track the last accepted agent state and ignore it if the IPC bridge immediately replays it.
- When making changes related to MCP tools or the paired MCP server, explicitly report which MCP files or contracts changed.
- Webview location is controlled by `furry-ai-state.webviewPosition` with values `sidebar` and `editor`.
- Custom state images are controlled by `furry-ai-state.customImages`, keyed by agent state and storing local image file paths.
- `Furry AI State: Customize Images` lets users pick local replacement images or reset back to bundled images.
- Missing, unreadable, or failed custom image resources must fall back to the bundled image for that state.
- Only the active display mode should receive state updates.
- Switching to `editor` should clear sidebar content, open/focus the editor `WebviewPanel`, and avoid closing the global VSCode Sidebar.
- Switching to `sidebar` should dispose the editor `WebviewPanel` and show the contributed sidebar view.
- Do not call sidebar focus commands from the sidebar visibility route when already in `sidebar`; Activity Bar clicks already made the view visible and extra focus causes flicker.
- Do not call `workbench.action.closeSidebar`; users can move the WebviewView into Explorer, and closing the whole Sidebar can make Explorer impossible to open.

## Webview UI Rules

- The status area action bar contains reconnect, webview position toggle, action guide link, and GitHub link buttons.
- Webview scripts should post commands to the extension host; external links must be opened with `vscode.env.openExternal`.
- The webview page must not scroll.
- The full image and all text must remain visible by dynamically sizing the image frame and scaling the image with its natural aspect ratio.
- The image must not be forced to fill the webview width; scale it only as large as available width and height allow.

## Development Checks

Run these before finishing code changes:

```bash
npm run compile
node --check media/main.js
git diff --check
```

Use `npm run package` when a VSIX artifact is requested.
