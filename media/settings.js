// @ts-check

const vscode =
  typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : {
        postMessage(message) {
          console.log(message);
        },
      };

const imageSettingsList = document.querySelector("#image-settings-list");
const resetAllButton = document.querySelector("#reset-all-button");

window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.command !== "settings-update") {
    return;
  }

  renderSettings(Array.isArray(message.images) ? message.images : []);
});

/**
 * @param {Array<{
 *   state: string;
 *   label: string;
 *   imageUri: string;
 *   fallbackImageUri: string;
 *   bundledImageUri: string;
 *   customImagePath?: string;
 *   customImageStatus: "bundled" | "custom" | "missing";
 * }>} images
 */
function renderSettings(images) {
  if (!imageSettingsList) {
    return;
  }

  imageSettingsList.replaceChildren(...images.map(createImageSettingItem));
}

/**
 * @param {{
 *   state: string;
 *   label: string;
 *   imageUri: string;
 *   fallbackImageUri: string;
 *   bundledImageUri: string;
 *   customImagePath?: string;
 *   customImageStatus: "bundled" | "custom" | "missing";
 * }} item
 */
function createImageSettingItem(item) {
  const article = document.createElement("article");
  article.className = "image-setting-card";
  article.dataset.state = item.state;

  const preview = document.createElement("div");
  preview.className = "image-preview";

  const image = document.createElement("img");
  image.alt = `${item.label} state preview`;
  image.src = item.imageUri;
  image.addEventListener("error", () => {
    if (image.src !== item.fallbackImageUri) {
      image.src = item.fallbackImageUri;
    }
  });
  preview.append(image);

  const body = document.createElement("div");
  body.className = "image-setting-body";

  const header = document.createElement("div");
  header.className = "image-setting-header";

  const title = document.createElement("h2");
  title.textContent = item.label;

  const badge = document.createElement("span");
  badge.className = `status-badge is-${item.customImageStatus}`;
  badge.textContent = getStatusLabel(item.customImageStatus);

  header.append(title, badge);

  const pathText = document.createElement("div");
  pathText.className = "image-path";
  pathText.textContent = item.customImagePath || "Using bundled image";
  pathText.title = pathText.textContent;

  const actions = document.createElement("div");
  actions.className = "image-setting-actions";

  const chooseButton = document.createElement("button");
  chooseButton.className = "primary-button";
  chooseButton.type = "button";
  chooseButton.textContent = "Choose image";
  chooseButton.addEventListener("click", () => {
    vscode.postMessage({
      command: "select-custom-image",
      state: item.state,
    });
  });

  const resetButton = document.createElement("button");
  resetButton.className = "secondary-button";
  resetButton.type = "button";
  resetButton.textContent = "Reset";
  resetButton.disabled = !item.customImagePath;
  resetButton.addEventListener("click", () => {
    vscode.postMessage({
      command: "reset-custom-image",
      state: item.state,
    });
  });

  actions.append(chooseButton, resetButton);
  body.append(header, pathText, actions);
  article.append(preview, body);

  return article;
}

/**
 * @param {"bundled" | "custom" | "missing"} status
 */
function getStatusLabel(status) {
  if (status === "custom") {
    return "Custom";
  }
  if (status === "missing") {
    return "Fallback";
  }
  return "Bundled";
}

resetAllButton?.addEventListener("click", () => {
  vscode.postMessage({ command: "reset-all-custom-images" });
});

vscode.postMessage({ command: "ready" });
