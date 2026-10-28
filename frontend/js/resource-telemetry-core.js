(function (globalScope) {
  "use strict";

  const BATCH_SIZE = 10;
  const MAX_QUEUE_SIZE = 100;
  const FLUSH_INTERVAL_MS = 5000;

  function createController({
    logger,
    debugLogger,
    getAppNetwork,
    getReviewerSessionId,
    getPendingEnrollmentSessionId,
    getSelectedResourceCategory,
    getSelectedYear,
    getSelectedSemester,
    createResourceEventId,
    isDefinitivelyInvalidReviewerCredential,
    signOutReviewer,
  } = {}) {
    const requiredCallbacks = {
      getAppNetwork,
      getReviewerSessionId,
      getPendingEnrollmentSessionId,
      getSelectedResourceCategory,
      getSelectedYear,
      getSelectedSemester,
      createResourceEventId,
      isDefinitivelyInvalidReviewerCredential,
      signOutReviewer,
    };
    for (const [name, callback] of Object.entries(requiredCallbacks)) {
      if (typeof callback !== "function") {
        throw new TypeError(`${name} is required for resource telemetry.`);
      }
    }
    if (!logger || typeof logger.warn !== "function") {
      throw new TypeError("A logger is required for resource telemetry.");
    }

    let queue = [];
    let inFlightEvents = [];
    let flushTimer = null;
    let flushPromise = null;

    function scheduleFlush() {
      if (flushTimer !== null) return;
      flushTimer = globalScope.setTimeout(() => {
        flushTimer = null;
        void flushQueuedEvents();
      }, FLUSH_INTERVAL_MS);
    }

    function queueEvent(payload) {
      if (queue.length >= MAX_QUEUE_SIZE) {
        logger.warn("Resource telemetry queue is full; dropping an event.");
        return false;
      }
      queue.push(payload);
      if (queue.length >= BATCH_SIZE) void flushQueuedEvents();
      else scheduleFlush();
      return true;
    }

    async function flushQueuedEvents() {
      if (flushTimer !== null) {
        globalScope.clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (flushPromise) return flushPromise;
      if (!queue.length) return true;

      const queuedEvents = queue.splice(0, BATCH_SIZE);
      const activeSessionIds = new Set(
        [getReviewerSessionId(), getPendingEnrollmentSessionId()].filter(
          Boolean,
        ),
      );
      const events = queuedEvents.filter(
        (event) => !event?.sessionId || activeSessionIds.has(event.sessionId),
      );
      if (events.length !== queuedEvents.length)
        logger.warn(
          "Stale Reviewer telemetry was dropped after its session changed.",
        );
      if (!events.length) return true;
      inFlightEvents = events;
      flushPromise = (async () => {
        try {
          await getAppNetwork().callBackend(
            {
              type: "batch_log_resource_events",
              events,
            },
            { timeoutMs: 15000, maxRetries: 0 },
          );
          return true;
        } catch (error) {
          if (
            isDefinitivelyInvalidReviewerCredential(error) &&
            events.some((event) => event?.sessionId === getReviewerSessionId())
          )
            signOutReviewer(false);
          logger.warn("Unable to flush queued resource telemetry.", error);
          return false;
        } finally {
          inFlightEvents = [];
          flushPromise = null;
          if (queue.length) scheduleFlush();
        }
      })();
      return flushPromise;
    }

    function sendPageExitBeacon() {
      const sendBeacon = globalScope.navigator?.sendBeacon;
      const endpoint = String(globalScope.MRH_CONFIG?.databaseUrl || "");
      const appVersion = String(globalScope.__MRH_APP__?.version || "");
      if (typeof sendBeacon !== "function" || !endpoint || !appVersion)
        return false;

      const queuedEvents = [...inFlightEvents, ...queue];
      const pendingEvents = queuedEvents.filter((event) => !event?.sessionId);
      if (pendingEvents.length !== queuedEvents.length)
        logger.warn(
          "Authenticated resource telemetry requires a signing key and was omitted from the page-exit beacon.",
        );
      while (pendingEvents.length) {
        const events = pendingEvents.splice(0, BATCH_SIZE);
        let accepted = false;
        try {
          accepted = sendBeacon.call(
            globalScope.navigator,
            endpoint,
            JSON.stringify({
              type: "batch_log_resource_events",
              events,
              appVersion,
              requestId: createResourceEventId(),
            }),
          );
        } catch (error) {
          logger.warn(
            "Unable to send queued resource telemetry on page exit.",
            error,
          );
        }
        if (!accepted) {
          logger.warn(
            "The browser could not queue resource telemetry for page exit.",
          );
          return false;
        }

        const sentEventIds = new Set(events.map((event) => event.eventId));
        queue = queue.filter((event) => !sentEventIds.has(event.eventId));
        inFlightEvents = inFlightEvents.filter(
          (event) => !sentEventIds.has(event.eventId),
        );
      }
      return true;
    }

    async function logResourceFileClick(
      resourceArea,
      fileName,
      fileId,
      context = {},
    ) {
      try {
        // Only allow logging for REVIEWERS and PROFILE
        if (!["REVIEWERS", "PROFILE"].includes(String(resourceArea).toUpperCase())) {
          return false;
        }
        const reviewerSessionId = getReviewerSessionId();
        const payload = {
          type: "log_resource_file_click",
          eventId: createResourceEventId(),
          resourceArea,
          fileName,
          fileId,
          course: context.course || "",
          year: context.year || "",
          semester: context.semester || "",
          category: context.category || "",
        };
        if (reviewerSessionId) payload.sessionId = reviewerSessionId;
        return queueEvent(payload);
      } catch (error) {
        if (isDefinitivelyInvalidReviewerCredential(error))
          signOutReviewer(false);
        debugLogger.error("Unable to record resource file click.", error);
        return false;
      }
    }

    async function logResourceDashboardAction(
      resourceArea,
      action,
      detail = "",
      resource = "",
      auditContext = null,
    ) {
      try {
        // Only allow logging for REVIEWERS and PROFILE
        if (!["REVIEWERS", "PROFILE"].includes(String(resourceArea).toUpperCase())) {
          return false;
        }
        const reviewerSessionId = getReviewerSessionId();
        const payload = {
          type: "log_resource_dashboard_action",
          eventId: createResourceEventId(),
          resourceArea: String(resourceArea || "").slice(0, 32),
          action: String(action || "").slice(0, 64),
          detail: String(detail || "").slice(0, 200),
          resource: String(resource || "").slice(0, 200),
          course: String(auditContext?.course || "").slice(0, 160),
          year:
            String(action || "") === "FILTER_YEAR"
              ? detail
              : resourceArea === "LIBRARY"
                ? ""
                : getSelectedYear(),
          semester:
            String(action || "") === "FILTER_SEMESTER"
              ? detail
              : resourceArea === "LIBRARY"
                ? ""
                : getSelectedSemester(),
          category:
            String(action || "") === "FILTER_CATEGORY"
              ? detail
              : resourceArea === "LIBRARY"
                ? "LIBRARY"
                : getSelectedResourceCategory(),
        };
        payload.year = String(payload.year || "").slice(0, 40);
        payload.semester = String(payload.semester || "").slice(0, 40);
        payload.category = String(payload.category || "").slice(0, 40);
        if (action === "PDF_DOWNLOAD" && auditContext) {
          payload.detail = "PDF download";
          payload.fileId = String(auditContext.fileId || "").slice(0, 200);
          payload.issuanceReference = String(
            auditContext.issuanceReference || "",
          ).slice(0, 16);
        }
        if (reviewerSessionId) payload.sessionId = reviewerSessionId;
        else if (
          resourceArea === "PROFILE" &&
          getPendingEnrollmentSessionId()
        )
          payload.sessionId = getPendingEnrollmentSessionId();
        if (action !== "PDF_DOWNLOAD") return queueEvent(payload);
        await getAppNetwork().callBackend(payload, {
          timeoutMs: 15000,
          maxRetries: 0,
        });
        return true;
      } catch (error) {
        if (isDefinitivelyInvalidReviewerCredential(error))
          signOutReviewer(false);
        debugLogger.error(
          "Unable to record resource dashboard activity.",
          error,
        );
        return false;
      }
    }

    function clearFlushTimer() {
      if (flushTimer === null) return;
      globalScope.clearTimeout(flushTimer);
      flushTimer = null;
    }

    return Object.freeze({
      clearFlushTimer,
      flushQueuedEvents,
      logResourceDashboardAction,
      logResourceFileClick,
      sendPageExitBeacon,
    });
  }

  globalScope.ResourceTelemetryCore = Object.freeze({
    create: createController,
  });
})(typeof window !== "undefined" ? window : globalThis);
