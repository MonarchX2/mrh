(function (globalScope) {
  "use strict";

  const STATUS_PROTOCOL = "mrh-reviewer-status-v1";
  const STATUS_CHANNEL_NAME = "mrh_reviewer_status_v1";
  const STATUS_POLL_DECAY_INTERVALS_MS = [10000, 30000, 60000, 120000];
  const STATUS_POLL_FAST_WINDOW_MS = 30000;

  function create({
    document = globalScope.document,
    debugLogger = globalScope.DebugUtils || console,
    getSessionIds,
    getAuthorizedEmail,
    getAuthGeneration,
    isDashboardAuthorized,
    applyAccountStatus,
    applyDashboardSnapshot,
    logRequestDiagnostic,
  } = {}) {
    let statusChannel = null;
    let statusBroadcastAt = 0;
    let dashboardBroadcastAt = 0;
    let statusPollTimer = null;
    let sessionRestoreRetryTimer = null;
    let sessionRestoreRetryAttempt = 0;
    async function getSessionBroadcastKey(sessionId) {
      const normalizedSessionId = String(sessionId || "").trim();
      const cryptoApi = globalScope.crypto || globalThis.crypto;
      const Encoder =
        globalScope.TextEncoder ||
        (typeof TextEncoder !== "undefined" ? TextEncoder : null);
      if (
        !/^[a-f0-9]{96}$/i.test(normalizedSessionId) ||
        !cryptoApi?.subtle ||
        !Encoder
      )
        return "";
      try {
        const digest = await cryptoApi.subtle.digest(
          "SHA-256",
          new Encoder().encode(normalizedSessionId),
        );
        return Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      } catch {
        debugLogger.warn(
          "Unable to create a reviewer-session cross-tab binding.",
        );
        return "";
      }
    }

    function initializeStatusChannel() {
      if (
        statusChannel ||
        typeof globalScope.BroadcastChannel !== "function"
      )
        return;
      try {
        statusChannel = new globalScope.BroadcastChannel(STATUS_CHANNEL_NAME);
        statusChannel.onmessage = async (event) => {
          const data = event?.data;
          const sessionIds = getSessionIds();
          const sessionId =
            sessionIds.sessionId || sessionIds.pendingEnrollmentSessionId;
          const email = getAuthorizedEmail();
          if (
            data?.protocol !== STATUS_PROTOCOL ||
            !sessionId ||
            !email ||
            String(data.email || "").trim().toLowerCase() !==
              email.toLowerCase() ||
            !Number.isFinite(Number(data.observedAt))
          )
            return;
          const authGeneration = getAuthGeneration();
          const sessionKey = await getSessionBroadcastKey(sessionId);
          const currentSessionIds = getSessionIds();
          if (
            !sessionKey ||
            data.sessionKey !== sessionKey ||
            authGeneration !== getAuthGeneration() ||
            sessionId !==
              (currentSessionIds.sessionId ||
                currentSessionIds.pendingEnrollmentSessionId) ||
            String(data.email || "").trim().toLowerCase() !==
              getAuthorizedEmail().toLowerCase()
          )
            return;
          const observedAt = Number(data.observedAt);
          const response = data?.response;
          if (
            data.type === "account_status" &&
            observedAt > statusBroadcastAt &&
            response?.status === "success" &&
            String(response.email || "").trim().toLowerCase() ===
              getAuthorizedEmail().toLowerCase() &&
            ["TRUE", "FALSE", "DENIED", "RESTRICTED", "NOT_FOUND"].includes(
              response.accountStatus,
            )
          ) {
            statusBroadcastAt = observedAt;
            try {
              applyAccountStatus(response, sessionId);
            } catch {
              debugLogger.warn(
                "Ignoring an invalid cross-tab reviewer status update.",
              );
            }
            return;
          }
          if (
            data.type !== "dashboard_snapshot" ||
            !isDashboardAuthorized() ||
            observedAt <= dashboardBroadcastAt ||
            !Array.isArray(data.tab?.columns) ||
            !Array.isArray(data.tab?.rows) ||
            !data.tab.rows.every(Array.isArray) ||
            JSON.stringify(data.tab).length > 90000
          )
            return;
          dashboardBroadcastAt = observedAt;
          applyDashboardSnapshot(data.tab);
        };
      } catch {
        statusChannel = null;
        debugLogger.warn(
          "Cross-tab reviewer status updates are unavailable.",
        );
      }
    }

    async function broadcastAccountStatus(response, sessionId) {
      const email = getAuthorizedEmail();
      const sessionIds = getSessionIds();
      if (
        !statusChannel ||
        response?.status !== "success" ||
        typeof response.email !== "string" ||
        !["TRUE", "FALSE", "DENIED", "RESTRICTED", "NOT_FOUND"].includes(
          response.accountStatus,
        )
      )
        return;
      const sessionKey = await getSessionBroadcastKey(sessionId);
      if (
        !sessionKey ||
        (sessionId !== sessionIds.sessionId &&
          sessionId !== sessionIds.pendingEnrollmentSessionId) ||
        String(response.email || "").trim().toLowerCase() !==
          email.toLowerCase()
      )
        return;
      const observedAt = Date.now();
      statusBroadcastAt = observedAt;
      try {
        statusChannel.postMessage({
          protocol: STATUS_PROTOCOL,
          type: "account_status",
          email: response.email.trim().toLowerCase(),
          sessionKey,
          observedAt,
          response: {
            status: "success",
            email: response.email,
            accountStatus: response.accountStatus,
            active: response.accountStatus === "TRUE",
            lastName: String(response.lastName || ""),
            firstName: String(response.firstName || ""),
            middleInitial: String(response.middleInitial || ""),
            picture: String(response.picture || ""),
            suggestedFirstName: String(response.suggestedFirstName || ""),
            suggestedLastName: String(response.suggestedLastName || ""),
          },
        });
      } catch {
        debugLogger.warn(
          "Unable to broadcast reviewer status to other tabs.",
        );
      }
    }

    async function broadcastDashboardSnapshot(tab) {
      if (
        !statusChannel ||
        !isDashboardAuthorized() ||
        !Array.isArray(tab?.columns) ||
        !Array.isArray(tab?.rows) ||
        !tab.rows.every(Array.isArray)
      )
        return;
      const tabJson = JSON.stringify(tab);
      if (tabJson.length > 90000) return;
      const { sessionId } = getSessionIds();
      const email = getAuthorizedEmail();
      const sessionKey = await getSessionBroadcastKey(sessionId);
      if (
        !sessionKey ||
        getSessionIds().sessionId !== sessionId ||
        !isDashboardAuthorized()
      )
        return;
      const observedAt = Date.now();
      dashboardBroadcastAt = observedAt;
      try {
        statusChannel.postMessage({
          protocol: STATUS_PROTOCOL,
          type: "dashboard_snapshot",
          email: email.trim().toLowerCase(),
          sessionKey,
          observedAt,
          tab,
        });
      } catch {
        debugLogger.warn(
          "Unable to broadcast reviewer dashboard refresh to other tabs.",
        );
      }
    }

    async function withCrossTabRequest(kind, email, request, sessionId = "") {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const lockManager = globalScope.navigator?.locks;
      const startedAt = Date.now();
      if (!normalizedEmail || typeof lockManager?.request !== "function") {
        const value = await request();
        logRequestDiagnostic(`${kind}-cross-tab`, "uncoordinated", startedAt);
        return { acquired: true, value };
      }
      let coordinationScope = normalizedEmail;
      if (sessionId) {
        const sessionKey = await getSessionBroadcastKey(sessionId);
        if (!sessionKey) {
          const value = await request();
          logRequestDiagnostic(
            `${kind}-cross-tab`,
            "uncoordinated",
            startedAt,
          );
          return { acquired: true, value };
        }
        coordinationScope = `${normalizedEmail}:${sessionKey}`;
      }
      let result = null;
      await lockManager.request(
        `mrh-reviewer-${kind}:${coordinationScope}`,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!lock) return;
          result = { acquired: true, value: await request() };
        },
      );
      logRequestDiagnostic(
        `${kind}-cross-tab`,
        result ? "lock-acquired" : "lock-contended",
        startedAt,
      );
      return result || { acquired: false, value: null };
    }

    function coalesceRequest(map, key, request, diagnosticName) {
      const existingPromise = map.get(key);
      if (existingPromise) {
        logRequestDiagnostic(diagnosticName, "coalesced");
        return existingPromise;
      }
      const startedAt = Date.now();
      let requestPromise;
      requestPromise = Promise.resolve()
        .then(request)
        .then(
          (value) => {
            logRequestDiagnostic(
              diagnosticName,
              value === false ? "not-completed" : "success",
              startedAt,
            );
            return value;
          },
          (error) => {
            logRequestDiagnostic(diagnosticName, "failure", startedAt);
            throw error;
          },
        )
        .finally(() => {
          if (map.get(key) === requestPromise) map.delete(key);
        });
      map.set(key, requestPromise);
      logRequestDiagnostic(diagnosticName, "started");
      return requestPromise;
    }

    function getStatusPollDelay(
      windowStartedAt,
      unchangedPollCount,
      now = Date.now(),
    ) {
      if (now - windowStartedAt < STATUS_POLL_FAST_WINDOW_MS)
        return STATUS_POLL_DECAY_INTERVALS_MS[0];
      if (unchangedPollCount <= 3)
        return STATUS_POLL_DECAY_INTERVALS_MS[1];
      if (unchangedPollCount === 4) return STATUS_POLL_DECAY_INTERVALS_MS[2];
      return STATUS_POLL_DECAY_INTERVALS_MS[3];
    }

    function stopStatusPolling() {
      if (statusPollTimer === null) return;
      globalScope.clearTimeout(statusPollTimer);
      statusPollTimer = null;
    }

    function scheduleStatusPoll(callback, delay) {
      stopStatusPolling();
      if (document.hidden === true || document.visibilityState === "hidden")
        return false;
      statusPollTimer = globalScope.setTimeout(() => {
        statusPollTimer = null;
        callback();
      }, Math.max(0, Number(delay) || 0));
      return true;
    }

    function stopSessionRestoreRetry() {
      if (sessionRestoreRetryTimer === null) return;
      globalScope.clearTimeout(sessionRestoreRetryTimer);
      sessionRestoreRetryTimer = null;
    }

    function resetSessionRestoreRetryBackoff() {
      sessionRestoreRetryAttempt = 0;
    }

    function scheduleSessionRestoreRetry(
      canRetry,
      retry,
      baseDelayMs,
      maxDelayMs,
    ) {
      stopSessionRestoreRetry();
      if (!canRetry()) return false;
      const retryDelay = Math.min(
        baseDelayMs * 2 ** sessionRestoreRetryAttempt,
        maxDelayMs,
      );
      sessionRestoreRetryAttempt = Math.min(
        sessionRestoreRetryAttempt + 1,
        5,
      );
      sessionRestoreRetryTimer = globalScope.setTimeout(() => {
        sessionRestoreRetryTimer = null;
        if (canRetry()) retry();
      }, retryDelay);
      return true;
    }

    function isSessionRestoreRetryScheduled() {
      return sessionRestoreRetryTimer !== null;
    }

    function close() {
      stopStatusPolling();
      stopSessionRestoreRetry();
      if (!statusChannel) return;
      statusChannel.close();
      statusChannel = null;
    }

    return Object.freeze({
      broadcastAccountStatus,
      broadcastDashboardSnapshot,
      close,
      coalesceRequest,
      getSessionBroadcastKey,
      getStatusPollDelay,
      isSessionRestoreRetryScheduled,
      initializeStatusChannel,
      resetSessionRestoreRetryBackoff,
      scheduleSessionRestoreRetry,
      scheduleStatusPoll,
      stopSessionRestoreRetry,
      stopStatusPolling,
      withCrossTabRequest,
    });
  }

  globalScope.ReviewerSessionCoordinatorCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
