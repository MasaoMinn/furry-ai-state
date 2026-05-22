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
const statePanel = document.querySelector(".state-panel");
const imageFrame = /** @type {HTMLElement | null} */ (
  document.querySelector(".image-frame")
);
const stateImage = /** @type {HTMLImageElement | null} */ (
  document.querySelector("#state-image")
);
const stateLabel = document.querySelector("#state-label");
const stateMessage = document.querySelector("#state-message");
const fileBlock = document.querySelector("#file-block");
const activeFile = document.querySelector("#active-file");
const connectionLabel = document.querySelector("#connection-label");
const reconnectButton = document.querySelector("#reconnect-button");
const statusRow = document.querySelector(".status-row");
const details = document.querySelector(".details");

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
  scheduleImageFrameSize();
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

function scheduleImageFrameSize() {
  window.requestAnimationFrame(syncImageFrameSize);
}

function syncImageFrameSize() {
  if (!root || !statePanel || !imageFrame) {
    return;
  }

  const panelStyle = window.getComputedStyle(statePanel);
  const rowGap = parseFloat(panelStyle.rowGap || panelStyle.gap || "0") || 0;
  const fixedHeight =
    getElementHeight(statusRow) +
    getElementHeight(details) +
    getElementHeight(reconnectButton);
  const availableHeight = Math.max(
    0,
    statePanel.clientHeight - fixedHeight - rowGap * 3
  );

  imageFrame.style.height = `${availableHeight}px`;
  syncImageSize();
}

function syncImageSize() {
  if (!imageFrame || !stateImage) {
    return;
  }

  const naturalWidth = stateImage.naturalWidth;
  const naturalHeight = stateImage.naturalHeight;
  if (!naturalWidth || !naturalHeight) {
    stateImage.style.width = "";
    stateImage.style.height = "";
    return;
  }

  const availableWidth = imageFrame.clientWidth;
  const availableHeight = imageFrame.clientHeight;
  const scale = Math.min(
    availableWidth / naturalWidth,
    availableHeight / naturalHeight,
    1
  );

  stateImage.style.width = `${Math.floor(naturalWidth * scale)}px`;
  stateImage.style.height = `${Math.floor(naturalHeight * scale)}px`;
}

/**
 * @param {Element | null} element
 */
function getElementHeight(element) {
  if (!element) {
    return 0;
  }

  return element.getBoundingClientRect().height;
}

reconnectButton?.addEventListener("click", () => {
  vscode.postMessage({ command: "reconnect" });
});

window.addEventListener("resize", scheduleImageFrameSize);
stateImage?.addEventListener("load", scheduleImageFrameSize);

if (typeof ResizeObserver !== "undefined") {
  const resizeObserver = new ResizeObserver(scheduleImageFrameSize);
  if (root) {
    resizeObserver.observe(root);
  }
  if (statusRow) {
    resizeObserver.observe(statusRow);
  }
  if (details) {
    resizeObserver.observe(details);
  }
  if (reconnectButton) {
    resizeObserver.observe(reconnectButton);
  }
}

scheduleImageFrameSize();
vscode.postMessage({ command: "ready" });
