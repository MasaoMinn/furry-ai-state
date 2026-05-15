import * as vscode from "vscode";
import {
  type AgentState,
  type CompanionConnectionEvent,
  type CompanionConnectionStatus
} from "./protocol";

const stateImageMap: Record<AgentState, string> = {
  idle: "thinking.png",
  thinking: "thinking.png",
  planning: "thinking.png",
  coding: "building.png",
  testing: "building.png",
  debugging: "building.png",
  error: "building.png",
  success: "completed.png"
};

const stateLabelMap: Record<AgentState, string> = {
  idle: "Idle",
  thinking: "Thinking",
  planning: "Planning",
  coding: "Coding",
  testing: "Testing",
  debugging: "Debugging",
  success: "Success",
  error: "Error"
};

const connectionLabelMap: Record<CompanionConnectionStatus, string> = {
  disabled: "Disabled",
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected"
};

export class StateViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "furryAiState.stateView";

  private webviewView: vscode.WebviewView | null = null;
  private state: AgentState = "idle";
  private connectionStatus: CompanionConnectionStatus = "connecting";

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media")
      ]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: { command?: string }) => {
      if (message.command === "ready") {
        this.postCurrentState();
      }
      if (message.command === "reconnect") {
        void vscode.commands.executeCommand("furry-ai-state.reconnect");
      }
    });

    webviewView.onDidDispose(() => {
      if (this.webviewView === webviewView) {
        this.webviewView = null;
      }
    });
  }

  updateState(state: AgentState): void {
    this.state = state;
    this.postCurrentState();
  }

  updateConnection(event: CompanionConnectionEvent): void {
    this.connectionStatus = event.status;
    this.postCurrentState();
  }

  private postCurrentState(): void {
    const webview = this.webviewView?.webview;
    if (!webview) {
      return;
    }

    const imageUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        stateImageMap[this.state]
      )
    );

    void webview.postMessage({
      command: "state-update",
      state: this.state,
      stateLabel: stateLabelMap[this.state],
      imageUri: imageUri.toString(),
      connectionStatus: this.connectionStatus,
      connectionLabel: connectionLabelMap[this.connectionStatus]
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "styles.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js")
    );
    const cspSource = webview.cspSource;

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src ${cspSource}; script-src ${cspSource};" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Furry AI State</title>
  </head>
  <body>
    <main class="app" data-state="idle" data-connection="connecting">
      <section class="state-panel">
        <div class="image-frame">
          <img id="state-image" alt="AI state" />
        </div>
        <div class="status-row">
          <div>
            <div class="label">Agent State</div>
            <div id="state-label" class="state-label">Idle</div>
          </div>
          <div class="connection">
            <span id="connection-dot" class="dot"></span>
            <span id="connection-label">Connecting</span>
          </div>
        </div>
        <button id="reconnect-button" type="button">Reconnect</button>
      </section>
    </main>
    <script src="${scriptUri}"></script>
  </body>
</html>`;
  }
}
