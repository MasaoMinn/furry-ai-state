import path from "node:path";
import { tmpdir } from "node:os";
import * as vscode from "vscode";

const DEFAULT_IPC_NAME = "furry-companion-mcp";

export function getDefaultIpcPath(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\${DEFAULT_IPC_NAME}`;
  }

  return path.join(tmpdir(), `${DEFAULT_IPC_NAME}.sock`);
}

export function resolveConfiguredIpcPath(): string {
  const configuredPath = vscode.workspace
    .getConfiguration("furry-ai-state")
    .get<string>("ipcPath", "")
    .trim();

  return configuredPath || getDefaultIpcPath();
}

export function getReconnectDelayMs(): number {
  const value = vscode.workspace
    .getConfiguration("furry-ai-state")
    .get<number>("reconnectDelayMs", 1000);

  return Math.min(Math.max(value, 250), 30000);
}

export function isCompanionEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("furry-ai-state")
    .get<boolean>("enabled", true);
}
