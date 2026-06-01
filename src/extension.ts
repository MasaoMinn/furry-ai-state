import * as vscode from "vscode";
import { CompanionController } from "./companionController";
import { StateViewProvider } from "./stateViewProvider";

let controller: CompanionController | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Furry AI State");
  const provider = new StateViewProvider(context);

  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider(
      StateViewProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  controller = new CompanionController(provider, output);
  controller.start();

  context.subscriptions.push(
    controller,
    vscode.commands.registerCommand("furry-ai-state.reconnect", (options?: { skipIdleReset?: boolean }) => {
      if (!options?.skipIdleReset) {
        provider.resetStateToIdle({ ignoreCurrentStateReplay: true });
      }
      controller?.restart();
    }),
    vscode.commands.registerCommand(
      "furry-ai-state.setWebviewPosition",
      (position?: unknown) => {
        void provider.setWebviewPositionFromCommand(position);
      }
    ),
    vscode.commands.registerCommand("furry-ai-state.customizeImages", () => {
      void provider.customizeImagesFromCommand();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("furry-ai-state.webviewPosition")) {
        void provider.refreshConfiguredWebviewPosition();
      }
      if (event.affectsConfiguration("furry-ai-state.customImages")) {
        provider.refreshConfiguredCustomImages();
      }
    })
  );

  output.appendLine("Furry AI State activated.");
}

export function deactivate(): void {
  controller?.dispose();
  controller = null;
}
