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

const actionUrlMap = {
  docs: "https://kcnhl2uub4k0.feishu.cn/wiki/JJ3KwGjRQiem5TkdTBccLeKrnJe?from=from_copylink",
  github: "https://github.com/MasaoMinn/furry-ai-state"
} as const;

type ActionTarget = keyof typeof actionUrlMap;

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
      await this.showEditorWebview();
      return;
    }

    this.disposeEditorPanel();
    this.showSidebarWebview();
    await this.focusSidebarView();
  }

  private async routeVisibleSidebarView(): Promise<void> {
    if (this.webviewPosition === "editor") {
      await this.showEditorWebview();
      return;
    }

    this.disposeEditorPanel();
    this.showSidebarWebview();
  }

  private async showEditorWebview(): Promise<void> {
    this.clearSidebarWebview();
    this.revealEditorPanel();
    await this.focusEditorArea();
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

  private async focusEditorArea(): Promise<void> {
    try {
      await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
    } catch {
      // Focus is best-effort; VSCode does not expose a safe API to hide only
      // this WebviewView after users move it into another sidebar container.
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
      if (message.command === "toggle-webview-position") {
        void this.toggleWebviewPosition();
      }
      if (message.command === "open-docs") {
        void this.openExternal("docs");
      }
      if (message.command === "open-github") {
        void this.openExternal("github");
      }
    });
  }

  private async openExternal(target: ActionTarget): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(actionUrlMap[target]));
  }

  private async toggleWebviewPosition(): Promise<void> {
    const nextPosition =
      this.webviewPosition === "editor" ? "sidebar" : "editor";

    await this.setWebviewPosition(nextPosition, true);
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
      webviewPosition: this.webviewPosition,
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
          <div class="status-copy">
            <div class="label">Agent State</div>
            <div id="state-label" class="state-label">Idle</div>
            <div id="state-message" class="state-message is-hidden"></div>
          </div>
          <div class="status-tools">
            <div class="action-bar" aria-label="Furry AI State actions">
              <button id="reconnect-button" class="icon-button" type="button" title="Reconnect AI State Runtime" aria-label="Reconnect AI State Runtime">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
                  <path d="M3 21v-5h5" />
                  <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
                  <path d="M16 8h5V3" />
                </svg>
              </button>
              <button id="position-button" class="icon-button" type="button" title="Switch webview position" aria-label="Switch webview position">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M9 4v16" />
                  <path d="m15 9 3 3-3 3" />
                </svg>
              </button>
              <button id="docs-button" class="icon-button" type="button" title="Open furry action guide" aria-label="Open furry action guide">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
                  <path d="M8 6h8" />
                  <path d="M8 10h8" />
                </svg>
              </button>
              <button id="github-button" class="icon-button" type="button" title="Open GitHub repository" aria-label="Open GitHub repository">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.5-.4 7-1.7 7-7.5a5.8 5.8 0 0 0-1.6-4.1A5.4 5.4 0 0 0 19.3 0S18 0 15.4 1.6a13.4 13.4 0 0 0-6.8 0C6 0 4.7 0 4.7 0a5.4 5.4 0 0 0-.1 2.9A5.8 5.8 0 0 0 3 7c0 5.8 3.5 7.1 7 7.5A4.8 4.8 0 0 0 9 18v4" />
                  <path d="M9 18c-4.5 2-5-2-7-2" />
                </svg>
              </button>
            </div>
            <div class="connection">
              <span id="connection-dot" class="dot"></span>
              <span id="connection-label">Connecting</span>
            </div>
          </div>
        </div>
        <div class="details">
          <div id="file-block" class="detail-block is-hidden">
            <div class="label">Current File</div>
            <div id="active-file" class="detail-text file-text"></div>
          </div>
        </div>
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
