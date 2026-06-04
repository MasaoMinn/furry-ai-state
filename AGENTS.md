# Furry AI State Agent Guide

This workspace is a VSCode extension that displays AI-agent runtime state in a webview. It consumes state events from the paired `furry_companion` MCP runtime through local IPC, then renders an image, state label, connection status, optional `message`, and optional `file`.

## Agent Presence

When the `furry_companion` MCP tool is available, publish work phases with `set_state` / `mcp__furry_companion__set_state`:

- `thinking`: before reading or analyzing context.
- `planning`: before deciding implementation steps.
- `coding`: before editing files; include `file` when one code file is the focus.
- `testing`: before compile, package, lint, or test commands.
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
- `media/settings.js`: image settings webview DOM updates and extension-host commands.
- `media/settings.css`: image settings webview layout and styling.
- `src/protocol.ts`: state and connection event types shared inside the extension.

The paired MCP server lives outside this repo at `D:\IntegratedSourceOnDesktop\mcp-server`. It exposes `set_state` over stdio and broadcasts JSON Lines state events through local IPC.

MCP project files are in `D:\IntegratedSourceOnDesktop\mcp-server`; check that repo when changing MCP tool schemas, runtime behavior, IPC payloads, or agent-facing install instructions.

## Behavior Rules

- Supported states are `idle`, `thinking`, `planning`, `coding`, `testing`, `success`, and `error`.
- Image mapping must stay stable:
  - `idle` -> `media/images/idle/idle-1.gif`
  - `thinking` -> `media/images/thinking/thinking-1.gif`
  - `planning` -> `media/images/planning/planning-1.gif`
  - `coding` -> `media/images/coding/coding-1.gif`
  - `testing` -> `media/images/testing/testing-1.gif`
  - `success` -> `media/images/success/success-1.gif`
  - `error` -> `media/images/error/error-1.gif`
- Preserve optional `message` and `file` end to end from IPC event to webview rendering.
- Webview initialization and reconnect actions should reset the visible state to `idle` until a new IPC state event arrives; reconnect must track the last accepted agent state and ignore it if the IPC bridge immediately replays it.
- When making changes related to MCP tools or the paired MCP server, explicitly report which MCP files or contracts changed.
- Webview location is controlled by `furry-ai-state.webviewPosition` with values `sidebar` and `editor`.
- Custom state images are controlled by `furry-ai-state.customImages`, keyed by agent state and storing local image file paths.
- Bundled state image choices are controlled by `furry-ai-state.bundledImages`, keyed by agent state and storing bundled image file names from that state's image folder.
- Bundled image folders may contain PNG or animated GIF resources; both the agent state webview and image settings webview must render GIFs through normal `<img>` previews.
- `Furry AI State: Customize Pictures` and the status action-bar settings button open an editor webview settings page with previews, per-state local image selection, per-state provided image selection, per-state reset, and reset-all.
- Provided image options in the settings page must show image previews and apply immediately when clicked.
- The image settings page must show one image item per row, show custom image paths fully without truncation, confirm reset actions with a modal, use a blue badge for bundled images, and use a green badge for custom images.
- Missing, unreadable, or failed custom image resources must fall back to the bundled image for that state.
- Only the active display mode should receive state updates.
- Switching to `editor` should clear sidebar content, open/focus the editor `WebviewPanel`, and avoid closing the global VSCode Sidebar.
- Switching to `sidebar` should dispose the editor `WebviewPanel` and show the contributed sidebar view.
- Do not call sidebar focus commands from the sidebar visibility route when already in `sidebar`; Activity Bar clicks already made the view visible and extra focus causes flicker.
- Do not call `workbench.action.closeSidebar`; users can move the WebviewView into Explorer, and closing the whole Sidebar can make Explorer impossible to open.

## Webview UI Rules

- The status area action bar contains reconnect, webview position toggle, image settings, action guide link, and GitHub link buttons.
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
