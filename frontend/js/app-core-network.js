(function (globalScope) {
  "use strict";

  const DEFAULT_TIMEOUT_MS = 15000;
  const BACKEND_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
  const REVIEWER_SESSION_KEY_STORAGE_KEY = "mrh_reviewer_session_key_v1";
  const IDLE_GATE_BYPASS_REQUEST_TYPES = new Set([
    "get_reviewer_auth_config",
    "verify_reviewer_access",
    "restore_reviewer_session",
    "get_reviewer_account_status",
    "request_reviewer_enrollment",
    "log_reviewer_sign_in",
    "sign_out_reviewer",
  ]);
  const DEFAULT_POOL_CONFIG = {
    maxConnections: 8,
    maxRetries: 2,
    baseRetryDelayMs: 500,
    maxRetryDelayMs: 5000,
    idleTimeoutMs: 60000,
    keepAlive: true,
    keepAliveIntervalMs: 10000,
    reconnectDelayMs: 1000,
    autoReconnect: true,
    healthCheckIntervalMs: 25000,
    healthCheckTimeoutMs: 8000,
  };
  const lifecycle = globalScope.LifecycleUtils || {
    setTimeout: globalScope.setTimeout.bind(globalScope),
    clearTimeout: globalScope.clearTimeout.bind(globalScope),
    setInterval: globalScope.setInterval.bind(globalScope),
    clearInterval: globalScope.clearInterval.bind(globalScope),
  };
  const networkLogger = globalScope.DebugUtils?.createDebugLogger
    ? globalScope.DebugUtils.createDebugLogger("mrh-network")
    : { warn: () => {}, error: () => {} };
  let cachedDatabaseUrl = "";
  let latestBackendCacheVersion = "";
  const reviewerSessionKeyPairPromises = new Map();
  let deckSyncSnapshotSupported = null;
  const deckSyncSnapshotsInFlight = new Map();

  function createBackendActivityGate_(scope, idleTimeoutMs) {
    let documentHidden = scope.document?.visibilityState === "hidden";
    let idle = documentHidden;
    let lastActivityAt = Date.now();
    let idleTimer = 0;
    let resuming = false;
    const waiters = [];
    const clearIdleTimer = () => {
      if (idleTimer) scope.clearTimeout(idleTimer);
      idleTimer = 0;
    };
    const drainWaiters = () => {
      if (idle || documentHidden) {
        resuming = false;
        return;
      }
      while (waiters.length && !idle && !documentHidden) {
        const waiter = waiters.shift();
        if (waiter.signal && waiter.abortHandler) {
          waiter.signal.removeEventListener("abort", waiter.abortHandler);
        }
        waiter.resolve();
      }
      resuming = false;
    };
    const setIdle = (value) => {
      const wasIdle = idle;
      idle = value;
      if (idle) {
        resuming = false;
        return;
      }
      if (wasIdle && waiters.length && !resuming) {
        resuming = true;
        drainWaiters();
      }
    };
    const scheduleIdle = () => {
      clearIdleTimer();
      if (idleTimeoutMs <= 0 || idle || documentHidden) return;
      const remaining = Math.max(
        0,
        idleTimeoutMs - (Date.now() - lastActivityAt),
      );
      idleTimer = scope.setTimeout(() => {
        idleTimer = 0;
        if (Date.now() - lastActivityAt >= idleTimeoutMs) setIdle(true);
        else scheduleIdle();
      }, remaining);
    };
    const markActivity = (event) => {
      if (event && event.isTrusted === false) return;
      lastActivityAt = Date.now();
      setIdle(false);
      scheduleIdle();
    };
    const onVisibilityChange = () => {
      documentHidden = scope.document?.visibilityState === "hidden";
      if (documentHidden) {
        clearIdleTimer();
        setIdle(true);
      } else {
        setIdle(true);
      }
    };
    if (scope.document?.addEventListener) {
      ["pointerdown", "keydown", "touchstart", "wheel", "click", "input", "change"].forEach(
        (eventName) =>
          scope.document.addEventListener(eventName, markActivity, {
            capture: true,
            passive: true,
          }),
      );
      scope.document.addEventListener("visibilitychange", onVisibilityChange);
    }
    scheduleIdle();
    return {
      isIdle: () => idle,
      waitForActivity: (signal, bypassIdleGate = false) => {
        if (bypassIdleGate) return Promise.resolve();
        if (signal?.aborted) {
          return Promise.reject(
            new DOMException("The operation was aborted.", "AbortError"),
          );
        }
        if (!idle && !resuming) return Promise.resolve();
        return new Promise((resolve, reject) => {
          const waiter = { resolve, reject, signal, abortHandler: null };
          if (signal) {
            waiter.abortHandler = () => {
              const index = waiters.indexOf(waiter);
              if (index >= 0) waiters.splice(index, 1);
              signal.removeEventListener("abort", waiter.abortHandler);
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
            };
            signal.addEventListener("abort", waiter.abortHandler, {
              once: true,
            });
          }
          waiters.push(waiter);
          if (!idle && !resuming) {
            resuming = true;
            drainWaiters();
          }
        });
      },
    };
  }

  const backendActivityGate = createBackendActivityGate_(
    globalScope,
    BACKEND_IDLE_TIMEOUT_MS,
  );

  function createRequestId() {
    const candidate = globalScope.crypto?.randomUUID?.();
    if (
      typeof candidate === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        candidate,
      )
    )
      return candidate.toLowerCase();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === "x" ? random : (random & 3) | 8).toString(16);
    });
  }

  async function processBackendError(error) {
    if (!error) return;
    if (error.payload?.code === "CLIENT_UPDATE_REQUIRED") {
      const requestUpdate = globalScope.__MRH_REQUEST_APP_UPDATE;
      if (typeof requestUpdate === "function") await requestUpdate();
    }
    throw error;
  }

  function rememberBackendCacheVersion(response) {
    const version = String(
      response?.cacheVersion ?? response?.version ?? "",
    ).trim();
    if (version) latestBackendCacheVersion = version;
    return response;
  }

  async function getPayloadFingerprint(payload) {
    const cryptoApi = globalScope.crypto || globalThis.crypto;
    const Encoder =
      globalScope.TextEncoder ||
      (typeof TextEncoder !== "undefined" ? TextEncoder : null);
    if (!cryptoApi?.subtle || !Encoder) {
      throw new Error("Secure payload fingerprint verification is unavailable.");
    }
    const bytes = new Encoder().encode(JSON.stringify(payload));
    const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  function calculateRetryDelay(
    attempt,
    baseDelayMs = DEFAULT_POOL_CONFIG.baseRetryDelayMs,
    maxDelayMs = DEFAULT_POOL_CONFIG.maxRetryDelayMs,
  ) {
    const safeAttempt = Math.max(0, Number(attempt) || 0);
    const exponential = baseDelayMs * Math.pow(2, safeAttempt);
    return Math.min(maxDelayMs, exponential);
  }

  function isRetryableError(error) {
    if (!error) return false;
    if (error.code === "POOL_QUEUE_TIMEOUT") return false;
    const status = Number(error?.status);
    if (error.isBackendError) {
      return (
        status === 408 ||
        status === 429 ||
        status >= 500 ||
        [
          "NOT_READY",
          "SERVER_ERROR",
          "SYNC_RACE",
          "TEMPORARY_UNAVAILABLE",
        ].includes(
          String(error.code || "").toUpperCase(),
        )
      );
    }
    if (status === 408 || status === 429 || status >= 500) return true;
    if (error.name === "TimeoutError" || error.name === "TypeError")
      return true;
    if (
      error.message &&
      /network|fetch|Failed to fetch|timed out|temporar|reconnect/i.test(
        error.message,
      )
    ) {
      return true;
    }
    return false;
  }

  async function retryWithBackoff(operation, options = {}) {
    const maxRetries = Number(
      options.maxRetries ?? DEFAULT_POOL_CONFIG.maxRetries,
    );
    let attempt = 0;

    while (true) {
      try {
        return await operation(attempt);
      } catch (error) {
        if (attempt >= maxRetries || !isRetryableError(error)) {
          throw error;
        }
        const delay = calculateRetryDelay(
          attempt,
          Number(
            options.baseRetryDelayMs ?? DEFAULT_POOL_CONFIG.baseRetryDelayMs,
          ),
          Number(
            options.maxRetryDelayMs ?? DEFAULT_POOL_CONFIG.maxRetryDelayMs,
          ),
        );
        await new Promise((resolve) => lifecycle.setTimeout(resolve, delay));
        attempt += 1;
      }
    }
  }

  function createConnectionPool(config = {}) {
    const settings = {
      ...DEFAULT_POOL_CONFIG,
      ...config,
    };
    const queue = [];
    let activeConnections = 0;
    let keepAliveTimer = null;
    let healthCheckTimer = null;
    let reconnectTimer = null;
    let reconnecting = false;
    let reconnectPromise = null;
    let resolveReconnect = null;
    let poolDestroyed = false;
    let lastActivityAt = Date.now();
    let lastSuccessfulResponseAt = Date.now();

    function scheduleIdleKeepAlive() {
      if (!settings.keepAlive) {
        if (keepAliveTimer) {
          lifecycle.clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
        return;
      }

      if (keepAliveTimer) return;
      keepAliveTimer = lifecycle.setInterval(() => {
        const idleMs = Date.now() - lastActivityAt;
        if (idleMs >= settings.idleTimeoutMs && activeConnections === 0) {
          lastActivityAt = Date.now();
          lastSuccessfulResponseAt = Date.now();
        }
      }, settings.keepAliveIntervalMs);
    }

    function scheduleHealthCheck() {
      if (healthCheckTimer || settings.healthCheckIntervalMs <= 0) return;
      healthCheckTimer = lifecycle.setInterval(async () => {
        if (reconnecting || activeConnections > 0) return;
        const idleMs = Date.now() - lastSuccessfulResponseAt;
        if (idleMs < settings.healthCheckIntervalMs) return;

        try {
          const databaseUrl = getDatabaseUrl();
          if (!databaseUrl) return;
          if (typeof settings.healthCheck === "function") {
            await settings.healthCheck(
              databaseUrl,
              settings.healthCheckTimeoutMs,
            );
          } else {
            const url = new URL(
              databaseUrl,
              globalScope.location?.href || undefined,
            );
            const response = await fetchWithTimeout(
              url.toString(),
              {
                method: "GET",
                headers: { Accept: "application/json" },
                redirect: "follow",
                cache: "no-store",
                keepalive: true,
              },
              settings.healthCheckTimeoutMs,
            );
            if (!response.ok) {
              throw new Error(
                `Connection pool health check failed with HTTP ${response.status}.`,
              );
            }
            await response.body?.cancel?.();
          }
          lastSuccessfulResponseAt = Date.now();
          lastActivityAt = Date.now();
        } catch (error) {
          networkLogger.warn("Connection pool health check failed.", error);
          if (settings.autoReconnect && !poolDestroyed) {
            await reconnect();
          }
        }
      }, settings.healthCheckIntervalMs);
    }

    function reconnect() {
      if (poolDestroyed) {
        return Promise.reject(new Error("Connection pool has been destroyed."));
      }
      if (reconnecting) return reconnectPromise || Promise.resolve();
      reconnecting = true;
      const reconnectError = new Error(
        "Connection pool reconnected while request was queued.",
      );
      reconnectError.name = "ReconnectError";
      queue.splice(0).forEach(({ reject }) => reject(reconnectError));
      if (keepAliveTimer) {
        lifecycle.clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      reconnectPromise = new Promise((resolve) => {
        resolveReconnect = resolve;
        reconnectTimer = lifecycle.setTimeout(() => {
          reconnectTimer = null;
          reconnecting = false;
          lastActivityAt = Date.now();
          lastSuccessfulResponseAt = Date.now();
          resolveReconnect = null;
          if (!poolDestroyed) {
            scheduleIdleKeepAlive();
            scheduleHealthCheck();
          }
          reconnectPromise = null;
          resolve();
        }, settings.reconnectDelayMs);
      });
      return reconnectPromise;
    }

    function releaseConnection() {
      lastActivityAt = Date.now();
      lastSuccessfulResponseAt = Date.now();
      const next = queue.shift();
      if (next) {
        next.resolve();
      } else {
        activeConnections = Math.max(0, activeConnections - 1);
      }
      if (!poolDestroyed) {
        scheduleIdleKeepAlive();
        scheduleHealthCheck();
      }
    }

    function acquireConnection(
      priority = false,
      signal = null,
      queueTimeoutMs = 0,
    ) {
      if (poolDestroyed) {
        return Promise.reject(new Error("Connection pool has been destroyed."));
      }
      if (signal?.aborted) {
        const abortedError = new Error("Backend request was aborted.");
        abortedError.name = "AbortError";
        return Promise.reject(abortedError);
      }
      if (activeConnections < settings.maxConnections && queue.length === 0) {
        activeConnections += 1;
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId = null;
        const queuedRequest = {
          priority,
          resolve: () => settle(resolve),
          reject: (error) => settle(reject, error),
        };
        const removeFromQueue = () => {
          const queuedIndex = queue.indexOf(queuedRequest);
          if (queuedIndex >= 0) queue.splice(queuedIndex, 1);
        };
        const cleanup = () => {
          if (timeoutId !== null) lifecycle.clearTimeout(timeoutId);
          if (signal) signal.removeEventListener("abort", onAbort);
        };
        const settle = (settler, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          settler(value);
        };
        const onAbort = () => {
          removeFromQueue();
          const abortedError = new Error("Backend request was aborted.");
          abortedError.name = "AbortError";
          settle(reject, abortedError);
        };
        if (signal) signal.addEventListener("abort", onAbort, { once: true });
        if (priority) {
          const firstStandardRequest = queue.findIndex(
            (request) => !request.priority,
          );
          if (firstStandardRequest === -1) queue.push(queuedRequest);
          else queue.splice(firstStandardRequest, 0, queuedRequest);
        } else {
          queue.push(queuedRequest);
        }
        if (Number(queueTimeoutMs) > 0) {
          timeoutId = lifecycle.setTimeout(() => {
            removeFromQueue();
            const timeoutError = new Error(
              "Backend request timed out while waiting for an available connection.",
            );
            timeoutError.name = "TimeoutError";
            timeoutError.code = "POOL_QUEUE_TIMEOUT";
            settle(reject, timeoutError);
          }, Number(queueTimeoutMs));
        }
      });
    }

    async function request(operation, requestOptions = {}) {
      const attemptLimit = Number(
        requestOptions.maxRetries ?? settings.maxRetries,
      );
      const baseDelay = Number(
        requestOptions.baseRetryDelayMs ?? settings.baseRetryDelayMs,
      );
      const maxDelay = Number(
        requestOptions.maxRetryDelayMs ?? settings.maxRetryDelayMs,
      );

      let acquired = false;
      try {
        await acquireConnection(
          Boolean(requestOptions.priority),
          requestOptions.signal || null,
          requestOptions.queueTimeoutMs,
        );
        acquired = true;
        if (reconnecting) await reconnectPromise;
        if (poolDestroyed) {
          throw new Error("Connection pool has been destroyed.");
        }
        lastActivityAt = Date.now();
        scheduleIdleKeepAlive();
        scheduleHealthCheck();
        return await retryWithBackoff(operation, {
          maxRetries: attemptLimit,
          baseRetryDelayMs: baseDelay,
          maxRetryDelayMs: maxDelay,
        });
      } catch (error) {
        if (
          !poolDestroyed &&
          settings.autoReconnect &&
          isRetryableError(error)
        ) {
          await reconnect();
        }
        throw error;
      } finally {
        if (acquired) releaseConnection();
      }
    }

    scheduleIdleKeepAlive();
    scheduleHealthCheck();

    return {
      settings,
      request,
      reconnect,
      getState: () => ({
        activeConnections,
        reconnecting,
        queueLength: queue.length,
        lastActivityAt,
        lastSuccessfulResponseAt,
      }),
      destroy: () => {
        if (poolDestroyed) return;
        poolDestroyed = true;
        if (keepAliveTimer) {
          lifecycle.clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
        if (healthCheckTimer) {
          lifecycle.clearInterval(healthCheckTimer);
          healthCheckTimer = null;
        }
        if (reconnectTimer) {
          lifecycle.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (reconnecting) {
          reconnecting = false;
          reconnectPromise = null;
          resolveReconnect?.();
          resolveReconnect = null;
        }
        const destroyedError = new Error("Connection pool has been destroyed.");
        queue.splice(0).forEach(({ reject }) => reject(destroyedError));
      },
    };
  }

  const defaultConnectionPool = createConnectionPool({
    keepAlive: false,
    healthCheckIntervalMs: 0,
  });

  function getDatabaseUrl() {
    if (cachedDatabaseUrl) return cachedDatabaseUrl;
    const configuredUrl = globalScope.MRH_CONFIG?.databaseUrl;
    if (typeof configuredUrl === "string" && configuredUrl.trim()) {
      cachedDatabaseUrl = configuredUrl.trim();
      return cachedDatabaseUrl;
    }
    return "";
  }

  const REVIEWER_PDF_MAX_SOURCE_BYTES = 16 * 1024 * 1024;

  function getReviewerPdfSupabaseConfig() {
    let projectUrl;
    try {
      projectUrl = new URL(String(globalScope.MRH_CONFIG?.supabaseUrl || ""));
    } catch (error) {
      throw new Error("The protected PDF storage project is not configured.");
    }
    if (
      projectUrl.protocol !== "https:" ||
      !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(projectUrl.origin) ||
      projectUrl.username ||
      projectUrl.password ||
      projectUrl.pathname !== "/" ||
      projectUrl.search ||
      projectUrl.hash
    )
      throw new Error("The protected PDF storage project is not configured.");
    const bucket = String(globalScope.MRH_CONFIG?.supabasePdfBucket || "")
      .trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket))
      throw new Error("The protected PDF storage bucket is not configured.");
    return { origin: projectUrl.origin, bucket };
  }

  async function getReviewerPdfSignedObjectUrl(
    signedUrl,
    expectedConfig,
    fileId,
    sourceVersion,
    downloadFileName,
  ) {
    let parsedUrl;
    try {
      parsedUrl = new URL(String(signedUrl || ""));
    } catch (error) {
      throw new Error("The protected PDF link is invalid.");
    }
    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.origin !== expectedConfig.origin ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.hash
    )
      throw new Error("The protected PDF link is invalid.");

    const routeMatch =
      /^\/storage\/v1\/object\/sign\/([a-z0-9][a-z0-9_-]{0,62})\/([a-f0-9]{64})\/([a-f0-9]{64})\.pdf$/.exec(
        parsedUrl.pathname,
      );
    if (
      !routeMatch ||
      routeMatch[1] !== expectedConfig.bucket ||
      routeMatch[3] !== String(sourceVersion || "").toLowerCase()
    )
      throw new Error("The protected PDF link is invalid.");
    const queryEntries = Array.from(parsedUrl.searchParams.entries());
    const tokens = parsedUrl.searchParams.getAll("token");
    const downloadNames = parsedUrl.searchParams.getAll("download");
    if (
      tokens.length !== 1 ||
      !tokens[0] ||
      tokens[0].length > 4096 ||
      queryEntries.some(
        ([key]) => key !== "token" && key !== "download",
      ) ||
      downloadNames.length > 1 ||
      (downloadNames.length === 1 &&
        downloadNames[0] !== String(downloadFileName || ""))
    )
      throw new Error("The protected PDF link is invalid.");

    const cryptoApi = globalScope.crypto || globalThis.crypto;
    const Encoder =
      globalScope.TextEncoder ||
      (typeof TextEncoder !== "undefined" ? TextEncoder : null);
    if (!cryptoApi?.subtle || !Encoder)
      throw new Error("Protected PDF link validation is unavailable.");
    const fileIdDigest = await cryptoApi.subtle.digest(
      "SHA-256",
      new Encoder().encode(String(fileId || "")),
    );
    const expectedFileHash = Array.from(new Uint8Array(fileIdDigest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    if (routeMatch[2] !== expectedFileHash)
      throw new Error("The protected PDF link is invalid.");
    return parsedUrl;
  }

  async function readReviewerPdfSignedResponse(response, expectedByteLength) {
    const contentLengthHeader = response.headers?.get?.("content-length");
    if (contentLengthHeader !== null && contentLengthHeader !== undefined) {
      const contentLength = Number(contentLengthHeader);
      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength < 5 ||
        contentLength > REVIEWER_PDF_MAX_SOURCE_BYTES ||
        contentLength > expectedByteLength
      )
        throw new Error("The protected PDF response size is invalid.");
    }

    const reader = response.body?.getReader?.();
    let bytes;
    if (!reader) {
      const buffer = await response.arrayBuffer();
      if (
        buffer.byteLength < 5 ||
        buffer.byteLength > REVIEWER_PDF_MAX_SOURCE_BYTES ||
        buffer.byteLength !== expectedByteLength
      )
        throw new Error("The protected PDF response size is invalid.");
      bytes = new Uint8Array(buffer);
    } else {
      bytes = new Uint8Array(expectedByteLength);
      let totalBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const nextTotalBytes = totalBytes + value.byteLength;
          if (
            nextTotalBytes > REVIEWER_PDF_MAX_SOURCE_BYTES ||
            nextTotalBytes > expectedByteLength
          ) {
            await reader.cancel();
            throw new Error("The protected PDF response size is invalid.");
          }
          bytes.set(value, totalBytes);
          totalBytes = nextTotalBytes;
        }
      } finally {
        reader.releaseLock?.();
      }
      if (totalBytes < 5 || totalBytes !== expectedByteLength)
        throw new Error("The protected PDF response size is invalid.");
    }
    if (
      bytes[0] !== 0x25 ||
      bytes[1] !== 0x50 ||
      bytes[2] !== 0x44 ||
      bytes[3] !== 0x46 ||
      bytes[4] !== 0x2d
    )
      throw new Error("The protected PDF response is invalid.");
    return bytes;
  }

  async function fetchReviewerPdfSignedSource({
    signedUrl,
    signedUrlExpiresInSeconds,
    fileId,
    sourceVersion,
    sourceByteLength,
    downloadFileName,
    signal,
  }) {
    if (
      typeof signedUrlExpiresInSeconds !== "number" ||
      !Number.isFinite(signedUrlExpiresInSeconds) ||
      !Number.isInteger(signedUrlExpiresInSeconds) ||
      signedUrlExpiresInSeconds < 1 ||
      signedUrlExpiresInSeconds > 300
    )
      throw new Error("The protected PDF link expiry is invalid.");
    const expectedByteLength = Number(sourceByteLength);
    if (
      !Number.isSafeInteger(expectedByteLength) ||
      expectedByteLength < 5 ||
      expectedByteLength > REVIEWER_PDF_MAX_SOURCE_BYTES ||
      !/^[a-f0-9]{64}$/i.test(String(sourceVersion || "")) ||
      !/^[A-Za-z0-9_-]{10,200}$/.test(String(fileId || ""))
    )
      throw new Error("The protected PDF source metadata is invalid.");
    const expectedConfig = getReviewerPdfSupabaseConfig();
    const validatedUrl = await getReviewerPdfSignedObjectUrl(
      signedUrl,
      expectedConfig,
      fileId,
      sourceVersion,
      downloadFileName,
    );
    if (signal?.aborted) {
      const abortedError = new Error("Protected PDF download was cancelled.");
      abortedError.name = "AbortError";
      throw abortedError;
    }

    let response;
    try {
      response = await globalScope.fetch(validatedUrl.href, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal,
      });
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") throw error;
      const fetchError = new Error(
        "The signed PDF link could not be retrieved. Retry the preview.",
      );
      fetchError.code = "SIGNED_URL_FETCH_FAILED";
      throw fetchError;
    }
    if (!response.ok) {
      const fetchError = new Error(
        "The signed PDF link could not be retrieved. Retry the preview.",
      );
      fetchError.code = "SIGNED_URL_FETCH_FAILED";
      fetchError.status = response.status;
      throw fetchError;
    }

    let responseUrl;
    try {
      responseUrl = new URL(String(response.url || ""));
    } catch (error) {
      throw new Error("The protected PDF response URL is invalid.");
    }
    const finalUrl = await getReviewerPdfSignedObjectUrl(
      responseUrl.href,
      expectedConfig,
      fileId,
      sourceVersion,
      downloadFileName,
    );
    if (
      responseUrl.origin !== validatedUrl.origin ||
      finalUrl.pathname !== validatedUrl.pathname ||
      finalUrl.searchParams.get("token") !==
        validatedUrl.searchParams.get("token")
    )
      throw new Error("The protected PDF response URL is invalid.");
    const contentType = String(
      response.headers?.get?.("content-type") || "",
    )
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== "application/pdf")
      throw new Error("The protected PDF response has an invalid file type.");
    return readReviewerPdfSignedResponse(response, expectedByteLength);
  }

  function getClientAppVersion() {
    const appVersion = String(globalScope.__MRH_APP__?.version || "").trim();
    if (
      /^mrh-(?:release-)?\d+\.\d+\.\d+(?:-\d+)?(?:-[a-f0-9]{7,40})?$/i.test(
        appVersion,
      )
    ) {
      return appVersion;
    }
    const error = new Error(
      "This website tab has no supported release version. Reload the current website.",
    );
    error.code = "CLIENT_UPDATE_REQUIRED";
    const requestUpdate = globalScope.__MRH_REQUEST_APP_UPDATE;
    if (typeof requestUpdate === "function") {
      Promise.resolve()
        .then(() => requestUpdate())
        .catch((updateError) =>
          networkLogger.warn("Unable to start the required app update:", updateError),
        );
    }
    throw error;
  }

  function normalizeErrorMessage(payload, fallback) {
    if (payload && typeof payload === "object") {
      return String(
        payload.message || payload.error || fallback || "Request failed.",
      );
    }
    return fallback || "Request failed.";
  }

  const REQUEST_SCHEMAS = Object.freeze({
    get_reviewer_auth_config: { required: [], allowed: ["type", "appVersion"] },
    verify_reviewer_access: {
      required: ["idToken", "eventId", "sessionPublicKey"],
      allowed: [
        "type",
        "idToken",
        "eventId",
        "sessionPublicKey",
        "appVersion",
      ],
    },
    log_reviewer_sign_in: {
      required: ["sessionId", "eventId"],
      allowed: ["type", "sessionId", "sessionProof", "eventId", "appVersion"],
    },
    restore_reviewer_session: {
      required: ["sessionId"],
      allowed: ["type", "sessionId", "sessionProof", "appVersion"],
    },
    sign_out_reviewer: {
      required: ["sessionId", "eventId"],
      allowed: ["type", "sessionId", "sessionProof", "eventId", "appVersion"],
    },
    get_reviewer_account_status: {
      required: [],
      allowed: [
        "type",
        "idToken",
        "sessionId",
        "sessionProof",
        "appVersion",
      ],
    },
    request_reviewer_enrollment: {
      required: ["eventId"],
      allowed: [
        "type",
        "idToken",
        "sessionId",
        "sessionProof",
        "eventId",
        "lastName",
        "firstName",
        "middleInitial",
        "appVersion",
      ],
    },
    get_reviewer_dashboard: {
      required: ["eventId"],
      allowed: [
        "type",
        "idToken",
        "sessionId",
        "sessionProof",
        "eventId",
        "appVersion",
      ],
    },
    get_reviewer_pdf_preview: {
      required: ["sessionId", "eventId", "fileId"],
      allowed: [
        "type",
        "sessionId",
        "sessionProof",
        "eventId",
        "fileId",
        "course",
        "courseName",
        "year",
        "semester",
        "category",
        "cachedSourceVersion",
        "cachedSignedSourceAvailable",
        "preferDeliveryMode",
        "issuancePurpose",
        "appVersion",
      ],
    },
    log_module_access: {
      required: ["eventId"],
      allowed: [
        "type",
        "idToken",
        "sessionId",
        "sessionProof",
        "eventId",
        "appVersion",
      ],
    },
    log_resource_file_click: {
      required: ["eventId", "resourceArea", "fileName", "fileId"],
      allowed: [
        "type",
        "eventId",
        "resourceArea",
        "fileName",
        "fileId",
        "course",
        "year",
        "semester",
        "category",
        "idToken",
        "sessionId",
        "sessionProof",
        "appVersion",
      ],
    },
    log_resource_dashboard_action: {
      required: ["eventId", "resourceArea", "action"],
      allowed: [
        "type",
        "eventId",
        "resourceArea",
        "action",
        "detail",
        "resource",
        "course",
        "year",
        "semester",
        "category",
        "fileId",
        "issuanceReference",
        "idToken",
        "sessionId",
        "sessionProof",
        "appVersion",
      ],
    },
    batch_log_resource_events: {
      required: [],
      allowed: ["type", "events", "appVersion"],
    },
    get_deck: {
      required: ["subject"],
      allowed: ["type", "subject", "password", "page", "limit", "appVersion"],
    },
    verify_folder_access: {
      required: ["subject", "password"],
      allowed: ["type", "subject", "password", "appVersion"],
    },
    verify_access: {
      required: ["subject", "password"],
      allowed: ["type", "subject", "password", "appVersion"],
    },
    get_cache_version: { required: [], allowed: ["type", "appVersion"] },
    get_sync_status: { required: [], allowed: ["type", "appVersion"] },
    list_public_resources: {
      required: [],
      allowed: ["type", "folderId", "pageToken", "appVersion"],
    },
    get_resource_preview: {
      required: ["fileId"],
      allowed: ["type", "fileId", "previewMode", "appVersion"],
    },
    get_resource_dashboard: {
      required: ["eventId"],
      allowed: [
        "type",
        "version",
        "idToken",
        "sessionId",
        "sessionProof",
        "eventId",
        "appVersion",
      ],
    },
  });
  const RETRY_SAFE_REQUEST_TYPES = new Set([
    "get_reviewer_auth_config",
    "restore_reviewer_session",
    "get_reviewer_account_status",
    "get_reviewer_dashboard",
    "get_deck",
    "get_cache_version",
    "get_sync_status",
    "list_public_resources",
    "get_resource_preview",
    "get_resource_dashboard",
  ]);

  const STRING_FIELD_LIMITS = Object.freeze({
    type: 64,
    resourceArea: 32,
    action: 64,
    detail: 200,
    resource: 200,
    course: 160,
    year: 40,
    semester: 40,
    category: 40,
    fileName: 200,
    subject: 500,
    password: 500,
    folderId: 200,
    fileId: 200,
    issuanceReference: 16,
    preferDeliveryMode: 16,
    idToken: 8192,
    sessionId: 96,
    sessionProof: 512,
    sessionPublicKey: 1024,
    eventId: 36,
    requestId: 36,
    lastName: 100,
    firstName: 100,
    middleInitial: 10,
    appVersion: 128,
  });
  const MAX_BACKEND_PAYLOAD_BYTES = 500000;
  const MAX_BACKEND_RESPONSE_BYTES = 66 * 1024 * 1024;
  const MAX_REVIEWER_PDF_RESPONSE_BYTES = 46 * 1024 * 1024;

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function getUtf8ByteLength(value) {
    let byteLength = 0;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code <= 0x7f) byteLength += 1;
      else if (code <= 0x7ff) byteLength += 2;
      else if (
        code >= 0xd800 &&
        code <= 0xdbff &&
        index + 1 < value.length &&
        value.charCodeAt(index + 1) >= 0xdc00 &&
        value.charCodeAt(index + 1) <= 0xdfff
      ) {
        byteLength += 4;
        index += 1;
      } else byteLength += 3;
    }
    return byteLength;
  }

  function encodeBase64Bytes(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return globalScope.btoa(binary);
  }

  function reviewerSessionKeyStorage() {
    if (
      typeof idbKeyval === "undefined" ||
      typeof idbKeyval.get !== "function" ||
      typeof idbKeyval.set !== "function" ||
      typeof idbKeyval.del !== "function"
    )
      throw new Error(
        "Secure Reviewer session storage is unavailable in this browser.",
      );
    return idbKeyval;
  }

  async function createReviewerSessionKeyPair() {
    const crypto = globalScope.crypto;
    if (!crypto?.subtle || typeof globalScope.btoa !== "function")
      throw new Error(
        "This browser does not support secure Reviewer sessions.",
      );
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const exportedPublicKey = await crypto.subtle.exportKey(
      "spki",
      keyPair.publicKey,
    );
    const exportedPrivateKey = new Uint8Array(
      await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
    );
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      exportedPrivateKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    exportedPrivateKey.fill(0);
    const publicKeyBase64 = encodeBase64Bytes(
      new Uint8Array(exportedPublicKey),
    );
    const publicKeyLines =
      publicKeyBase64.match(/.{1,64}/g)?.join("\n") || "";
    return {
      keyPair: { privateKey, publicKey: keyPair.publicKey },
      publicKey:
        "-----BEGIN PUBLIC KEY-----\n" +
        publicKeyLines +
        "\n-----END PUBLIC KEY-----",
    };
  }

  function reviewerSessionKeyStorageKey(sessionId) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (!/^[a-f0-9]{96}$/.test(normalizedSessionId))
      throw new Error("The Reviewer session identifier is invalid.");
    return `${REVIEWER_SESSION_KEY_STORAGE_KEY}:${normalizedSessionId}`;
  }

  async function storeReviewerSessionKeyPair(sessionId, keyPair) {
    if (
      !keyPair?.privateKey ||
      keyPair.privateKey.extractable !== false ||
      keyPair.privateKey.algorithm?.name !== "RSASSA-PKCS1-v1_5" ||
      keyPair.privateKey.algorithm?.hash?.name !== "SHA-256" ||
      !keyPair.privateKey.usages?.includes("sign")
    )
      throw new Error("The Reviewer session key is invalid.");
    const key = reviewerSessionKeyStorageKey(sessionId);
    reviewerSessionKeyPairPromises.set(key, Promise.resolve(keyPair));
    await reviewerSessionKeyStorage().set(key, keyPair);
  }

  async function getReviewerSessionKeyPair(sessionId) {
    const key = reviewerSessionKeyStorageKey(sessionId);
    if (!reviewerSessionKeyPairPromises.has(key)) {
      const storedPair = reviewerSessionKeyStorage().get(key).then((keyPair) => {
        if (
          !keyPair?.privateKey ||
          keyPair.privateKey.extractable !== false ||
          keyPair.privateKey.algorithm?.name !== "RSASSA-PKCS1-v1_5" ||
          keyPair.privateKey.algorithm?.hash?.name !== "SHA-256" ||
          !keyPair.privateKey.usages?.includes("sign")
        )
          throw new Error("The saved Reviewer session key is unavailable.");
        return keyPair;
      });
      reviewerSessionKeyPairPromises.set(
        key,
        storedPair.catch((error) => {
          reviewerSessionKeyPairPromises.delete(key);
          throw error;
        }),
      );
    }
    return reviewerSessionKeyPairPromises.get(key);
  }

  async function clearReviewerSessionKeyPair(sessionId) {
    const key = reviewerSessionKeyStorageKey(sessionId);
    reviewerSessionKeyPairPromises.delete(key);
    await reviewerSessionKeyStorage().del(key);
  }

  async function signReviewerRequest(payload) {
    let keyPair;
    try {
      keyPair = await getReviewerSessionKeyPair(payload.sessionId);
    } catch (error) {
      const sessionError = new Error(
        "Your saved access session is no longer available. Sign in with Google again.",
      );
      sessionError.code = "SESSION_INVALID";
      sessionError.cause = error;
      throw sessionError;
    }
    const canonicalPayload = { ...payload };
    delete canonicalPayload.sessionProof;
    const Encoder =
      globalScope.TextEncoder ||
      (typeof TextEncoder !== "undefined" ? TextEncoder : null);
    if (!Encoder || !globalScope.crypto?.subtle)
      throw new Error("Secure Reviewer request signing is unavailable.");
    const signature = await globalScope.crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keyPair.privateKey,
      new Encoder().encode(JSON.stringify(canonicalPayload)),
    );
    return encodeBase64Bytes(new Uint8Array(signature));
  }

  function validateRequestValue(value, key, depth = 0) {
    if (depth > 4) throw new Error("Backend payload is too deeply nested.");
    if (value === null || value === undefined) return;

    if (typeof value === "string") {
      const limit = STRING_FIELD_LIMITS[key] ?? 2000;
      if (value.length > limit) {
        throw new Error(`Backend field '${key}' exceeds its size limit.`);
      }
      return;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value))
        throw new Error(`Backend field '${key}' must be finite.`);
      return;
    }

    if (typeof value === "boolean") return;
    if (Array.isArray(value)) {
      if (value.length > 1000)
        throw new Error(`Backend field '${key}' has too many items.`);
      value.forEach((item) => validateRequestValue(item, key, depth + 1));
      return;
    }

    if (isRecord(value)) {
      const keys = Object.keys(value);
      if (keys.length > 50)
        throw new Error(`Backend field '${key}' has too many properties.`);
      keys.forEach((childKey) =>
        validateRequestValue(value[childKey], childKey, depth + 1),
      );
      return;
    }

    throw new Error(`Backend field '${key}' has an unsupported value.`);
  }

  function validateBackendPayload(payload) {
    if (!isRecord(payload)) {
      throw new Error("Backend payload must be an object.");
    }

    const type = String(payload.type || "").trim();
    const schema = Object.prototype.hasOwnProperty.call(
      REQUEST_SCHEMAS,
      type,
    )
      ? REQUEST_SCHEMAS[type]
      : null;
    if (!schema) throw new Error("Unsupported backend request type.");

    const allowed = new Set(schema.allowed);
    allowed.add("requestId");
    Object.keys(payload).forEach((key) => {
      if (!allowed.has(key)) {
        throw new Error(`Unexpected backend field '${key}'.`);
      }
      validateRequestValue(payload[key], key);
    });

    schema.required.forEach((key) => {
      const value = payload[key];
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Backend field '${key}' is required.`);
      }
    });

    if (type === "batch_log_resource_events") {
      if (!Array.isArray(payload.events) || payload.events.length < 1 || payload.events.length > 10) {
        throw new Error("Backend field 'events' must contain 1 to 10 log entries.");
      }
      payload.events.forEach((event) => {
        if (
          !isRecord(event) ||
          ![
            "log_resource_dashboard_action",
            "log_resource_file_click",
          ].includes(event.type) ||
          (event.type === "log_resource_dashboard_action" &&
            event.action === "PDF_DOWNLOAD")
        ) {
          throw new Error("Backend field 'events' contains an unsupported log entry.");
        }
        validateBackendPayload(event);
      });
    }

    if (
      [
        "get_reviewer_account_status",
        "request_reviewer_enrollment",
        "get_reviewer_dashboard",
        "get_reviewer_pdf_preview",
        "log_module_access",
      ].includes(type) &&
      !String(payload.idToken || "").trim() &&
      !String(payload.sessionId || "").trim()
    ) {
      throw new Error(
        `Backend request '${type}' requires a reviewer session.`,
      );
    }

    if (
      payload.page !== undefined &&
      (!Number.isInteger(payload.page) || payload.page < 1)
    ) {
      throw new Error("Backend field 'page' must be a positive integer.");
    }
    if (
      payload.limit !== undefined &&
      (!Number.isInteger(payload.limit) ||
        payload.limit < 1 ||
        payload.limit > 1000)
    ) {
      throw new Error(
        "Backend field 'limit' must be an integer from 1 to 1000.",
      );
    }
    if (payload.choices !== undefined) {
      if (!isRecord(payload.choices))
        throw new Error("Backend field 'choices' must be an object.");
      Object.keys(payload.choices).forEach((key) => {
        if (
          !/^[ABCDE]$/.test(key) ||
          (payload.choices[key] !== null &&
            payload.choices[key] !== undefined &&
            typeof payload.choices[key] !== "string")
        ) {
          throw new Error(
            "Backend choices must contain only A-E string values.",
          );
        }
      });
    }

    if (
      payload.eventId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        payload.eventId,
      )
    ) {
      throw new Error("Backend field 'eventId' must be a UUID.");
    }
    if (
      payload.requestId !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        payload.requestId,
      )
    ) {
      throw new Error("Backend field 'requestId' must be a UUID.");
    }
    if (
      payload.middleInitial !== undefined &&
      typeof payload.middleInitial !== "string"
    ) {
      throw new Error("Backend field 'middleInitial' must be a string.");
    }

    const serialized = JSON.stringify(payload);
    if (getUtf8ByteLength(serialized) > MAX_BACKEND_PAYLOAD_BYTES) {
      throw new Error("Backend payload exceeds the maximum size.");
    }
  }

  function getBackendError(result, response) {
    const statusCode = Number(result?.statusCode);
    const hasErrorEnvelope =
      result &&
      typeof result === "object" &&
      (result.status === "error" ||
        result.ok === false ||
        result.success === false ||
        (typeof result.error === "string" && result.error.trim() !== "") ||
        (Number.isFinite(statusCode) && statusCode >= 400));
    if (response.ok && !hasErrorEnvelope) return null;

    const error = new Error(
      normalizeErrorMessage(
        result,
        response.ok
          ? "Backend request failed."
          : `Backend HTTP ${response.status}.`,
      ),
    );
    error.status = statusCode || (response.ok ? 0 : response.status);
    error.code = result?.code || "HTTP_ERROR";
    error.payload = result;
    error.correlationId =
      typeof result?.correlationId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        result.correlationId,
      )
        ? result.correlationId
        : "";
    error.isBackendError = true;
    return error;
  }

  function createResponseTooLargeError() {
    const error = new Error("Backend response exceeds the maximum size.");
    error.code = "RESPONSE_TOO_LARGE";
    return error;
  }

  async function readBackendResponseText(
    response,
    maxResponseBytes = MAX_BACKEND_RESPONSE_BYTES,
    metrics = null,
  ) {
    const contentLength = Number(response.headers?.get?.("content-length"));
    if (
      maxResponseBytes !== null &&
      Number.isFinite(contentLength) &&
      contentLength > maxResponseBytes
    ) {
      await response.body?.cancel?.();
      throw createResponseTooLargeError();
    }

    const reader =
      typeof TextDecoder !== "undefined"
        ? response.body?.getReader?.()
        : null;
    if (reader) {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let byteLength = 0;
      let text = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          byteLength += value.byteLength;
          if (
            maxResponseBytes !== null &&
            byteLength > maxResponseBytes
          ) {
            await reader.cancel();
            throw createResponseTooLargeError();
          }
          text += decoder.decode(value, { stream: true });
        }
        if (metrics) metrics.responseBytes = byteLength;
        return text + decoder.decode();
      } finally {
        reader.releaseLock?.();
      }
    }

    const text = await response.text();
    const byteLength = getUtf8ByteLength(text);
    if (metrics) metrics.responseBytes = byteLength;
    if (maxResponseBytes !== null && byteLength > maxResponseBytes) {
      throw createResponseTooLargeError();
    }
    return text;
  }

  async function parseJsonResponse(
    response,
    maxResponseBytes = MAX_BACKEND_RESPONSE_BYTES,
    metrics = null,
  ) {
    const text = await readBackendResponseText(
      response,
      maxResponseBytes,
      metrics,
    );
    const trimmed = String(text || "").trim();
    if (!trimmed) {
      const emptyError = new Error("Backend returned an empty response body.");
      emptyError.status = response.status;
      emptyError.code = "EMPTY_RESPONSE";
      throw emptyError;
    }
    let result;
    const parseStartedAt = Date.now();
    try {
      result = JSON.parse(trimmed);
    } catch (error) {
      const parseError = new Error(
        "Backend returned a non-JSON response.",
      );
      parseError.cause = error;
      parseError.status = response.status;
      parseError.code = "NON_JSON_RESPONSE";
      throw parseError;
    } finally {
      if (metrics) metrics.jsonParseMs = Date.now() - parseStartedAt;
    }
    const contentType = String(
      response.headers?.get?.("content-type") || "",
    ).trim();
    if (
      contentType &&
      !/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(contentType)
    ) {
      const contentTypeError = new Error(
        "Backend returned an unexpected content type.",
      );
      contentTypeError.status = response.status;
      contentTypeError.code = "UNEXPECTED_CONTENT_TYPE";
      throw contentTypeError;
    }
    return result;
  }

  async function fetchWithTimeout(
    url,
    options = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    consumeResponse,
  ) {
    if (options.bypassIdleGate !== true) {
      await backendActivityGate.waitForActivity(
        options.signal,
        options.bypassIdleGate === true,
      );
    }
    const controller = new AbortController();
    const externalSignal = options.signal;
    let externalAbortHandler = null;
    let didTimeout = false;
    const timer = lifecycle.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);

    if (externalSignal) {
      externalAbortHandler = () => controller.abort();
      if (externalSignal.aborted) controller.abort();
      else
        externalSignal.addEventListener("abort", externalAbortHandler, {
          once: true,
        });
    }

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return typeof consumeResponse === "function"
        ? await consumeResponse(response)
        : response;
    } catch (error) {
      if (didTimeout) {
        const timeoutError = new Error(
          `Backend request timed out after ${timeoutMs}ms.`,
        );
        timeoutError.name = "TimeoutError";
        timeoutError.cause = error;
        throw timeoutError;
      }
      throw error;
    } finally {
      lifecycle.clearTimeout(timer);
      if (externalSignal && externalAbortHandler) {
        externalSignal.removeEventListener("abort", externalAbortHandler);
      }
    }
  }

  /**
   * Fixed backend contract:
   * POST JSON requests are dispatched by the backend's `type` field.
   * We deliberately do not invent/translate unsupported backend actions.
   */
  /**
   * @param {Record<string, unknown>} payload
   * @param {{signal?: AbortSignal, timeoutMs?: number, maxRetries?: number, priority?: boolean}} [options]
   * @returns {Promise<Record<string, unknown>>}
   */
  async function callBackend(payload, options = {}) {
    const bypassIdleGate =
      options.bypassIdleGate === true ||
      IDLE_GATE_BYPASS_REQUEST_TYPES.has(String(payload.type || ""));
    const url = getDatabaseUrl();
    if (!url) throw new Error("Database URL is not configured.");
    const appVersion = getClientAppVersion();
    const requestId = createRequestId();
    const requestStartedAt = Date.now();
    const requestTimingNow = () =>
      typeof globalScope.performance?.now === "function"
        ? globalScope.performance.now()
        : Date.now();
    const pdfRequestTimings =
      payload.type === "get_reviewer_pdf_preview"
        ? {
            startedAt: requestTimingNow(),
            preparationMs: null,
            connectionQueueWaitMs: null,
            backendRoundTripMs: 0,
            backendAttempts: 0,
            jsonParseMs: 0,
          }
        : null;
    let versionedPayload = { ...payload, appVersion, requestId };
    if (
      versionedPayload.type === "batch_log_resource_events" &&
      Array.isArray(versionedPayload.events)
    ) {
      const events = [];
      for (const event of versionedPayload.events) {
        events.push(
          event?.sessionId
            ? {
                ...event,
                sessionProof: await signReviewerRequest(event),
              }
            : event,
        );
      }
      versionedPayload = { ...versionedPayload, events };
    } else if (versionedPayload.sessionId) {
      try {
        versionedPayload.sessionProof =
          await signReviewerRequest(versionedPayload);
      } catch (error) {
        if (versionedPayload.type !== "sign_out_reviewer") throw error;
        networkLogger.warn(
          "Reviewer sign-out is proceeding without a session proof.",
          { code: String(error?.code || "SIGNING_UNAVAILABLE") },
        );
      }
    }
    validateBackendPayload(versionedPayload);
    const serializedPayload = JSON.stringify(versionedPayload);
    const poolQueuedAt = requestTimingNow();
    if (pdfRequestTimings)
      pdfRequestTimings.preparationMs = poolQueuedAt - pdfRequestTimings.startedAt;
    const requestPromise = defaultConnectionPool.request(
      async () => {
        if (pdfRequestTimings) {
          pdfRequestTimings.backendAttempts += 1;
          if (pdfRequestTimings.connectionQueueWaitMs === null)
            pdfRequestTimings.connectionQueueWaitMs =
              requestTimingNow() - poolQueuedAt;
        }
        let response = null;
        const pdfResponseMetrics =
          payload.type === "get_reviewer_pdf_preview" ? {} : null;
        const backendRoundTripStartedAt = requestTimingNow();
        try {
          const responseLimit =
            payload.type === "get_reviewer_pdf_preview"
              ? MAX_REVIEWER_PDF_RESPONSE_BYTES
              : MAX_BACKEND_RESPONSE_BYTES;
          let parsedResponse;
          try {
            parsedResponse = await fetchWithTimeout(
              url,
              {
                method: "POST",
                headers: {
                  "Content-Type": "text/plain;charset=utf-8",
                  Accept: "application/json",
                  ...(options.headers || {}),
                },
                body: serializedPayload,
                redirect: "follow",
                cache: "no-store",
                keepalive: serializedPayload.length <= 60000,
                signal: options.signal,
                bypassIdleGate: bypassIdleGate,
              },
              Number(options.timeoutMs) > 0
                ? Number(options.timeoutMs)
                : DEFAULT_TIMEOUT_MS,
              async (response) => {
                const result = await parseJsonResponse(
                  response,
                  responseLimit,
                  pdfResponseMetrics,
                );
                if (pdfResponseMetrics) {
                  pdfRequestTimings.jsonParseMs =
                    Number(pdfResponseMetrics.jsonParseMs) || 0;
                  const pdfMetricsLogger =
                    typeof globalScope.DebugUtils?.info === "function"
                      ? globalScope.DebugUtils
                      : console;
                  pdfMetricsLogger.info(
                    "Reviewer PDF response parsing metrics.",
                    {
                      correlationId: String(payload.eventId || ""),
                      responseBytes: pdfResponseMetrics.responseBytes,
                      jsonParseMs: pdfResponseMetrics.jsonParseMs,
                    },
                  );
                }
                return { response, result };
              },
            );
          } finally {
            if (pdfRequestTimings)
              pdfRequestTimings.backendRoundTripMs +=
                requestTimingNow() - backendRoundTripStartedAt;
          }
          response = parsedResponse.response;
          const result = parsedResponse.result;
          const backendError = getBackendError(result, response);
          if (backendError) await processBackendError(backendError);
          if (!isRecord(result)) {
            const schemaError = new Error(
              "Backend returned an invalid response structure.",
            );
            schemaError.status = response.status;
            schemaError.code = "INVALID_RESPONSE";
            throw schemaError;
          }
          return result;
        } catch (error) {
          const correlationId =
            typeof error?.correlationId === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              error.correlationId,
            )
              ? error.correlationId.toLowerCase()
              : requestId;
          if (error && typeof error === "object" && !error.correlationId)
            error.correlationId = correlationId;
          const responseHost =
            String(response?.url || "").match(/^https?:\/\/([^/:?#]+)/i)?.[1] ||
            "";
          networkLogger.warn("Backend request failed", {
            requestType: String(payload.type || "unknown")
              .replace(/[^A-Za-z0-9_]/g, "")
              .slice(0, 64),
            appVersion: /^[A-Za-z0-9._-]{1,80}$/.test(appVersion)
              ? appVersion
              : "unknown",
            timestamp: new Date().toISOString(),
            durationMs: Math.max(0, Date.now() - requestStartedAt),
            status: Number(response?.status || error?.status) || 0,
            redirected: Boolean(response?.redirected),
            responseHost: responseHost,
            code: String(error?.code || "NETWORK_ERROR")
              .replace(/[^A-Za-z0-9_]/g, "")
              .slice(0, 40),
            correlationId: correlationId,
          });
          throw error;
        }
      },
      {
        maxRetries: RETRY_SAFE_REQUEST_TYPES.has(String(payload.type || ""))
          ? Number(options.maxRetries ?? DEFAULT_POOL_CONFIG.maxRetries)
          : 0,
        baseRetryDelayMs: Number(
          options.baseRetryDelayMs ?? DEFAULT_POOL_CONFIG.baseRetryDelayMs,
        ),
        maxRetryDelayMs: Number(
          options.maxRetryDelayMs ?? DEFAULT_POOL_CONFIG.maxRetryDelayMs,
        ),
        priority:
          options.priority ??
          [
            "verify_reviewer_access",
            "restore_reviewer_session",
            "get_reviewer_pdf_preview",
          ].includes(
            String(payload.type || ""),
          ),
        queueTimeoutMs: Number(options.queueTimeoutMs) || 0,
        signal: options.signal || null,
      },
    );
    if (!pdfRequestTimings) return requestPromise;
    return requestPromise.finally(() => {
      const pdfMetricsLogger =
        typeof globalScope.DebugUtils?.info === "function"
          ? globalScope.DebugUtils
          : console;
      pdfMetricsLogger.info("Reviewer PDF request-path timing.", {
        correlationId: String(payload.eventId || ""),
        preparationMs: pdfRequestTimings.preparationMs,
        connectionQueueWaitMs: pdfRequestTimings.connectionQueueWaitMs,
        backendRoundTripMs: pdfRequestTimings.backendRoundTripMs,
        backendAttempts: pdfRequestTimings.backendAttempts,
        jsonParseMs: pdfRequestTimings.jsonParseMs,
        totalCallBackendMs: requestTimingNow() - pdfRequestTimings.startedAt,
      });
    });
  }

  let deckSummaryInFlight = null;

  /**
   * @param {{signal?: AbortSignal, timeoutMs?: number}} [options]
   * @returns {Promise<unknown>}
   */
  async function getDeckSummary(options = {}) {
    if (!options.signal && deckSummaryInFlight) {
      return deckSummaryInFlight;
    }

    const request = defaultConnectionPool.request(
      async () => {
        const databaseUrl = getDatabaseUrl();
        if (!databaseUrl) throw new Error("Database URL is not configured.");
        const url = new URL(
          databaseUrl,
          globalScope.location?.href || undefined,
        );

        url.searchParams.set("v", getClientAppVersion());
        if (latestBackendCacheVersion) {
          url.searchParams.set("cv", latestBackendCacheVersion);
        }

        const parsedResponse = await fetchWithTimeout(
          url.toString(),
          {
            method: "GET",
            headers: { Accept: "application/json", ...(options.headers || {}) },
            redirect: "follow",
            cache: "no-cache",
            keepalive: true,
            signal: options.signal,
          },
          Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000,
          async (response) => ({
            response,
            result: await parseJsonResponse(response),
          }),
        );
        const { response, result } = parsedResponse;
        const backendError = getBackendError(result, response);
        if (backendError) await processBackendError(backendError);
        return result;
      },
      {
        maxRetries: Number(
          options.maxRetries ?? DEFAULT_POOL_CONFIG.maxRetries,
        ),
        baseRetryDelayMs: Number(
          options.baseRetryDelayMs ?? DEFAULT_POOL_CONFIG.baseRetryDelayMs,
        ),
        maxRetryDelayMs: Number(
          options.maxRetryDelayMs ?? DEFAULT_POOL_CONFIG.maxRetryDelayMs,
        ),
      },
    );

    if (!options.signal) {
      const trackedRequest = request.finally(() => {
        if (deckSummaryInFlight === trackedRequest) {
          deckSummaryInFlight = null;
        }
      });
      deckSummaryInFlight = trackedRequest;
      return trackedRequest;
    }

    return request;
  }

  async function getDeck(subject, password = "", options = {}) {
    const normalizedSubject = String(subject || "").trim();
    if (!normalizedSubject) throw new Error("Deck subject is required.");
    validateRequestValue(normalizedSubject, "subject");
    const hasPagination =
      options.page !== undefined || options.limit !== undefined;
    const page = Number(options.page ?? 1);
    const limit = Number(options.limit ?? 100);
    if (
      hasPagination &&
      (!Number.isSafeInteger(page) ||
        page < 1 ||
        page > 1000000 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100)
    ) {
      throw new Error(
        "Deck pagination requires a page from 1 to 1000000 and a limit from 1 to 100.",
      );
    }
    const hasPassword = String(password || "").trim().length > 0;
    const requestOptions = {
      ...options,
      maxRetries: options.maxRetries ?? 2,
      baseRetryDelayMs: options.baseRetryDelayMs ?? 300,
      maxRetryDelayMs: options.maxRetryDelayMs ?? 1500,
    };
    const useDirectGet =
      !hasPassword &&
      options.page === undefined &&
      options.limit === undefined &&
      !options.forcePost;

    if (useDirectGet) {
      const databaseUrl = getDatabaseUrl();
      if (!databaseUrl) {
        return callBackend(
          {
            type: "get_deck",
            subject: normalizedSubject,
            password: "",
          },
          requestOptions,
        );
      }

      const url = new URL(databaseUrl, globalScope.location?.href || undefined);
      url.searchParams.set("subject", normalizedSubject);

      url.searchParams.set("v", getClientAppVersion());
      if (latestBackendCacheVersion) {
        url.searchParams.set("cv", latestBackendCacheVersion);
      }

      try {
        const parsedResponse = await fetchWithTimeout(
          url.toString(),
          {
            method: "GET",
            headers: { Accept: "application/json" },
            redirect: "follow",
            cache: "no-cache",
            keepalive: true,
            signal: requestOptions.signal,
          },
          Number(requestOptions.timeoutMs) > 0
            ? Number(requestOptions.timeoutMs)
            : 15000,
          async (response) => ({
            response,
            result: await parseJsonResponse(response),
          }),
        );
        const { response, result } = parsedResponse;
        const backendError = getBackendError(result, response);
        if (backendError) await processBackendError(backendError);
        return result;
      } catch (error) {
        if (options.allowFallback !== false && !error?.isBackendError) {
          return callBackend(
            {
              type: "get_deck",
              subject: normalizedSubject,
              password: "",
            },
            requestOptions,
          );
        }
        throw error;
      }
    }

    const result = await callBackend(
      {
        type: "get_deck",
        subject: normalizedSubject,
        password: String(password || ""),
        ...(hasPagination ? { page, limit } : {}),
      },
      requestOptions,
    );
    if (!hasPagination) return result;
    if (
      !isRecord(result) ||
      !Array.isArray(result.questions) ||
      result.page !== page ||
      result.pageSize !== limit ||
      !Number.isSafeInteger(result.totalCount) ||
      result.totalCount < 0 ||
      result.totalPages !== Math.ceil(result.totalCount / limit) ||
      !/^[a-f0-9]{64}$/i.test(String(result.payloadVersion || "")) ||
      result.hasMore !== (page < result.totalPages) ||
      result.nextPage !== (result.hasMore ? page + 1 : null)
    ) {
      throw new Error("Backend returned invalid deck pagination metadata.");
    }
    const expectedQuestionCount = Math.max(
      0,
      Math.min(limit, result.totalCount - (page - 1) * limit),
    );
    if (result.questions.length !== expectedQuestionCount) {
      throw new Error("Backend returned an incomplete deck page.");
    }
    return result;
  }

  async function getDeckPages(subject, password = "", options = {}) {
    const limit = Number(options.limit ?? 100);
    const requestOptions = { ...options };
    const onProgress = requestOptions.onProgress;
    if (onProgress !== undefined && typeof onProgress !== "function") {
      throw new Error("Deck pagination progress callback must be a function.");
    }
    delete requestOptions.onProgress;
    delete requestOptions.page;
    delete requestOptions.limit;
    const questions = [];
    const seenIds = new Set();
    let expectedTotalCount = null;
    let expectedPayloadVersion = "";
    let page = 1;

    while (true) {
      const result = await getDeck(subject, password, {
        ...requestOptions,
        page,
        limit,
      });
      if (expectedTotalCount === null) {
        expectedTotalCount = result.totalCount;
        expectedPayloadVersion = result.payloadVersion;
      } else if (result.totalCount !== expectedTotalCount) {
        throw new Error("Deck changed while loading paginated questions.");
      } else if (result.payloadVersion !== expectedPayloadVersion) {
        throw new Error("Deck changed while loading paginated questions.");
      }

      for (const question of result.questions) {
        const rawId = Array.isArray(question) ? question[0] : null;
        const id =
          rawId === null || rawId === undefined ? "" : String(rawId);
        if (!id) {
          throw new Error("A paginated deck question is missing its stable ID.");
        }
        if (seenIds.has(id)) {
          throw new Error(`Backend repeated deck question "${id}" across pages.`);
        }
        seenIds.add(id);
        questions.push(question);
      }

      onProgress?.({
        page,
        totalPages: result.totalPages,
        totalCount: result.totalCount,
        loadedCount: questions.length,
        complete: !result.hasMore,
      });
      if (!result.hasMore) break;
      if (result.questions.length === 0 || result.nextPage !== page + 1) {
        throw new Error("Backend returned an incomplete deck page sequence.");
      }
      page = result.nextPage;
    }

    if (questions.length !== expectedTotalCount) {
      throw new Error(
        `Paginated deck was incomplete: expected ${expectedTotalCount} questions, received ${questions.length}.`,
      );
    }
    return questions;
  }

  function getDeckSyncSnapshot(options = {}) {
    const databaseUrl = getDatabaseUrl();
    const appVersion = getClientAppVersion();
    if (
      options.signal ||
      options.headers !== undefined
    ) {
      return readDeckSyncSnapshot_(options);
    }
    const key = JSON.stringify([
      databaseUrl,
      appVersion,
      String(options.since || "").trim(),
      String(options.sinceCacheVersion || "").trim(),
      Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS,
      Number(options.maxRetries ?? DEFAULT_POOL_CONFIG.maxRetries),
      Number(options.baseRetryDelayMs ?? DEFAULT_POOL_CONFIG.baseRetryDelayMs),
      Number(options.maxRetryDelayMs ?? DEFAULT_POOL_CONFIG.maxRetryDelayMs),
    ]);
    const existing = deckSyncSnapshotsInFlight.get(key);
    if (existing) return existing;
    const request = readDeckSyncSnapshot_(options);
    deckSyncSnapshotsInFlight.set(key, request);
    request.then(
      () => {
        if (deckSyncSnapshotsInFlight.get(key) === request)
          deckSyncSnapshotsInFlight.delete(key);
      },
      () => {
        if (deckSyncSnapshotsInFlight.get(key) === request)
          deckSyncSnapshotsInFlight.delete(key);
      },
    );
    return request;
  }

  async function readDeckSyncSnapshot_(options = {}) {
    const since = String(options.since || "").trim();
    const sinceCacheVersion = String(options.sinceCacheVersion || "").trim();
    if (since.length > 100 || /[\u0000-\u001f\u007f]/.test(since)) {
      throw new Error("Sync timestamp is invalid.");
    }
    if (
      sinceCacheVersion.length > 200 ||
      /[\u0000-\u001f\u007f]/.test(sinceCacheVersion)
    ) {
      throw new Error("Sync cache version is invalid.");
    }

    const readLegacySnapshot = async () => {
      const status = rememberBackendCacheVersion(
        await callBackend(
          { type: "get_sync_status" },
          { ...options, maxRetries: 0 },
        ),
      );
      if (status?.status !== "ok") return status;
      if (status.buildStatus === "RUNNING") {
        return {
          ...status,
          syncPending: true,
          retryAfterMs: 5000,
        };
      }
      if (status.isColdStart === true) {
        return { ...status, legacySnapshot: true };
      }
      const since = String(options.since || "").trim();
      const sinceCacheVersion = String(options.sinceCacheVersion || "").trim();
      if (
        since &&
        since === String(status.syncTimestamp || "").trim() &&
        (!status.cacheVersion ||
          (sinceCacheVersion && sinceCacheVersion === status.cacheVersion))
      ) {
        return { ...status, notModified: true, legacySnapshot: true };
      }
      const [summary, latestStatusResponse] = await Promise.all([
        getDeckSummary({
          ...options,
          maxRetries: 0,
        }),
        callBackend(
          { type: "get_sync_status" },
          { ...options, maxRetries: 0 },
        ),
      ]);
      const latestStatus = rememberBackendCacheVersion(latestStatusResponse);
      if (latestStatus?.status !== "ok") return latestStatus;
      if (
        String(latestStatus.syncTimestamp || "").trim() !==
          String(status.syncTimestamp || "").trim() ||
        (status.cacheVersion &&
          latestStatus.cacheVersion &&
          String(latestStatus.cacheVersion) !== String(status.cacheVersion))
      ) {
        return {
          ...latestStatus,
          syncPending: true,
          retryAfterMs: 5000,
        };
      }
      return {
        ...status,
        summary,
        legacySnapshot: true,
        consistencyVerified: true,
      };
    };

    if (deckSyncSnapshotSupported === false) {
      return readLegacySnapshot();
    }

    const databaseUrl = getDatabaseUrl();
    if (!databaseUrl) throw new Error("Database URL is not configured.");
    const url = new URL(
      databaseUrl,
      globalScope.location?.href || undefined,
    );
    const appVersion = getClientAppVersion();
    url.searchParams.set("v", appVersion);
    url.searchParams.set("sync", "1");
    if (since) url.searchParams.set("since", since);
    if (sinceCacheVersion)
      url.searchParams.set("sinceCacheVersion", sinceCacheVersion);

    const result = await defaultConnectionPool.request(
      async () => {
        const parsedResponse = await fetchWithTimeout(
          url.toString(),
          {
            method: "GET",
            headers: { Accept: "application/json", ...(options.headers || {}) },
            redirect: "follow",
            cache: "no-store",
            keepalive: true,
            signal: options.signal,
            bypassIdleGate: options.bypassIdleGate === true,
          },
          Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000,
          async (response) => ({
            response,
            body: await parseJsonResponse(response),
          }),
        );
        const { response, body } = parsedResponse;
        const backendError = getBackendError(body, response);
        if (backendError) await processBackendError(backendError);
        return body;
      },
      {
        maxRetries: Number(
          options.maxRetries ?? DEFAULT_POOL_CONFIG.maxRetries,
        ),
        baseRetryDelayMs: Number(
          options.baseRetryDelayMs ?? DEFAULT_POOL_CONFIG.baseRetryDelayMs,
        ),
        maxRetryDelayMs: Number(
          options.maxRetryDelayMs ?? DEFAULT_POOL_CONFIG.maxRetryDelayMs,
        ),
      },
    );

    if (Array.isArray(result)) {
      deckSyncSnapshotSupported = false;
      return readLegacySnapshot();
    }
    if (result?.isColdStart === true && result?.status !== "ok") {
      deckSyncSnapshotSupported = false;
      return rememberBackendCacheVersion({
        ...(await callBackend(
          { type: "get_sync_status" },
          { ...options, maxRetries: 0 },
        )),
        isColdStart: true,
        legacySnapshot: true,
      });
    }
    if (result?.status === "ok") deckSyncSnapshotSupported = true;
    return rememberBackendCacheVersion(result);
  }

  const backendApi = {
    async getCacheVersion(options = {}) {
      return rememberBackendCacheVersion(
        await callBackend({ type: "get_cache_version" }, options),
      );
    },
    async getSyncStatus(options = {}) {
      return rememberBackendCacheVersion(
        await callBackend({ type: "get_sync_status" }, options),
      );
    },
    getDeckSyncSnapshot,
  };

  const AppNetwork = {
    callBackend,
    fetchReviewerPdfSignedSource,
    createReviewerSessionKeyPair,
    storeReviewerSessionKeyPair,
    clearReviewerSessionKeyPair,
    getActivityState: () => ({
      idle: backendActivityGate.isIdle(),
      idleTimeoutMs: BACKEND_IDLE_TIMEOUT_MS,
    }),
    getDeckSummary,
    getDeckSyncSnapshot,
    getDeck,
    getDeckPages,
    getPayloadFingerprint,
    calculateRetryDelay,
    isRetryableError,
    retryWithBackoff,
    createConnectionPool,
    reconnect: () => defaultConnectionPool.reconnect(),
    getConnectionPoolState: () => defaultConnectionPool.getState(),
    destroy: () => defaultConnectionPool.destroy(),
    verifyFolderAccess: (subject, password, options = {}) =>
      callBackend(
        {
          type: "verify_folder_access",
          subject: String(subject || "").trim(),
          password: String(password || ""),
        },
        options,
      ),
    ...backendApi,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AppNetwork;
  }

  globalScope.callBackend = callBackend;
  globalScope.AppNetwork = AppNetwork;
})(typeof window !== "undefined" ? window : globalThis);
