(function (globalScope) {
  "use strict";

  function create({ getTimingNow }) {
    let worker = null;
    let workerReadyPromise = null;
    let workerReadyResolve = null;
    let workerReadyReject = null;
    let workerReadyTimer = 0;
    let workerStartupMs = null;
    let operationSequence = 0;
    let workerCancel = null;
    const workerOperations = new Map();

    function discardReviewerPdfWorker(
      target = worker,
      error = new Error("The PDF processor was stopped before it was ready."),
    ) {
      if (!target || worker !== target) return;
      const rejectReady = workerReadyReject;
      if (workerReadyTimer) {
        globalScope.clearTimeout(workerReadyTimer);
        workerReadyTimer = 0;
      }
      target.terminate();
      worker = null;
      workerReadyPromise = null;
      workerReadyResolve = null;
      workerReadyReject = null;
      workerStartupMs = null;
      workerOperations.forEach((operation) =>
        operation.finish(operation.reject, error),
      );
      workerOperations.clear();
      rejectReady?.(error);
    }

    function getReviewerPdfWorker() {
      if (workerReadyPromise) return workerReadyPromise;
      const basePath =
        typeof globalScope.__MRH_APP_BASE_PATH === "string"
          ? globalScope.__MRH_APP_BASE_PATH
          : "/";
      const workerUrl = new URL(
        "reviewer-pdf-service/reviewer-pdf-worker.js",
        new URL(basePath, globalScope.location.origin),
      );
      const activeWorker = new globalScope.Worker(workerUrl);
      const workerStartedAt = getTimingNow();
      worker = activeWorker;
      workerReadyPromise = new Promise((resolve, reject) => {
        workerReadyResolve = resolve;
        workerReadyReject = reject;
      });
      activeWorker.onmessage = (event) => {
        if (worker !== activeWorker) return;
        if (event.data?.status === "ready") {
          if (workerReadyTimer) {
            globalScope.clearTimeout(workerReadyTimer);
            workerReadyTimer = 0;
          }
          workerStartupMs = getTimingNow() - workerStartedAt;
          workerReadyResolve?.();
          workerReadyResolve = null;
          workerReadyReject = null;
          return;
        }
        const operation = workerOperations.get(event.data?.operationId);
        if (!operation) return;
        if (event.data?.status === "success" && event.data.resultBuffer) {
          operation.finish(operation.resolve, {
            bytes: new Uint8Array(event.data.resultBuffer),
            sourceBytes:
              event.data.sourceBuffer instanceof ArrayBuffer
                ? new Uint8Array(event.data.sourceBuffer)
                : null,
            metrics:
              event.data.metrics && typeof event.data.metrics === "object"
                ? event.data.metrics
                : {},
          });
          return;
        }
        if (event.data?.status === "cancelled") {
          operation.finish(
            operation.reject,
            operation.cancelReason ||
              new Error("PDF preview processing was cancelled."),
          );
          return;
        }
        operation.finish(
          operation.reject,
          new Error(
            String(event.data?.message || "The PDF could not be prepared."),
          ),
        );
      };
      const handleWorkerError = (event, message) => {
        if (worker !== activeWorker) return;
        event?.preventDefault?.();
        const error = new Error(message);
        if (workerOperations.size) {
          workerOperations.forEach((operation) =>
            operation.finish(operation.reject, error),
          );
          workerOperations.clear();
        }
        discardReviewerPdfWorker(activeWorker, error);
      };
      activeWorker.onerror = (event) =>
        handleWorkerError(event, "The PDF processor could not run.");
      activeWorker.onmessageerror = (event) =>
        handleWorkerError(event, "The PDF processor returned invalid data.");
      workerReadyTimer = globalScope.setTimeout(
        () =>
          discardReviewerPdfWorker(
            activeWorker,
            new Error("The PDF processor did not become ready in time."),
          ),
        30000,
      );
      return workerReadyPromise;
    }

    function processReviewerPdfInWorker(source, identity, ready, operationType) {
      const sourceIsBase64 = typeof source === "string";
      const sourceBuffer = sourceIsBase64
        ? null
        : source.byteOffset === 0 &&
            source.byteLength === source.buffer.byteLength
          ? source.buffer
          : source.buffer.slice(
              source.byteOffset,
              source.byteOffset + source.byteLength,
            );
      return new Promise((resolve, reject) => {
        let settled = false;
        let timeout = 0;
        let activeWorker = null;
        let operation = null;
        let operationId = 0;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          globalScope.clearTimeout(timeout);
          if (operationId) workerOperations.delete(operationId);
          if (workerCancel === cancel) workerCancel = null;
          callback(value);
        };
        const cancel = (reason) => {
          const cancellationError =
            reason || new Error("PDF preview processing was cancelled.");
          if (operation && activeWorker && worker === activeWorker) {
            operation.cancelReason = cancellationError;
            try {
              activeWorker.postMessage({ type: "cancel", operationId });
            } catch {
              discardReviewerPdfWorker(activeWorker, cancellationError);
            }
            return;
          }
          finish(reject, cancellationError);
        };
        workerCancel = cancel;
        try {
          Promise.resolve(ready || getReviewerPdfWorker())
            .then((warmupError) => {
              if (settled) return;
              if (warmupError instanceof Error) throw warmupError;
              activeWorker = worker;
              if (!activeWorker) {
                finish(
                  reject,
                  new Error("The PDF processor could not be loaded."),
                );
                return;
              }
              operationId = ++operationSequence;
              operation = {
                finish,
                resolve,
                reject,
                cancelReason: null,
              };
              workerOperations.set(operationId, operation);
              timeout = globalScope.setTimeout(() => {
                const timeoutError = new Error(
                  "PDF preparation is taking longer than expected. Cancel and retry when ready.",
                );
                if (worker === activeWorker)
                  discardReviewerPdfWorker(activeWorker, timeoutError);
                else finish(reject, timeoutError);
              }, 240000);
              activeWorker.postMessage(
                {
                  type: operationType,
                  ...(sourceIsBase64
                    ? { sourceBase64: source }
                    : { sourceBuffer }),
                  identity,
                  operationId,
                },
                sourceIsBase64 ? [] : [sourceBuffer],
              );
            })
            .catch((error) => finish(reject, error));
        } catch (error) {
          finish(reject, error);
        }
      });
    }

    function hasPdfSignature(bytes) {
      if (!(bytes instanceof Uint8Array)) return false;
      const header = bytes.subarray(0, 1024);
      for (let index = 0; index <= header.length - 5; index += 1) {
        if (
          header[index] === 0x25 &&
          header[index + 1] === 0x50 &&
          header[index + 2] === 0x44 &&
          header[index + 3] === 0x46 &&
          header[index + 4] === 0x2d
        )
          return true;
      }
      return false;
    }

    function hasEncryptionDictionary(bytes) {
      const marker = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74];
      for (let start = 0; start <= bytes.length - marker.length; start += 1) {
        if (marker.every((byte, offset) => bytes[start + offset] === byte))
          return true;
      }
      return false;
    }

    function decodeBase64(encoded) {
      const binary = globalScope.atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1)
        bytes[index] = binary.charCodeAt(index);
      return bytes;
    }

    return {
      decodeBase64,
      discardWorker: discardReviewerPdfWorker,
      encrypt: (source, password, ready) =>
        processReviewerPdfInWorker(
          source,
          { downloadPassword: password },
          ready,
          "encrypt",
        ),
      getStartupMs: () => workerStartupMs,
      getWorker: getReviewerPdfWorker,
      hasEncryptionDictionary,
      hasPdfSignature,
      process: processReviewerPdfInWorker,
      cancel: (reason) => workerCancel?.(reason),
      watermark: (source, identity, ready) =>
        processReviewerPdfInWorker(source, identity, ready, "watermark"),
    };
  }

  globalScope.ReviewerPdfProcessorCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
