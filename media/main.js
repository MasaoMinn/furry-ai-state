// @ts-check

const vscode =
  typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : {
        postMessage(message) {
          console.log(message);
        }
      };

const root = document.querySelector(".app");
const stateImage = /** @type {HTMLImageElement | null} */ (
  document.querySelector("#state-image")
);
const stateLabel = document.querySelector("#state-label");
const connectionLabel = document.querySelector("#connection-label");
const reconnectButton = document.querySelector("#reconnect-button");

window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.command !== "state-update") {
    return;
  }

  if (root) {
    root.setAttribute("data-state", message.state);
    root.setAttribute("data-connection", message.connectionStatus);
  }
  if (stateImage && typeof message.imageUri === "string") {
    stateImage.src = message.imageUri;
    stateImage.alt = `AI companion state: ${message.state}`;
  }
  if (stateLabel) {
    stateLabel.textContent = message.stateLabel || message.state;
  }
  if (connectionLabel) {
    connectionLabel.textContent =
      message.connectionLabel || message.connectionStatus;
  }
});

reconnectButton?.addEventListener("click", () => {
  vscode.postMessage({ command: "reconnect" });
});

vscode.postMessage({ command: "ready" });
