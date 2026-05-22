import * as vscode from "vscode";
import {
  type AgentState,
  type CompanionStateEvent,
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

const webviewPositions = ["sidebar", "editor"] as const;

type WebviewPosition = (typeof webviewPositions)[number];

export class StateViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "furryAiState.stateView";
  private static readonly editorViewType = "furryAiState.editorView";

  private sidebarView: vscode.WebviewView | null = null;
  private sidebarWebviewDisposable: vscode.Disposable | null = null;
  private editorPanel: vscode.WebviewPanel | null = null;
  private editorPanelDisposables: vscode.Disposable[] = [];
  private stateEvent: CompanionStateEvent = {
    type: "state",
    state: "idle"
  };
  private connectionStatus: CompanionConnectionStatus = "connecting";
  private webviewPosition: WebviewPosition = getConfiguredWebviewPosition();

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.sidebarView = webviewView;

    const visibilityDisposable = webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.routeVisibleSidebarView();
      }
    });

    if (webviewView.visible) {
      void this.routeVisibleSidebarView();
    }

    webviewView.onDidDispose(() => {
      visibilityDisposable.dispose();
      if (this.sidebarView === webviewView) {
        this.sidebarView = null;
        this.disposeSidebarWebview();
      }
    });
  }

  async setWebviewPositionFromCommand(position?: unknown): Promise<void> {
    if (isWebviewPosition(position)) {
      await this.setWebviewPosition(position, true);
      return;
    }

    await this.pickWebviewPosition();
  }

  private async pickWebviewPosition(): Promise<void> {
    const selected = await vscode.window.showQuickPick(
      webviewPositions.map((position) => ({
        label: position,
        description:
          position === this.webviewPosition ? "Current position" : undefined,
        value: position
      })),
      {
        placeHolder: "Choose where to show the Furry AI State webview",
        title: "Furry AI State: Set Webview Position"
      }
    );

    if (!selected) {
      return;
    }

    await this.setWebviewPosition(selected.value, true);
  }

  async refreshConfiguredWebviewPosition(): Promise<void> {
    await this.setWebviewPosition(getConfiguredWebviewPosition(), false);
  }

  updateState(event: CompanionStateEvent): void {
    this.stateEvent = event;
    this.postCurrentState();
  }

  updateConnection(event: CompanionConnectionEvent): void {
    this.connectionStatus = event.status;
    this.postCurrentState();
  }

  private async setWebviewPosition(
    position: WebviewPosition,
    persist: boolean
  ): Promise<void> {
    if (persist) {
      await vscode.workspace
        .getConfiguration("furry-ai-state")
        .update("webviewPosition", position, vscode.ConfigurationTarget.Global);
    }

    this.webviewPosition = position;
    await this.applyWebviewPosition();
  }

  private async applyWebviewPosition(): Promise<void> {
    if (this.webviewPosition === "editor") {
      this.clearSidebarWebview();
      this.revealEditorPanel();
      await this.closeSidebarView();
      return;
    }

    this.disposeEditorPanel();
    this.showSidebarWebview();
    await this.focusSidebarView();
  }

  private async routeVisibleSidebarView(): Promise<void> {
    if (this.webviewPosition === "editor") {
      this.clearSidebarWebview();
      this.revealEditorPanel();
      await this.closeSidebarView();
      return;
    }

    this.disposeEditorPanel();
    this.showSidebarWebview();
  }

  private revealEditorPanel(): void {
    if (this.editorPanel) {
      this.editorPanel.reveal(vscode.ViewColumn.Active);
      this.postCurrentStateTo(this.editorPanel.webview);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      StateViewProvider.editorViewType,
      "Furry AI State",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "media")
        ],
        retainContextWhenHidden: true
      }
    );

    this.editorPanel = panel;
    this.editorPanelDisposables = [
      this.initializeWebview(panel.webview),
      panel.onDidDispose(() => {
        if (this.editorPanel === panel) {
          this.editorPanel = null;
          this.disposeEditorPanelDisposables();
        }
      })
    ];
  }

  private disposeEditorPanel(): void {
    const panel = this.editorPanel;
    this.editorPanel = null;
    this.disposeEditorPanelDisposables();
    panel?.dispose();
  }

  private disposeEditorPanelDisposables(): void {
    for (const disposable of this.editorPanelDisposables.splice(0)) {
      disposable.dispose();
    }
  }

  private ensureSidebarWebview(): void {
    if (!this.sidebarView || this.sidebarWebviewDisposable) {
      return;
    }

    this.sidebarWebviewDisposable = this.initializeWebview(
      this.sidebarView.webview
    );
  }

  private showSidebarWebview(): void {
    this.ensureSidebarWebview();
    this.postCurrentState();
  }

  private disposeSidebarWebview(): void {
    this.sidebarWebviewDisposable?.dispose();
    this.sidebarWebviewDisposable = null;
  }

  private clearSidebarWebview(): void {
    this.disposeSidebarWebview();
    if (this.sidebarView) {
      this.sidebarView.webview.html = "<!doctype html><html><body></body></html>";
    }
  }

  private async focusSidebarView(): Promise<void> {
    try {
      await vscode.commands.executeCommand(
        "workbench.view.extension.furryAiState"
      );
    } catch {
      // The activity bar container command may be unavailable in older hosts.
    }

    try {
      await vscode.commands.executeCommand(`${StateViewProvider.viewType}.focus`);
    } catch {
      // The view focus command may be unavailable before VSCode contributes it.
    }
  }

  private async closeSidebarView(): Promise<void> {
    try {
      await vscode.commands.executeCommand("workbench.action.closeSidebar");
    } catch {
      // VSCode does not expose a direct dispose API for contributed WebviewViews.
    }
  }

  private initializeWebview(webview: vscode.Webview): vscode.Disposable {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media")
      ]
    };

    webview.html = this.getHtml(webview);

    return webview.onDidReceiveMessage((message: { command?: string }) => {
      if (message.command === "ready") {
        if (this.shouldPostToWebview(webview)) {
          this.postCurrentStateTo(webview);
        }
      }
      if (message.command === "reconnect") {
        void vscode.commands.executeCommand("furry-ai-state.reconnect");
      }
    });
  }

  private postCurrentState(): void {
    if (this.webviewPosition === "sidebar" && this.sidebarView) {
      this.postCurrentStateTo(this.sidebarView.webview);
    }

    if (this.webviewPosition === "editor" && this.editorPanel) {
      this.postCurrentStateTo(this.editorPanel.webview);
    }
  }

  private shouldPostToWebview(webview: vscode.Webview): boolean {
    if (this.webviewPosition === "sidebar") {
      return this.sidebarView?.webview === webview;
    }

    return this.editorPanel?.webview === webview;
  }

  private postCurrentStateTo(webview: vscode.Webview): void {
    const { state, message, file } = this.stateEvent;
    const imageUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "images",
        stateImageMap[state]
      )
    );

    void webview.postMessage({
      command: "state-update",
      state,
      stateLabel: stateLabelMap[state],
      message,
      file,
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
            <div id="state-message" class="state-message is-hidden"></div>
          </div>
          <div class="connection">
            <span id="connection-dot" class="dot"></span>
            <span id="connection-label">Connecting</span>
          </div>
        </div>
        <div class="details">
          <div id="file-block" class="detail-block is-hidden">
            <div class="label">Current File</div>
            <div id="active-file" class="detail-text file-text"></div>
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

function getConfiguredWebviewPosition(): WebviewPosition {
  const value = vscode.workspace
    .getConfiguration("furry-ai-state")
    .get<string>("webviewPosition", "sidebar");

  return isWebviewPosition(value) ? value : "sidebar";
}

function isWebviewPosition(value: unknown): value is WebviewPosition {
  return (
    typeof value === "string" &&
    webviewPositions.includes(value as WebviewPosition)
  );
}
