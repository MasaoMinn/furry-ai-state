// @ts-check

const vscode =
  typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : {
        postMessage(message) {
          console.log(message);
        },
      };

const root = document.querySelector(".app");
const stateImage = /** @type {HTMLImageElement | null} */ (
  document.querySelector("#state-image")
);
const stateLabel = document.querySelector("#state-label");
const stateMessage = document.querySelector("#state-message");
const fileBlock = document.querySelector("#file-block");
const activeFile = document.querySelector("#active-file");
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
  setInlineMessage(stateMessage, message.message);
  setDetail(fileBlock, activeFile, message.file);
  if (connectionLabel) {
    connectionLabel.textContent =
      message.connectionLabel || message.connectionStatus;
  }
});

/**
 * @param {Element | null} textNode
 * @param {unknown} value
 */
function setInlineMessage(textNode, value) {
  if (!textNode) {
    return;
  }

  const text = typeof value === "string" ? value.trim() : "";
  textNode.classList.toggle("is-hidden", !text);
  textNode.textContent = text;
}

/**
 * @param {Element | null} block
 * @param {Element | null} textNode
 * @param {unknown} value
 */
function setDetail(block, textNode, value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!block || !textNode) {
    return;
  }

  block.classList.toggle("is-hidden", !text);
  textNode.textContent = text;
}

reconnectButton?.addEventListener("click", () => {
  vscode.postMessage({ command: "reconnect" });
});

vscode.postMessage({ command: "ready" });
