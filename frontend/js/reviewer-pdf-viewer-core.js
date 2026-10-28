(function (globalScope) {
  "use strict";

  function create(dependencies) {
    const {
      download,
      getGeneration,
      getState,
      getTimingNow,
      getWorker,
      setBlobViewerError,
      setBlobViewerStatus,
    } = dependencies;
    let renderCheckTimer = 0;
    let renderCheckCleanup = null;
    let viewerWatchdogTimer = 0;
    let viewerWarmupPromise = null;
    const viewerPrefetches = new Set();

    function clearWatchdog() {
      if (!viewerWatchdogTimer) return;
      globalScope.clearTimeout(viewerWatchdogTimer);
      viewerWatchdogTimer = 0;
    }

    function startWatchdog(callback, delayMs) {
      clearWatchdog();
      viewerWatchdogTimer = globalScope.setTimeout(() => {
        viewerWatchdogTimer = 0;
        callback();
      }, delayMs);
    }

    function releaseObjectUrls(getUrls, clearUrls, setUrlOpened) {
      const { objectUrl, blobViewerUrl } = getUrls();
      clearUrls();
      if (blobViewerUrl) globalScope.URL.revokeObjectURL(blobViewerUrl);
      if (objectUrl) {
        globalScope.setTimeout(
          () => globalScope.URL.revokeObjectURL(objectUrl),
          1500,
        );
      }
      setUrlOpened(false);
    }

    function failReviewerPdfCanvasViewer(message) {
      const activePdf = getState().activePdf;
      clearWatchdog();
      const failureMessage =
        String(message || "").trim() ||
        "The secure canvas preview could not be displayed. Use Download to open the protected PDF.";
      clearReviewerPdfPreviewStatus();
      showReviewerPdfBlobViewerError(failureMessage, true);
      (globalScope.DebugUtils || console).warn(
        "Reviewer PDF canvas rendering failed; native PDF fallback is disabled.",
        {
          correlationId: activePdf?.timings?.correlationId || "",
          message: failureMessage,
        },
      );
      return false;
    }

    function isMobileReviewerPdfDevice() {
      const navigator = globalScope.navigator || {};
      if (navigator.userAgentData?.mobile === true) return true;
      if (
        /Android|iPhone|iPod|iPad|Mobile|Windows Phone/i.test(
          String(navigator.userAgent || ""),
        )
      )
        return true;
      return (
        typeof globalScope.matchMedia === "function" &&
        (globalScope.matchMedia("(pointer: coarse)").matches ||
          globalScope.matchMedia("(max-width: 640px)").matches)
      );
    }

    function prefetchReviewerPdfViewerAssets() {
      const connection = globalScope.navigator?.connection;
      if (
        connection?.saveData === true ||
        /(?:^|-)2g$/i.test(String(connection?.effectiveType || ""))
      )
        return false;

      const basePath =
        typeof globalScope.__MRH_APP_BASE_PATH === "string"
          ? globalScope.__MRH_APP_BASE_PATH
          : "/";
      const baseUrl = new URL(basePath, globalScope.location.origin);
      const assets = [
        new URL("vendor/pdfjs/pdfjs-5.4.394.min.mjs", baseUrl).href,
        new URL("vendor/pdfjs/pdfjs-5.4.394.worker.min.mjs", baseUrl).href,
      ];
      assets.forEach((assetUrl) => {
        if (viewerPrefetches.has(assetUrl)) return;
        const link = globalScope.document.createElement("link");
        link.rel = "prefetch";
        link.as = "script";
        link.href = assetUrl;
        link.crossOrigin = "same-origin";
        globalScope.document.head.appendChild(link);
        viewerPrefetches.add(assetUrl);
      });
      return true;
    }

    function warmReviewerPdfViewer() {
      if (viewerWarmupPromise) return viewerWarmupPromise;
      prefetchReviewerPdfViewerAssets();
      viewerWarmupPromise = Promise.resolve()
        .then(() => getWorker())
        .then(() => true)
        .catch((error) => {
          viewerWarmupPromise = null;
          throw error;
        });
      return viewerWarmupPromise;
    }

    function sendReviewerPdfBytesToBlobViewer() {
      const state = getState();
      const frame = globalScope.document.getElementById(
        "resource-portal-preview-frame",
      );
      if (
        !state.ready ||
        !(state.pdfBytes instanceof Uint8Array) ||
        !frame?.contentWindow ||
        !state.activePdf
      )
        return false;
      const bytes = state.pdfBytes.slice();
      startWatchdog(
        () => {
          if (!getState().ready) return;
          failReviewerPdfCanvasViewer(
            "The secure canvas preview did not finish rendering. Use Download to open the protected PDF.",
          );
        },
        20000,
      );
      try {
        frame.contentWindow.postMessage(
          {
            type: "MRH_PDF_VIEWER_DATA",
            bytes: bytes.buffer,
            viewerWatermark: {
              brand: "MRH",
              fullName: state.activePdf.fullName,
              email: state.activePdf.email,
            },
            darkMode: Boolean(
              globalScope.document.documentElement?.classList.contains("dark"),
            ),
          },
          globalScope.location.origin,
          [bytes.buffer],
        );
      } catch (error) {
        clearWatchdog();
        (globalScope.DebugUtils || console).error(
          "Unable to send protected PDF bytes to the preview viewer.",
          error,
        );
        return false;
      }
      return true;
    }

    function showReviewerPdfBlobViewerError(message, retryable = false) {
      const errorMessage = String(message || "");
      setBlobViewerError(errorMessage);
      const frame = globalScope.document.getElementById(
        "resource-portal-preview-frame",
      );
      frame?.contentWindow?.postMessage(
        {
          type: "MRH_PDF_VIEWER_ERROR",
          message: errorMessage,
          retryable,
        },
        globalScope.location.origin,
      );
    }

    function setReviewerPdfPreviewStatus(message) {
      const label = String(message || "").trim();
      const state = getState();
      setBlobViewerStatus(label);
      const status = globalScope.document.getElementById(
        "resource-portal-preview-status",
      );
      if (status && state.isReviewer) {
        const spinner = globalScope.document.createElement("i");
        spinner.className = "fa-solid fa-spinner fa-spin";
        spinner.setAttribute("aria-hidden", "true");
        const text = globalScope.document.createElement("span");
        text.textContent = label;
        status.replaceChildren(spinner, text);
        status.classList.add("is-loading");
        status.hidden = false;
      }
      if (!state.ready) return;
      const frame = globalScope.document.getElementById(
        "resource-portal-preview-frame",
      );
      frame?.contentWindow?.postMessage(
        { type: "MRH_PDF_VIEWER_STATUS", message: label },
        globalScope.location.origin,
      );
    }

    function clearReviewerPdfPreviewStatus() {
      setBlobViewerStatus("");
      const status = globalScope.document.getElementById(
        "resource-portal-preview-status",
      );
      if (!status) return;
      status.classList.remove("is-loading");
      status.replaceChildren();
      status.hidden = true;
    }

    function renderReviewerPdfDownloadFallback(
      status,
      activePdf,
      messageText = "Preview is taking longer than expected.",
    ) {
      if (!status || !activePdf) return false;
      if (
        !/^[^<>:"/\\|?*\u0000-\u001f]{1,255}\.pdf$/i.test(
          String(activePdf.downloadFileName || ""),
        )
      ) {
        status.textContent = "The PDF download is unavailable.";
        status.hidden = false;
        return false;
      }
      const message = globalScope.document.createElement("span");
      message.textContent = messageText;
      const passwordReminder = globalScope.document.createElement("small");
      passwordReminder.className = "resource-portal-preview-password-reminder";
      passwordReminder.append(
        globalScope.document.createTextNode("PDF password: use the "),
      );
      const passwordCode = globalScope.document.createElement("strong");
      passwordCode.textContent = "four-digit code";
      passwordReminder.append(
        passwordCode,
        globalScope.document.createTextNode(
          " in the downloaded filename.",
        ),
      );
      const downloadButton = globalScope.document.createElement("button");
      downloadButton.type = "button";
      downloadButton.className = "resource-portal-preview-download-link";
      downloadButton.textContent = "Download PDF";
      downloadButton.addEventListener("click", download);
      status.replaceChildren(message, passwordReminder, downloadButton);
      status.hidden = false;
      return true;
    }

    function clearRenderCheck() {
      renderCheckCleanup?.();
    }

    function watchReviewerPdfPreviewRender(frame, status, activePdf, generation) {
      if (!frame || !status || !activePdf) return false;
      clearRenderCheck();
      let completed = false;
      const clearCheck = () => {
        frame.removeEventListener("load", onLoad);
        frame.removeEventListener("error", onError);
        if (renderCheckTimer) {
          globalScope.clearTimeout(renderCheckTimer);
          renderCheckTimer = 0;
        }
        if (renderCheckCleanup === clearCheck) renderCheckCleanup = null;
      };
      renderCheckCleanup = clearCheck;
      const onLoad = () => {
        completed = true;
        clearCheck();
        if (generation !== getGeneration()) return;
        if (activePdf.timings?.previewStartedAt)
          (globalScope.DebugUtils || console).info(
            "Reviewer PDF preview frame-load timing.",
            {
              ...activePdf.timings,
              timeToFrameLoadMs: activePdf.timings.previewRequestedAt
                ? getTimingNow() - activePdf.timings.previewRequestedAt
                : null,
              previewFrameLoadMs:
                getTimingNow() - activePdf.timings.previewStartedAt,
            },
          );
        status.replaceChildren();
        status.hidden = true;
      };
      const onError = () => {
        completed = true;
        clearCheck();
        if (generation !== getGeneration()) return;
        renderReviewerPdfDownloadFallback(status, activePdf);
      };
      frame.addEventListener("load", onLoad, { once: true });
      frame.addEventListener("error", onError, { once: true });
      renderCheckTimer = globalScope.setTimeout(() => {
        renderCheckTimer = 0;
        if (completed || generation !== getGeneration()) return;
        clearCheck();
        renderReviewerPdfDownloadFallback(status, activePdf);
      }, 8000);
      return true;
    }

    return Object.freeze({
      clearPreviewStatus: clearReviewerPdfPreviewStatus,
      clearRenderCheck,
      clearWatchdog,
      failCanvasViewer: failReviewerPdfCanvasViewer,
      isMobileDevice: isMobileReviewerPdfDevice,
      prefetchAssets: prefetchReviewerPdfViewerAssets,
      renderDownloadFallback: renderReviewerPdfDownloadFallback,
      releaseObjectUrls,
      sendBytesToBlobViewer: sendReviewerPdfBytesToBlobViewer,
      setPreviewStatus: setReviewerPdfPreviewStatus,
      showBlobViewerError: showReviewerPdfBlobViewerError,
      startWatchdog,
      warmViewer: warmReviewerPdfViewer,
      watchRender: watchReviewerPdfPreviewRender,
    });
  }

  globalScope.ReviewerPdfViewerCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
