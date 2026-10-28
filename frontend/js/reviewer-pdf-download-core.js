(function (globalScope) {
  "use strict";

  function create(dependencies) {
    const {
      cleanResourceDisplayName,
      encryptPdf,
      getActivePdf,
      getReviewerDisplayName,
      getSessionId,
      getWorker,
      hasEncryptionDictionary,
      hasPreviewObjectUrl,
      logResourceDashboardAction,
      markPreviewUrlOpened,
      setPreviewStatus,
      clearPreviewStatus,
      showToast,
    } = dependencies;
    let downloadInFlight = false;

    function getTimingNow() {
      return typeof globalScope.performance?.now === "function"
        ? globalScope.performance.now()
        : Date.now();
    }

    function logPreviewTimings(timings) {
      (globalScope.DebugUtils || console).info("Reviewer PDF preview timings.", {
        correlationId: timings.correlationId,
        timeToPreparedMs:
          timings.previewReadyAt && timings.previewRequestedAt
            ? timings.previewReadyAt - timings.previewRequestedAt
            : null,
        authorizationAndSourceRoundTripMs:
          timings.authorizationAndSourceRoundTripMs,
        sourceDownloadMs: timings.sourceDownloadMs,
        sourceCacheHit: timings.sourceCacheHit,
        processedPdfCacheHit: timings.processedPdfCacheHit,
        decodeMs: timings.decodeMs,
        pdfParseMs: timings.pdfParseMs,
        watermarkLayoutMs: timings.watermarkLayoutMs,
        pdfSerializeMs: timings.pdfSerializeMs,
        workerTotalMs: timings.workerTotalMs,
        workerStartupMs: timings.workerStartupMs,
        watermarkMs: timings.watermarkMs,
        sourceByteLength: timings.sourceByteLength,
        outputByteLength: timings.outputByteLength,
        pageCount: timings.pageCount,
        previewSetupMs: timings.previewSetupMs,
      });
    }

    function waitForRetry(delayMs, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason || new Error("PDF preview was cancelled."));
          return;
        }
        let timer = 0;
        const cleanup = () => {
          if (timer) globalScope.clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        };
        const onAbort = () => {
          cleanup();
          reject(signal.reason || new Error("PDF preview was cancelled."));
        };
        timer = globalScope.setTimeout(() => {
          cleanup();
          resolve();
        }, delayMs);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }

    async function callPreviewWithRetry(request, options) {
      const maxAttempts = 3;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          return await globalScope.AppNetwork.callBackend(request, {
            ...options,
            maxRetries: 0,
          });
        } catch (error) {
          if (
            error?.code !== "TEMPORARY_UNAVAILABLE" ||
            attempt === maxAttempts - 1 ||
            options.signal?.aborted
          )
            throw error;
          const backoffMs = Math.min(
            250 * 2 ** attempt + Math.floor(Math.random() * 150),
            1200,
          );
          await waitForRetry(backoffMs, options.signal);
        }
      }
      throw new Error("The PDF preview could not be fetched.");
    }

    function prepareReviewerPdfDownload(activePdf) {
      if (!activePdf || activePdf.downloadPreparationPromise)
        return activePdf?.downloadPreparationPromise || Promise.resolve(null);
      const downloadPassword = activePdf.issuanceReference.slice(-4);
      activePdf.downloadPreparationPromise = encryptPdf(
        activePdf.bytes.slice(),
        downloadPassword,
        getWorker().then(
          () => null,
          (error) => error,
        ),
      )
        .then((preparedDownload) => {
          if (
            preparedDownload.bytes.byteLength < 5 ||
            preparedDownload.bytes[0] !== 0x25 ||
            preparedDownload.bytes[1] !== 0x50 ||
            preparedDownload.bytes[2] !== 0x44 ||
            preparedDownload.bytes[3] !== 0x46 ||
            preparedDownload.bytes[4] !== 0x2d ||
            !hasEncryptionDictionary(preparedDownload.bytes) ||
            preparedDownload.metrics.sourceByteLength !==
              activePdf.bytes.byteLength
          )
            throw new Error("The encrypted PDF could not be validated.");
          return preparedDownload;
        })
        .catch((error) => {
          (globalScope.DebugUtils || console).warn(
            "The protected PDF download copy could not be prepared.",
            error,
          );
          activePdf.downloadPreparationPromise = null;
          return { error };
        });
      return activePdf.downloadPreparationPromise;
    }

    async function issueReviewerPdfDownload(event, alreadyConfirmed = false) {
      const activePdf = getActivePdf();
      const sessionId = getSessionId();
      const status = globalScope.document.getElementById(
        "resource-portal-preview-status",
      );
      const bytes = activePdf?.bytes;
      event?.preventDefault();
      const validDownloadName = /^[^<>:"/\\|?*\u0000-\u001f]{1,255}\.pdf$/i.test(
        String(activePdf?.downloadFileName || ""),
      );
      if (
        !activePdf ||
        !sessionId ||
        activePdf.sessionId !== sessionId ||
        !hasPreviewObjectUrl() ||
        !(bytes instanceof Uint8Array) ||
        bytes.byteLength < 5 ||
        bytes[0] !== 0x25 ||
        bytes[1] !== 0x50 ||
        bytes[2] !== 0x44 ||
        bytes[3] !== 0x46 ||
        bytes[4] !== 0x2d ||
        !/^[a-f0-9]{64}$/i.test(String(activePdf.sourceVersion || "")) ||
        !validDownloadName
      ) {
        if (status) {
          status.textContent =
            "The protected PDF is unavailable. Please reload the preview.";
          status.hidden = false;
        }
        return false;
      }
      if (!alreadyConfirmed) {
        const confirmDownload = globalScope.requestConfirmation;
        if (typeof confirmDownload !== "function") {
          if (status) {
            status.textContent =
              "Download confirmation is unavailable. Please reload the page and try again.";
            status.hidden = false;
          }
          return false;
        }
        const confirmationMessage =
          globalScope.document.getElementById("confirm-message");
        const messageWasCentered =
          confirmationMessage?.classList.contains("text-center") || false;
        confirmationMessage?.classList.add("text-center");
        let confirmed;
        try {
          confirmed = await confirmDownload(
            {
              before: "Download PDF?",
              secondary: "Password: Four-digit code in filename.",
              secondaryEmphasis: "Four-digit code",
            },
            "Confirm Download",
          );
        } finally {
          if (!messageWasCentered)
            confirmationMessage?.classList.remove("text-center");
        }
        if (!confirmed) return false;
      }
      let issuedDownload;
      try {
        const referenceDigits = activePdf.issuanceReference.slice(-4);
        setPreviewStatus("Preparing protected PDF download.");
        const preparedDownload = await prepareReviewerPdfDownload(activePdf);
        if (!preparedDownload?.bytes)
          throw (
            preparedDownload?.error ||
            new Error("The protected PDF download could not be prepared.")
          );
        const downloadBytes = preparedDownload.bytes;
        if (
          downloadBytes.byteLength < 5 ||
          downloadBytes[0] !== 0x25 ||
          downloadBytes[1] !== 0x50 ||
          downloadBytes[2] !== 0x44 ||
          downloadBytes[3] !== 0x46 ||
          downloadBytes[4] !== 0x2d ||
          !hasEncryptionDictionary(downloadBytes) ||
          preparedDownload.metrics.sourceByteLength !==
            Number(activePdf.bytes.byteLength) ||
          !/^[0-9]{4}$/.test(referenceDigits)
        )
          throw new Error("The protected PDF download could not be validated.");
        issuedDownload = {
          bytes: downloadBytes,
          downloadFileName: activePdf.downloadFileName,
          pageCount: preparedDownload.metrics.pageCount,
        };
      } catch (error) {
        const detail = String(
          error?.message || "The encrypted PDF could not be prepared.",
        )
          .replace(/https?:\/\/\S+/gi, "the service")
          .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[account]")
          .replace(/[A-Za-z]:\\[^\s]+/g, "[local path]")
          .replace(/[\r\n\t]+/g, " ")
          .trim()
          .slice(0, 180);
        const failureMessage =
          `Unable to prepare the protected PDF download: ${detail}. ` +
          "No file was downloaded. Please retry.";
        setPreviewStatus(failureMessage);
        if (status) {
          status.textContent = failureMessage;
          status.classList.remove("is-loading");
          status.hidden = false;
        }
        (globalScope.DebugUtils || console).error(
          "Unable to prepare the encrypted Reviewer PDF download.",
          error,
        );
        return false;
      }
      if (
        activePdf !== getActivePdf() ||
        activePdf.sessionId !== getSessionId() ||
        !hasPreviewObjectUrl()
      )
        return false;
      clearPreviewStatus();
      const downloadObjectUrl = globalScope.URL.createObjectURL(
        new globalScope.Blob([issuedDownload.bytes], {
          type: "application/pdf",
        }),
      );
      const downloadLink = globalScope.document.createElement("a");
      downloadLink.href = downloadObjectUrl;
      downloadLink.download = issuedDownload.downloadFileName;
      downloadLink.referrerPolicy = "no-referrer";
      downloadLink.hidden = true;
      globalScope.document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      globalScope.setTimeout(
        () => globalScope.URL.revokeObjectURL(downloadObjectUrl),
        60000,
      );
      markPreviewUrlOpened();
      void logResourceDashboardAction(
        "REVIEWERS",
        "PDF_DOWNLOAD",
        getReviewerDisplayName(activePdf.fileName),
        cleanResourceDisplayName(activePdf.fileName),
        {
          course: activePdf.course,
          fileId: activePdf.fileId,
          issuanceReference: activePdf.issuanceReference,
        },
      );
      return true;
    }

    async function downloadReviewerPdf(event, alreadyConfirmed = false) {
      event?.preventDefault();
      const notifyDownloadInProgress = () => {
        showToast(
          "A PDF download is already being prepared. Please wait for it to finish before downloading another copy.",
          "info",
          4000,
        );
      };
      const runDownload = async () => {
        if (downloadInFlight) {
          notifyDownloadInProgress();
          return false;
        }
        downloadInFlight = true;
        const downloadButton = globalScope.document.getElementById(
          "resource-portal-preview-download",
        );
        if (downloadButton) downloadButton.disabled = true;
        try {
          return await issueReviewerPdfDownload(event, alreadyConfirmed);
        } finally {
          downloadInFlight = false;
          if (downloadButton) downloadButton.disabled = false;
        }
      };
      const activePdf = getActivePdf();
      const lockManager = globalScope.navigator?.locks;
      if (
        activePdf?.issuanceReference &&
        typeof lockManager?.request === "function"
      ) {
        try {
          return await lockManager.request(
            `mrh-reviewer-pdf-download-${activePdf.issuanceReference}`,
            { ifAvailable: true },
            (lock) => {
              if (!lock) {
                notifyDownloadInProgress();
                return false;
              }
              return runDownload();
            },
          );
        } catch (error) {
          (globalScope.DebugUtils || console).error(
            "Unable to coordinate a protected PDF download across tabs.",
            error,
          );
          showToast(
            "The download could not be coordinated safely. Please retry.",
            "warning",
            4000,
          );
          return false;
        }
      }
      return runDownload();
    }

    return Object.freeze({
      download: downloadReviewerPdf,
      callPreviewWithRetry,
      getTimingNow,
      logPreviewTimings,
      issue: issueReviewerPdfDownload,
      prepare: prepareReviewerPdfDownload,
      waitForRetry,
    });
  }

  globalScope.ReviewerPdfDownloadCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
