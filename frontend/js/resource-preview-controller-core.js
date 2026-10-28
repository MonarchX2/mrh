(function (globalScope) {
  "use strict";

  function create({
    document = globalScope.document,
    viewer,
    getFolderPanel,
    getReviewerContext,
    cancelPendingPreview,
    resetPreviewState,
    releaseObjectUrls,
  } = {}) {
    const requiredCallbacks = {
      getFolderPanel,
      getReviewerContext,
      cancelPendingPreview,
      resetPreviewState,
      releaseObjectUrls,
    };
    for (const [name, callback] of Object.entries(requiredCallbacks)) {
      if (typeof callback !== "function") {
        throw new TypeError(`${name} is required for the preview controller.`);
      }
    }
    if (!document || !viewer)
      throw new TypeError("A document and PDF viewer are required for previews.");

    let generation = 0;
    let request = null;

    function begin(requestDetails) {
      request = requestDetails;
      return request;
    }

    function getRequest() {
      return request;
    }

    function getGeneration() {
      return generation;
    }

    function nextGeneration() {
      generation += 1;
      return generation;
    }

    function close(reason = "user-request") {
      const reviewerContext = getReviewerContext();
      if (reviewerContext.isReviewer)
        (globalScope.DebugUtils || console).info(
          "Reviewer PDF preview closed.",
          {
            reason,
            accountStatus: reviewerContext.accountStatus,
            activeTab: reviewerContext.activeTab,
          },
        );
      viewer.clearRenderCheck();
      cancelPendingPreview();
      nextGeneration();
      const preview = document.getElementById("resource-portal-preview");
      const frame = document.getElementById("resource-portal-preview-frame");
      const status = document.getElementById("resource-portal-preview-status");
      const title = document.getElementById("resource-portal-preview-title");
      const fileIcon = document.getElementById(
        "resource-portal-preview-file-icon",
      );
      const backButton = document.getElementById(
        "resource-portal-preview-back",
      );
      const downloadButton = document.getElementById(
        "resource-portal-preview-download",
      );
      const folderPanel = getFolderPanel(frame);
      if (frame) frame.removeAttribute("src");
      if (folderPanel) {
        folderPanel.hidden = true;
        folderPanel.replaceChildren();
      }
      resetPreviewState();
      request = null;
      if (backButton) backButton.hidden = true;
      if (fileIcon) fileIcon.hidden = true;
      releaseObjectUrls();
      if (title) title.textContent = "File preview";
      if (downloadButton) {
        downloadButton.hidden = true;
        downloadButton.removeAttribute("href");
        downloadButton.removeAttribute("download");
      }
      if (status) {
        status.classList.remove("is-loading");
        status.textContent = "";
        status.hidden = true;
      }
      if (preview) {
        preview.classList.remove(
          "is-fullscreen",
          "is-blob-viewer",
          "is-pdf-fallback",
          "is-reviewer-pdf",
          "is-module-preview",
        );
        preview.setAttribute("role", "region");
        preview.removeAttribute("aria-modal");
        preview.hidden = true;
      }
      return true;
    }

    return Object.freeze({
      begin,
      close,
      getGeneration,
      getRequest,
      nextGeneration,
    });
  }

  globalScope.ResourcePreviewControllerCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
