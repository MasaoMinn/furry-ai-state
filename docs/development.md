# Furry AI State 开发文档

## 项目定位

`furry-ai-state` 是一个独立 VSCode 插件，不依赖 `furry-ts-errors`。它只负责在侧边栏 Webview 中展示 AI Agent 当前状态对应的兽设插画。

整体链路：

```text
AI Agent
-> furry-companion-mcp set_state tool
-> MCP Runtime EventEmitter
-> local IPC JSON Lines bridge
-> furry-ai-state VSCode Extension
-> sidebar Webview
```

MCP server 继续只使用 `StdioServerTransport`。VSCode 插件不实现 MCP transport，也不使用 websocket。

## 目录结构

```text
furry-ai-state/
├─ src/
│  ├─ extension.ts
│  ├─ companionController.ts
│  ├─ companionIpcClient.ts
│  ├─ ipcPath.ts
│  ├─ protocol.ts
│  └─ stateViewProvider.ts
├─ media/
│  ├─ images/
│  │  ├─ thinking.png
│  │  ├─ building.png
│  │  └─ completed.png
│  ├─ main.js
│  └─ styles.css
├─ assets/
│  └─ activitybar.svg
├─ docs/
│  └─ development.md
├─ package.json
└─ tsconfig.json
```

## 通信协议

插件通过 Node `net` 连接 MCP runtime 的本地 IPC。

默认 IPC 地址：

- Windows: `\\.\pipe\furry-companion-mcp`
- macOS/Linux: `/tmp/furry-companion-mcp.sock`

每一行是一条 JSON：

```json
{"type":"state","state":"thinking"}
```

状态类型：

```ts
type AgentState =
  | "idle"
  | "thinking"
  | "planning"
  | "coding"
  | "testing"
  | "debugging"
  | "success"
  | "error";
```

## Webview 消息

Extension host 收到 IPC 状态后向 Webview 发送：

```ts
webview.postMessage({
  command: "state-update",
  state,
  stateLabel,
  imageUri,
  connectionStatus,
  connectionLabel
});
```

Webview 只负责渲染，不直接连接 IPC。

## 插画映射

```ts
const stateImageMap = {
  idle: "thinking.png",
  thinking: "thinking.png",
  planning: "thinking.png",
  coding: "building.png",
  testing: "building.png",
  debugging: "building.png",
  error: "building.png",
  success: "completed.png"
};
```

图片来源已重新复制到本项目：

- `media/images/thinking.png`
- `media/images/building.png`
- `media/images/completed.png`

## 配置项

`package.json` 暴露：

- `furry-ai-state.enabled`: 是否启用 IPC 连接。
- `furry-ai-state.ipcPath`: 自定义 IPC 地址，空值使用平台默认地址。
- `furry-ai-state.reconnectDelayMs`: 初始重连延迟。

## 本地开发

1. 安装依赖：

```bash
npm install
```

2. 编译插件：

```bash
npm run compile
```

3. 在 VSCode 中打开 `furry-ai-state`，按 `F5` 启动 Extension Development Host。

4. 启动 Codex。

本机 Codex 已配置全局 MCP server：

```toml
[mcp_servers.furry_companion]
command = "node"
args = ['D:\IntegratedSourceOnDesktop\mcp-server\dist\index.js']
```

因此在 `furry-ai-state` 项目内新启动 Codex 时，Codex 会把 `furry-companion-mcp` 作为 stdio MCP tool server 拉起。插件连接同一个 runtime 暴露的本地 IPC：

```text
\\.\pipe\furry-companion-mcp
```

如果配置刚刚新增，需要重启 Codex 会话后工具才会出现在工具列表中。

多个 `furry-companion-mcp` 进程可以共存。第一个进程会成为 IPC bridge server，后续进程会自动进入 relay 模式，把自己的状态事件转发给已有 bridge。

5. Codex 在工作阶段主动调用：

```ts
set_state({ state: "thinking" })
set_state({ state: "coding" })
set_state({ state: "success" })
```

侧边栏应分别展示思考、构建、完成三张图。

## Codex MCP 配置

配置文件：

```text
C:\Users\MMKJ\.codex\config.toml
```

当前新增项：

```toml
[mcp_servers.furry_companion]
command = "node"
args = ['D:\IntegratedSourceOnDesktop\mcp-server\dist\index.js']
```

配置验证：

```bash
codex mcp list
```

项目级 `AGENTS.md` 已要求 Codex 在 `thinking`、`planning`、`coding`、`debugging`、`testing`、`success`、`error` 等阶段调用 `set_state`。这让 VSCode 插件 Webview 可以跟随 Codex 的工作状态切换插画。

## 给 Agent 安装 MCP

### Codex

本地开发版本：

```bash
codex mcp add furry_companion -- node D:\IntegratedSourceOnDesktop\mcp-server\dist\index.js
```

npm 发布后：

```bash
codex mcp add furry_companion -- npx -y furry-companion-mcp
```

检查：

```bash
codex mcp list
codex mcp get furry_companion
```

改完 MCP 配置后，需要重启 Codex 会话。当前会话不会热加载新增 tool。

### Cursor

在项目或用户级 MCP 配置中加入：

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

npm 发布后可改成：

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

然后重启 Cursor 或刷新 MCP server。

### Claude Desktop

在 Claude Desktop MCP 配置中加入：

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

npm 发布后同样可以使用 `npx -y furry-companion-mcp`。保存后重启 Claude Desktop。

## 后续开发建议

- 增加命令：从插件内启动或停止 `furry-companion-mcp` 子进程。
- 增加状态历史列表，便于调试 Agent 阶段切换。
- 增加自定义图片配置，允许用户替换每个状态的插画。
- 增加 packaged `.vsix` 发布流程。
