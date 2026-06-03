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
 *   bundledImageName: string;
 *   bundledImages: Array<{
 *     fileName: string;
 *     label: string;
 *     imageUri: string;
 *     selected: boolean;
 *   }>;
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
 *   bundledImageName: string;
 *   bundledImages: Array<{
 *     fileName: string;
 *     label: string;
 *     imageUri: string;
 *     selected: boolean;
 *   }>;
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
  pathText.textContent =
    item.customImagePath || `Using provided image: ${item.bundledImageName}`;
  pathText.title = pathText.textContent;

  const providedImages = document.createElement("div");
  providedImages.className = "provided-images";
  providedImages.setAttribute("aria-label", `${item.label} provided images`);

  for (const option of item.bundledImages) {
    const optionButton = document.createElement("button");
    const isActiveProvidedImage = option.selected && !item.customImagePath;
    optionButton.className = isActiveProvidedImage
      ? "provided-image-option is-selected"
      : "provided-image-option";
    optionButton.type = "button";
    optionButton.title = option.label;
    optionButton.ariaLabel = `Use ${option.label} for ${item.label}`;
    optionButton.disabled = isActiveProvidedImage;

    const optionPreview = document.createElement("span");
    optionPreview.className = "provided-image-option-preview";

    const optionImage = document.createElement("img");
    optionImage.alt = "";
    optionImage.src = option.imageUri;
    optionPreview.append(optionImage);

    const optionLabel = document.createElement("span");
    optionLabel.className = "provided-image-option-label";
    optionLabel.textContent = option.label;

    optionButton.append(optionPreview, optionLabel);
    optionButton.addEventListener("click", () => {
      image.src = option.imageUri;
      vscode.postMessage({
        command: "select-bundled-image",
        state: item.state,
        fileName: option.fileName,
      });
    });

    providedImages.append(optionButton);
  }

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
  body.append(header, pathText, providedImages, actions);
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
