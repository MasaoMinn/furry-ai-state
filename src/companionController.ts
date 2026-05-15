import * as vscode from "vscode";
import { CompanionIpcClient } from "./companionIpcClient";
import {
  getReconnectDelayMs,
  isCompanionEnabled,
  resolveConfiguredIpcPath
} from "./ipcPath";
import { StateViewProvider } from "./stateViewProvider";

export class CompanionController implements vscode.Disposable {
  private client: CompanionIpcClient | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly provider: StateViewProvider,
    private readonly output: vscode.OutputChannel
  ) {}

  start(): void {
    this.restart();

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("furry-ai-state.enabled") ||
          event.affectsConfiguration("furry-ai-state.ipcPath") ||
          event.affectsConfiguration("furry-ai-state.reconnectDelayMs")
        ) {
          this.restart();
        }
      })
    );
  }

  restart(): void {
    this.client?.dispose();
    this.client = null;

    if (!isCompanionEnabled()) {
      this.provider.updateConnection({
        status: "disabled",
        detail: "furry-ai-state.enabled is false"
      });
      return;
    }

    const ipcPath = resolveConfiguredIpcPath();
    const reconnectDelayMs = getReconnectDelayMs();
    const client = new CompanionIpcClient(
      ipcPath,
      reconnectDelayMs,
      this.output
    );

    this.client = client;
    this.disposables.push(
      client.onDidChangeState((event) => {
        this.output.appendLine(`AI Companion state: ${event.state}`);
        this.provider.updateState(event.state);
      }),
      client.onDidChangeConnection((event) => {
        this.output.appendLine(
          `AI Companion connection: ${event.status}${event.detail ? ` (${event.detail})` : ""}`
        );
        this.provider.updateConnection(event);
      })
    );
    client.start();
  }

  dispose(): void {
    this.client?.dispose();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}
