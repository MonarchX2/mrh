(function (globalScope) {
  "use strict";

  function create({
    document = globalScope.document,
    intervalMs = 30000,
    isVisible,
    getActiveTab,
    getReviewerSessionId,
    isReviewerAuthorized,
    loadReviewerDashboard,
    loadResourceDashboard,
    refreshReviewerStatus,
  } = {}) {
    const requiredCallbacks = {
      isVisible,
      getActiveTab,
      getReviewerSessionId,
      isReviewerAuthorized,
      loadReviewerDashboard,
      loadResourceDashboard,
      refreshReviewerStatus,
    };
    for (const [name, callback] of Object.entries(requiredCallbacks)) {
      if (typeof callback !== "function") {
        throw new TypeError(`${name} is required for the dashboard controller.`);
      }
    }

    let refreshTimer = null;
    let lastRefreshAt = 0;
    let initialized = false;
    const refreshOnReturn = () => {
      refreshIfNeeded();
      refreshReviewerStatus();
    };

    function refreshIfNeeded() {
      if (!isVisible()) return false;
      const now = Date.now();
      if (now - lastRefreshAt < intervalMs) return false;
      lastRefreshAt = now;
      if (
        getActiveTab() === "REVIEWERS" &&
        getReviewerSessionId() &&
        isReviewerAuthorized()
      ) {
        void loadReviewerDashboard({ refresh: true });
      } else {
        void loadResourceDashboard({ silent: true });
      }
      return true;
    }

    function markRefreshed(at = Date.now()) {
      lastRefreshAt = Number.isFinite(at) ? at : Date.now();
    }

    function initialize() {
      if (refreshTimer === null)
        refreshTimer = globalScope.setInterval(refreshIfNeeded, intervalMs);
      if (initialized) return;
      document.addEventListener("visibilitychange", refreshIfNeeded);
      document.addEventListener("visibilitychange", refreshReviewerStatus);
      globalScope.addEventListener("pageshow", refreshOnReturn);
      globalScope.addEventListener("focus", refreshOnReturn);
      initialized = true;
    }

    function close() {
      if (refreshTimer !== null) {
        globalScope.clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (!initialized) return;
      document.removeEventListener("visibilitychange", refreshIfNeeded);
      document.removeEventListener("visibilitychange", refreshReviewerStatus);
      globalScope.removeEventListener("pageshow", refreshOnReturn);
      globalScope.removeEventListener("focus", refreshOnReturn);
      initialized = false;
    }

    return Object.freeze({
      close,
      initialize,
      markRefreshed,
      refreshIfNeeded,
    });
  }

  globalScope.ResourceDashboardControllerCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
