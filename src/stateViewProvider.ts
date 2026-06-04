import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  agentStates,
  type AgentState,
  type CompanionStateEvent,
  type CompanionConnectionEvent,
  type CompanionConnectionStatus
} from "./protocol";

const supportedBundledImageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg"
]);

const defaultStateImageMap: Record<AgentState, readonly [string, string]> = {
  idle: ["idle", "idle-1.gif"],
  thinking: ["thinking", "thinking-1.gif"],
  planning: ["planning", "planning-1.gif"],
  coding: ["coding", "coding-1.gif"],
  testing: ["testing", "testing-1.gif"],
  error: ["error", "error-1.gif"],
  success: ["success", "success-1.gif"]
};

const stateLabelMap: Record<AgentState, string> = {
  idle: "Idle",
  thinking: "Thinking",
  planning: "Planning",
  coding: "Coding",
  testing: "Testing",
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
type CustomImageConfig = Partial<Record<AgentState, string>>;
type BundledImageConfig = Partial<Record<AgentState, string>>;
type CustomImageStatus = "bundled" | "custom" | "missing";

interface BundledImageOption {
  fileName: string;
  label: string;
  imageUri: string;
  selected: boolean;
}

interface StateImageSetting {
  state: AgentState;
  label: string;
  imageUri: string;
  fallbackImageUri: string;
  bundledImageUri: string;
  bundledImageName: string;
  bundledImages: BundledImageOption[];
  customImagePath?: string;
  customImageStatus: CustomImageStatus;
}

const actionUrlMap = {
  docs: "https://kcnhl2uub4k0.feishu.cn/wiki/OuBCwjPX7iBL9PkZOjccKvGQnGf?from=from_copylink",
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
  private imageSettingsPanel: vscode.WebviewPanel | null = null;
  private imageSettingsPanelDisposables: vscode.Disposable[] = [];
  private stateEvent: CompanionStateEvent = {
    type: "state",
    state: "idle"
  };
  private connectionStatus: CompanionConnectionStatus = "connecting";
  private webviewPosition: WebviewPosition = getConfiguredWebviewPosition();
  private customImages: CustomImageConfig = getConfiguredCustomImages();
  private bundledImages: BundledImageConfig = getConfiguredBundledImages();
  private lastAgentStateEvent: CompanionStateEvent | null = null;
  private staleStateReplayToIgnore: CompanionStateEvent | null = null;

  constructor(private readonly context: vscode.ExtensionContext) { }

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

  refreshConfiguredCustomImages(): void {
    this.customImages = getConfiguredCustomImages();
    this.bundledImages = getConfiguredBundledImages();
    this.configureActiveWebviews();
    this.postCurrentState();
    this.postImageSettings();
  }

  async customizeImagesFromCommand(): Promise<void> {
    this.revealImageSettingsPanel();
  }

  updateState(event: CompanionStateEvent): void {
    if (this.shouldIgnoreStaleStateReplay(event)) {
      return;
    }

    this.staleStateReplayToIgnore = null;
    this.lastAgentStateEvent = event;
    this.stateEvent = event;
    this.postCurrentState();
  }

  updateConnection(event: CompanionConnectionEvent): void {
    this.connectionStatus = event.status;
    this.postCurrentState();
  }

  resetStateToIdle(options: { ignoreCurrentStateReplay?: boolean } = {}): void {
    if (options.ignoreCurrentStateReplay && this.lastAgentStateEvent) {
      this.staleStateReplayToIgnore = this.lastAgentStateEvent;
    }

    this.stateEvent = {
      type: "state",
      state: "idle"
    };
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
        localResourceRoots: this.getWebviewResourceRoots(),
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

  private revealImageSettingsPanel(): void {
    if (this.imageSettingsPanel) {
      this.imageSettingsPanel.reveal(vscode.ViewColumn.Active);
      this.postImageSettings();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "furryAiState.imageSettings",
      "Furry AI State Images",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: this.getWebviewResourceRoots(),
        retainContextWhenHidden: true
      }
    );

    this.imageSettingsPanel = panel;
    this.imageSettingsPanelDisposables = [
      this.initializeImageSettingsWebview(panel.webview),
      panel.onDidDispose(() => {
        if (this.imageSettingsPanel === panel) {
          this.imageSettingsPanel = null;
          this.disposeImageSettingsPanelDisposables();
        }
      })
    ];
  }

  private disposeImageSettingsPanelDisposables(): void {
    for (const disposable of this.imageSettingsPanelDisposables.splice(0)) {
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
    this.configureWebview(webview);
    this.resetStateToIdle();

    webview.html = this.getHtml(webview);

    return webview.onDidReceiveMessage((message: { command?: string }) => {
      if (message.command === "ready") {
        if (this.shouldPostToWebview(webview)) {
          this.postCurrentStateTo(webview);
        }
      }
      if (message.command === "reconnect") {
        this.resetStateToIdle({ ignoreCurrentStateReplay: true });
        this.postCurrentStateTo(webview);
        void vscode.commands.executeCommand("furry-ai-state.reconnect", {
          skipIdleReset: true
        });
      }
      if (message.command === "toggle-webview-position") {
        void this.toggleWebviewPosition();
      }
      if (message.command === "open-image-settings") {
        this.revealImageSettingsPanel();
      }
      if (message.command === "open-docs") {
        void this.openExternal("docs");
      }
      if (message.command === "open-github") {
        void this.openExternal("github");
      }
    });
  }

  private initializeImageSettingsWebview(webview: vscode.Webview): vscode.Disposable {
    this.configureWebview(webview);
    webview.html = this.getImageSettingsHtml(webview);

    return webview.onDidReceiveMessage(
      (message: { command?: string; state?: unknown; fileName?: unknown }) => {
        if (message.command === "ready") {
          this.postImageSettings();
        }
        if (message.command === "select-custom-image") {
          void this.pickCustomImageFromSettings(message.state);
        }
        if (message.command === "select-bundled-image") {
          void this.selectBundledImageFromSettings(
            message.state,
            message.fileName
          );
        }
        if (message.command === "reset-custom-image") {
          void this.resetCustomImageFromSettings(message.state);
        }
        if (message.command === "reset-all-custom-images") {
          void this.resetAllCustomImagesFromSettings();
        }
      }
    );
  }

  private async openExternal(target: ActionTarget): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(actionUrlMap[target]));
  }

  private async toggleWebviewPosition(): Promise<void> {
    const nextPosition =
      this.webviewPosition === "editor" ? "sidebar" : "editor";

    await this.setWebviewPosition(nextPosition, true);
  }

  private shouldIgnoreStaleStateReplay(event: CompanionStateEvent): boolean {
    const staleStateReplay = this.staleStateReplayToIgnore;
    if (!staleStateReplay) {
      return false;
    }

    if (!isSameStateEvent(event, staleStateReplay)) {
      return false;
    }

    this.staleStateReplayToIgnore = null;
    return true;
  }

  private async pickCustomImageFromSettings(state: unknown): Promise<void> {
    if (!isAgentStateValue(state)) {
      return;
    }

    const [imageUri] =
      (await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          Images: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]
        },
        openLabel: `Use for ${stateLabelMap[state]}`,
        title: `Select ${stateLabelMap[state]} Image`
      })) ?? [];

    if (!imageUri) {
      return;
    }

    await this.updateImages(
      {
        ...this.customImages,
        [state]: imageUri.fsPath
      },
      this.bundledImages
    );
  }

  private async resetCustomImageFromSettings(state: unknown): Promise<void> {
    if (!isAgentStateValue(state)) {
      return;
    }

    const confirmed = await confirmReset(
      `Reset the ${stateLabelMap[state]} image to the bundled image?`
    );
    if (!confirmed) {
      return;
    }

    const { [state]: _removedCustomImagePath, ...nextCustomImages } =
      this.customImages;
    const { [state]: _removedBundledImagePath, ...nextBundledImages } =
      this.bundledImages;

    await this.updateImages(nextCustomImages, nextBundledImages);
  }

  private async resetAllCustomImagesFromSettings(): Promise<void> {
    const confirmed = await confirmReset(
      "Reset all custom state images to bundled images?"
    );
    if (!confirmed) {
      return;
    }

    await this.updateImages({}, {});
  }

  private async selectBundledImageFromSettings(
    state: unknown,
    fileName: unknown
  ): Promise<void> {
    if (!isAgentStateValue(state) || typeof fileName !== "string") {
      return;
    }

    const nextFileName = path.basename(fileName.trim());
    if (!this.isBundledImageAvailable(state, nextFileName)) {
      return;
    }

    const { [state]: _removedCustomImagePath, ...nextCustomImages } =
      this.customImages;

    await this.updateImages(
      nextCustomImages,
      {
        ...this.bundledImages,
        [state]: nextFileName
      }
    );
  }

  private async updateImages(
    customImages: CustomImageConfig,
    bundledImages: BundledImageConfig
  ): Promise<void> {
    const configuration = vscode.workspace.getConfiguration("furry-ai-state");

    await configuration.update(
      "customImages",
      customImages,
      vscode.ConfigurationTarget.Global
    );
    await configuration.update(
      "bundledImages",
      bundledImages,
      vscode.ConfigurationTarget.Global
    );

    this.customImages = customImages;
    this.bundledImages = bundledImages;
    this.configureActiveWebviews();
    this.postCurrentState();
    this.postImageSettings();
  }

  private configureActiveWebviews(): void {
    if (this.sidebarView && this.sidebarWebviewDisposable) {
      this.configureWebview(this.sidebarView.webview);
    }

    if (this.editorPanel) {
      this.configureWebview(this.editorPanel.webview);
    }

    if (this.imageSettingsPanel) {
      this.configureWebview(this.imageSettingsPanel.webview);
    }
  }

  private configureWebview(webview: vscode.Webview): void {
    webview.options = {
      enableScripts: true,
      localResourceRoots: this.getWebviewResourceRoots()
    };
  }

  private getWebviewResourceRoots(): vscode.Uri[] {
    const roots = [
      vscode.Uri.joinPath(this.context.extensionUri, "media")
    ];
    const customRootPaths = new Set<string>();

    for (const imagePath of Object.values(this.customImages)) {
      if (imagePath && isReadableFile(imagePath)) {
        customRootPaths.add(path.dirname(imagePath));
      }
    }

    for (const rootPath of customRootPaths) {
      roots.push(vscode.Uri.file(rootPath));
    }

    return roots;
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
    this.configureWebview(webview);
    const { imageUri, fallbackImageUri } = this.getStateImageUris(
      state,
      webview
    );

    void webview.postMessage({
      command: "state-update",
      state,
      stateLabel: stateLabelMap[state],
      message,
      file,
      imageUri,
      fallbackImageUri,
      webviewPosition: this.webviewPosition,
      connectionStatus: this.connectionStatus,
      connectionLabel: connectionLabelMap[this.connectionStatus]
    });
  }

  private getStateImageUris(
    state: AgentState,
    webview: vscode.Webview
  ): { imageUri: string; fallbackImageUri: string } {
    const fallbackImageUri = this.getBundledStateImageUri(state, webview);
    const customImagePath = this.customImages[state];

    if (!customImagePath || !isReadableFile(customImagePath)) {
      return {
        imageUri: fallbackImageUri,
        fallbackImageUri
      };
    }

    return {
      imageUri: webview.asWebviewUri(vscode.Uri.file(customImagePath)).toString(),
      fallbackImageUri
    };
  }

  private getBundledStateImageUri(
    state: AgentState,
    webview: vscode.Webview
  ): string {
    const { directory, fileName } = this.getBundledStateImage(state);

    return webview
      .asWebviewUri(
        vscode.Uri.joinPath(
          this.context.extensionUri,
          "media",
          "images",
          directory,
          fileName
        )
      )
      .toString();
  }

  private getBundledStateImage(
    state: AgentState,
    requestedFileName = this.bundledImages[state]
  ): { directory: string; fileName: string } {
    const [directory, defaultFileName] = defaultStateImageMap[state];
    const fileName =
      requestedFileName &&
      this.isBundledImageAvailable(state, requestedFileName)
        ? requestedFileName
        : defaultFileName;

    return {
      directory,
      fileName
    };
  }

  private isBundledImageAvailable(state: AgentState, fileName: string): boolean {
    const [directory] = defaultStateImageMap[state];
    const imagePath = path.join(
      this.context.extensionUri.fsPath,
      "media",
      "images",
      directory,
      path.basename(fileName)
    );

    return isReadableFile(imagePath) && isSupportedImageFile(imagePath);
  }

  private getBundledImageOptions(
    state: AgentState,
    webview: vscode.Webview
  ): BundledImageOption[] {
    const [directory, defaultFileName] = defaultStateImageMap[state];
    const directoryPath = path.join(
      this.context.extensionUri.fsPath,
      "media",
      "images",
      directory
    );
    const selectedFileName = this.getBundledStateImage(state).fileName;
    const fileNames = new Set<string>([defaultFileName]);

    try {
      for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
        if (
          entry.isFile() &&
          isSupportedImageFile(entry.name)
        ) {
          fileNames.add(entry.name);
        }
      }
    } catch {
      // If bundled files are missing, the default option remains as fallback.
    }

    return [...fileNames]
      .sort((left, right) => compareBundledImageNames(left, right, defaultFileName))
      .map((fileName) => ({
        fileName,
        label: fileName,
        imageUri: webview
          .asWebviewUri(
            vscode.Uri.joinPath(
              this.context.extensionUri,
              "media",
              "images",
              directory,
              fileName
            )
          )
          .toString(),
        selected: fileName === selectedFileName
      }));
  }

  private postImageSettings(): void {
    if (!this.imageSettingsPanel) {
      return;
    }

    const webview = this.imageSettingsPanel.webview;
    this.configureWebview(webview);

    void webview.postMessage({
      command: "settings-update",
      images: this.getImageSettings(webview)
    });
  }

  private getImageSettings(webview: vscode.Webview): StateImageSetting[] {
    return agentStates.map((state) => {
      const { imageUri, fallbackImageUri } = this.getStateImageUris(
        state,
        webview
      );
      const customImagePath = this.customImages[state];
      const hasReadableCustomImage =
        !!customImagePath && isReadableFile(customImagePath);
      const customImageStatus: CustomImageStatus = customImagePath
        ? hasReadableCustomImage
          ? "custom"
          : "missing"
        : "bundled";
      const bundledImage = this.getBundledStateImage(state);

      return {
        state,
        label: stateLabelMap[state],
        imageUri,
        fallbackImageUri,
        bundledImageUri: this.getBundledStateImageUri(state, webview),
        bundledImageName: bundledImage.fileName,
        bundledImages: this.getBundledImageOptions(state, webview),
        ...(customImagePath ? { customImagePath } : {}),
        customImageStatus
      };
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
              <button id="settings-button" class="icon-button" type="button" title="Customize state images" aria-label="Customize state images">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z" />
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

  private getImageSettingsHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "settings.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "settings.js")
    );
    const cspSource = webview.cspSource;

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src ${cspSource}; script-src ${cspSource};" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Furry AI State Images</title>
  </head>
  <body>
    <main class="settings-app">
      <header class="settings-header">
        <div>
          <h1>State Images</h1>
          <p>Preview and replace the illustration used by each agent state.</p>
        </div>
        <button id="reset-all-button" class="secondary-button" type="button">Reset all</button>
      </header>
      <section id="image-settings-list" class="image-settings-list" aria-live="polite"></section>
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

function isAgentStateValue(value: unknown): value is AgentState {
  return (
    typeof value === "string" &&
    agentStates.includes(value as AgentState)
  );
}

function getConfiguredCustomImages(): CustomImageConfig {
  const value = vscode.workspace
    .getConfiguration("furry-ai-state")
    .get<Record<string, unknown>>("customImages", {});
  const customImages: CustomImageConfig = {};

  for (const state of agentStates) {
    const imagePath = value[state];
    if (typeof imagePath === "string" && imagePath.trim()) {
      customImages[state] = imagePath.trim();
    }
  }

  return customImages;
}

function getConfiguredBundledImages(): BundledImageConfig {
  const value = vscode.workspace
    .getConfiguration("furry-ai-state")
    .get<Record<string, unknown>>("bundledImages", {});
  const bundledImages: BundledImageConfig = {};

  for (const state of agentStates) {
    const imageFileName = value[state];
    if (typeof imageFileName === "string" && imageFileName.trim()) {
      bundledImages[state] = path.basename(imageFileName.trim());
    }
  }

  return bundledImages;
}

function isReadableFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isSupportedImageFile(filePath: string): boolean {
  return supportedBundledImageExtensions.has(path.extname(filePath).toLowerCase());
}

function compareBundledImageNames(
  left: string,
  right: string,
  defaultFileName: string
): number {
  if (left === defaultFileName) {
    return -1;
  }
  if (right === defaultFileName) {
    return 1;
  }

  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function isSameStateEvent(
  left: CompanionStateEvent,
  right: CompanionStateEvent
): boolean {
  return (
    left.state === right.state &&
    left.message === right.message &&
    left.file === right.file
  );
}

async function confirmReset(message: string): Promise<boolean> {
  const confirmed = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    "Reset"
  );

  return confirmed === "Reset";
}
