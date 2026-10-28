(function (globalScope) {
  "use strict";

  function create(dependencies) {
    const {
      hasRequiredRuntime,
      scheduleDeferredInitialization,
      getBootstrapStatus,
      isInitialized,
      setInitialized,
      logger,
      setBootstrapLoading,
      clearLegacyResourceListings,
      setQuestionDatabaseReady,
      loadState,
      waitForDatabaseReady,
      onQuestionDatabaseReady,
      restorePendingDeckRefreshes,
      getLastActivityMode,
      setLastActivityMode,
      syncPreferenceControls,
      bindAppUi,
      initializeStudentPortalWelcome,
      initializeLibraryAccessLogging,
      applyThemeFromPrefs,
      renderAppSkeleton,
      installReviewerSignOutStorageListener,
      restoreReviewerSession,
      setAppReady,
      emitDebugState,
      setupCacheInvalidationListener,
      startCacheVersionChecking,
      scheduleStartupSync,
      restoreSessionFromUrl,
      renderInitialDashboard,
      initDetailsExclusivity,
      schedulePostStartupUI,
      showBootstrapError,
    } = dependencies;
    let initializationPromise = null;

    async function initialize() {
      if (getBootstrapStatus() === "ready") return true;
      if (initializationPromise) return initializationPromise;
      if (isInitialized()) return true;

      if (!hasRequiredRuntime()) {
        logger.warn(
          "Application initialization deferred until required runtime dependencies are available.",
        );
        scheduleDeferredInitialization();
        return false;
      }

      initializationPromise = (async () => {
        setInitialized(true);
        try {
          setBootstrapLoading();
          try {
            clearLegacyResourceListings();
          } catch (error) {
            logger.error(
              "Unable to clear obsolete resource listing data.",
              error,
            );
          }

          setQuestionDatabaseReady(false);
          await loadState();
          const readiness = waitForDatabaseReady();
          if (!readiness || typeof readiness.then !== "function") {
            throw new Error(
              "AppState database readiness API is unavailable.",
            );
          }
          readiness
            .then((ready) => {
              if (ready !== true) return;
              setQuestionDatabaseReady(true);
              onQuestionDatabaseReady();
            })
            .catch((error) => {
              logger.error("Local question database readiness failed.", error);
            });

          restorePendingDeckRefreshes();
          setLastActivityMode(getLastActivityMode());
          syncPreferenceControls();
          bindAppUi();
          initializeStudentPortalWelcome();
          initializeLibraryAccessLogging();
          applyThemeFromPrefs();
          renderAppSkeleton();
          installReviewerSignOutStorageListener();
          void restoreReviewerSession();

          setAppReady(true);
          emitDebugState?.("app_shell:ready");
          setupCacheInvalidationListener();
          startCacheVersionChecking();
          scheduleStartupSync();
          await restoreSessionFromUrl();
          renderInitialDashboard();
          initDetailsExclusivity();
          schedulePostStartupUI();
          return true;
        } catch (error) {
          setInitialized(false);
          setAppReady(false, error);
          logger.error("Application data initialization failed:", error);
          showBootstrapError(error);
          return false;
        }
      })();

      try {
        return await initializationPromise;
      } finally {
        initializationPromise = null;
      }
    }

    return Object.freeze({ initialize });
  }

  const AppBootstrapCore = Object.freeze({ create });
  globalScope.AppBootstrapCore = AppBootstrapCore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = AppBootstrapCore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
