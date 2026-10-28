(function (globalScope) {
  "use strict";

  /**
   * Shared runtime boundary for the browser app.
   * The app intentionally uses a single rootScope to avoid mixed implicit
   * globals and keep the lifecycle/state contract explicit.
   *
   * @typedef {Object} MrhAppRuntimeState
   * @property {Array<Object>} db
   * @property {Array<Object>} categorySummary
   * @property {Object} prefs
   * @property {Object} session
   * @property {Array<string>} currentPath
   */

  const rootScope = globalScope || globalThis;
  const appConfig = rootScope.MRH_CONFIG || {};
  const state = rootScope.state;
  let progressService = null;
  let questionNavigation = null;
  let reviewController = null;
  let sessionPersistence = null;
  let appStatusUI = null;
  let appThemeController = null;
  let appBootstrap = null;
  let appEventController = null;
  const lifecycle = rootScope.LifecycleUtils || rootScope;
  const uiEventController = new AbortController();
  const renderingScheduler = rootScope.RenderingCore?.createScheduler?.() || {
    schedule: (callback) => lifecycle.setTimeout(callback, 0),
    cancelAll: () => undefined,
  };
  const SYNC_INTERVAL_MS = appConfig.syncIntervalMs ?? 60 * 1000;
  const SYNC_RETRY_INTERVAL_MS = appConfig.syncRetryIntervalMs ?? 3 * 1000;
  const STALE_CACHE_MAX_AGE_MS = appConfig.staleCacheMaxAgeMs ?? 10 * 1000;
  const SYNC_RETRY_MAX_DELAY_MS = appConfig.syncRetryMaxDelayMs ?? 60 * 1000;

  function getAppStatusUI() {
    if (!appStatusUI) {
      if (!rootScope.AppStatusUICore?.create) {
        throw new Error("AppStatusUICore is unavailable.");
      }
      appStatusUI = rootScope.AppStatusUICore.create({
        document,
        lifecycle,
        appConfig,
        getState: () => state,
        escapeHTML,
      });
    }
    return appStatusUI;
  }

  function getAppThemeController() {
    if (!appThemeController) {
      if (!rootScope.AppThemeControllerCore?.create) {
        throw new Error("AppThemeControllerCore is unavailable.");
      }
      appThemeController = rootScope.AppThemeControllerCore.create({
        document,
        state,
        saveState,
        logger: appLogger,
        getAnalyticsCore,
        getOrigin: () => rootScope.location?.origin,
      });
    }
    return appThemeController;
  }

  function getAppEventController() {
    if (!appEventController) {
      if (!rootScope.AppEventControllerCore?.create) {
        throw new Error("AppEventControllerCore is unavailable.");
      }
      appEventController = rootScope.AppEventControllerCore.create({
        document,
        window,
        state,
        handleDelegatedUiAction,
        signal: uiEventController.signal,
        scheduleAnimationFrame: scheduleAppAnimationFrame,
        lifecycle,
        getCurrentReviewSubject,
        updateStudyProgressIndicator: () =>
          globalScope.updateStudyProgressIndicator?.(),
        saveState,
      });
    }
    return appEventController;
  }

  function getAppBootstrap() {
    if (!appBootstrap) {
      if (!rootScope.AppBootstrapCore?.create) {
        throw new Error("AppBootstrapCore is unavailable.");
      }
      appBootstrap = rootScope.AppBootstrapCore.create({
        hasRequiredRuntime: hasRequiredAppRuntime,
        scheduleDeferredInitialization,
        getBootstrapStatus: () =>
          typeof window !== "undefined"
            ? window.__MRH_BOOTSTRAP__?.status
            : null,
        isInitialized: () => __mrhAppInitialized,
        setInitialized: (initialized) => {
          __mrhAppInitialized = initialized;
        },
        logger: appLogger,
        setBootstrapLoading: () => {
          if (typeof window === "undefined") return;
          window.__MRH_BOOTSTRAP__ = window.__MRH_BOOTSTRAP__ || {
            status: "idle",
            ready: null,
            error: null,
          };
          window.__MRH_BOOTSTRAP__.status = "loading";
        },
        clearLegacyResourceListings: removeCachedResourcePortalListings,
        setQuestionDatabaseReady: (ready) => {
          localDatabaseReady = ready;
          if (typeof window !== "undefined") {
            window.__mrhQuestionDatabaseReady = ready;
            document.documentElement?.setAttribute(
              "data-question-database-ready",
              String(ready),
            );
          }
        },
        loadState: () => loadState({ deferDatabase: true }),
        waitForDatabaseReady: () => {
          if (typeof AppState.waitForDatabaseReady !== "function") {
            throw new Error(
              "AppState database readiness API is unavailable.",
            );
          }
          localDatabaseReadyPromise = AppState.waitForDatabaseReady();
          return localDatabaseReadyPromise;
        },
        onQuestionDatabaseReady: () => {
          populateFilters();
          updateDashboard();
          invalidateCategoryProgressRenderSignature();
          renderCategoryProgress();
        },
        restorePendingDeckRefreshes: () =>
          pendingDeckPayloadRefreshes.restore(
            state.prefs?.pendingDeckPayloadRefreshes,
          ),
        getLastActivityMode: () =>
          state.prefs?.lastActivity?.mode === "review" ? "review" : "quiz",
        setLastActivityMode: (mode) => {
          currentAppMode = mode;
        },
        syncPreferenceControls,
        bindAppUi,
        initializeStudentPortalWelcome,
        initializeLibraryAccessLogging,
        applyThemeFromPrefs,
        renderAppSkeleton,
        installReviewerSignOutStorageListener,
        restoreReviewerSession,
        setAppReady: (ready, error = null) => {
          __mrhAppReady = ready;
          if (typeof window === "undefined") return;
          window.__mrhAppReady = ready;
          window.__MRH_BOOTSTRAP__.status = ready ? "ready" : "failed";
          window.__MRH_BOOTSTRAP__.error = error;
          if (ready) {
            document.documentElement.setAttribute("data-app-ready", "true");
          }
        },
        emitDebugState: (eventName) => {
          if (typeof globalScope.emitDebugState === "function") {
            globalScope.emitDebugState(eventName, {
              questionDatabaseReady: localDatabaseReady,
            });
          }
        },
        setupCacheInvalidationListener,
        startCacheVersionChecking,
        scheduleStartupSync,
        restoreSessionFromUrl,
        renderInitialDashboard: () => {
          invalidateCategoryProgressRenderSignature();
          renderCategoryProgress();
        },
        initDetailsExclusivity,
        schedulePostStartupUI: () => {
          lifecycle.setTimeout(() => {
            applyTitleMode();
            updateTitleModeButton();
          }, 100);
        },
        showBootstrapError: (error) => {
          if (
            typeof window !== "undefined" &&
            typeof window.showBootstrapError === "function"
          ) {
            window.showBootstrapError(error);
          }
        },
      });
    }
    return appBootstrap;
  }

  function getProgressService() {
    if (!progressService) {
      if (!rootScope.ProgressServiceCore?.create) {
        throw new Error("ProgressServiceCore is unavailable.");
      }
      progressService = rootScope.ProgressServiceCore.create({
        state,
        saveState,
        decodeHandlerValue,
        showToast,
        invalidateCategoryProgressRenderSignature,
        renderCategoryProgress,
        requestConfirmation,
        getDeckReviewCore: () => rootScope.DeckReviewCore,
        reRenderDeckReview: (...args) => {
          if (typeof rootScope.reRenderDeckReview !== "function") {
            throw new Error("Deck review renderer is unavailable.");
          }
          return rootScope.reRenderDeckReview(...args);
        },
        document,
      });
    }
    return progressService;
  }

  function getQuestionNavigation() {
    if (!questionNavigation) {
      if (!rootScope.QuestionNavigationCore?.create) {
        throw new Error("QuestionNavigationCore is unavailable.");
      }
      questionNavigation = rootScope.QuestionNavigationCore.create({
        state,
        saveState,
        decodeHandlerValue,
      });
    }
    return questionNavigation;
  }

  function getReviewController() {
    if (!reviewController) {
      if (!rootScope.ReviewControllerCore?.create) {
        throw new Error("ReviewControllerCore is unavailable.");
      }
      reviewController = rootScope.ReviewControllerCore.create({
        state,
        document,
        waitForLocalDatabaseReady,
        showToast,
        isDeckHidden,
        isDeckLocked,
        pendingDeckPayloadRefreshes,
        getDeckLoaderId,
        setPendingDeckRequest: (subject, action) => {
          pendingDeckSubject = subject;
          pendingDeckAction = action;
        },
        openDeckPasswordModal,
        fetchDeckQuestions,
        navigate,
        saveState,
        ensureAppFeature: (featureName) =>
          typeof rootScope.ensureAppFeature === "function"
            ? rootScope.ensureAppFeature(featureName)
            : Promise.resolve(false),
        renderDeckReview: (...args) => {
          const render = rootScope.DeckReviewCore?.renderDeckReview;
          if (typeof render !== "function") {
            throw new Error("DeckReviewCore is required to render Study mode.");
          }
          return render(...args);
        },
        updateSessionNavigationUrl,
        getSessionCore: () => rootScope.SessionCore,
        hasSessionRestoreProgress,
        requestConfirmation,
        getDeckReviewCore: () => rootScope.DeckReviewCore,
        startCustomSession,
        markQuizActivity,
        getCurrentReviewSubject,
        getCurrentReviewQuestions: () =>
          rootScope.DeckReviewCore?.getCurrentReviewQuestions?.() || [],
        getStoredItem,
        resumeSession,
        getCurrentAppMode: () => currentAppMode,
        setCurrentAppMode: (mode) => {
          currentAppMode = mode;
        },
        syncPreferenceControls,
        logger: appLogger,
      });
    }
    return reviewController;
  }

  function getSessionPersistence() {
    if (!sessionPersistence) {
      if (!rootScope.SessionPersistenceCore?.create) {
        throw new Error("SessionPersistenceCore is unavailable.");
      }
      sessionPersistence = rootScope.SessionPersistenceCore.create({
        state,
        ensureAppFeature,
        isAppReady: () => __mrhAppReady,
        waitForLocalDatabaseReady,
        showToast,
        syncPreferenceControls,
        isDeckHidden,
        isDeckLocked,
        setPendingDeckRequest: (subject, action) => {
          pendingDeckSubject = subject;
          pendingDeckAction = action;
        },
        openDeckPasswordModal,
        fetchDeckQuestions,
        getStoredItem,
        prepareSessionPool: (...args) => {
          if (typeof rootScope.prepareSessionPool !== "function") {
            throw new Error("Practice session preparation is unavailable.");
          }
          return rootScope.prepareSessionPool(...args);
        },
        logger: appLogger,
        navigate,
        document,
        renderQuestion: (...args) => {
          if (typeof rootScope.renderQuestion !== "function") {
            throw new Error("Practice question rendering is unavailable.");
          }
          return rootScope.renderQuestion(...args);
        },
        markQuizActivity,
        updateSessionNavigationUrl,
        requestConfirmation,
        setCurrentAppMode: (mode) => {
          currentAppMode = mode;
        },
        getSessionNavigationFromUrl: () =>
          rootScope.getSessionNavigationFromUrl?.(),
        updateNavigationUrl: (path, options) =>
          rootScope.updateNavigationUrl?.(path, options),
        reviewDeck: (subject, pass, preferCachedQuestions, authorizedSessionQuestions) =>
          getReviewController().reviewDeck(
            subject,
            pass,
            preferCachedQuestions,
            authorizedSessionQuestions,
          ),
        getCurrentPath: () => state.currentPath || [],
      });
      sessionPersistence.setPendingDeckActionGetter?.(() => pendingDeckAction);
    }
    return sessionPersistence;
  }

  let syncAbortController = null;
  let syncRetryTimer = null;
  let syncCountdownTimer = null;
  let syncPollTimer = null;
  let syncAttempt = 0;
  let initialSyncSuccessShown = false;
  const SYNC_FAILURES_BEFORE_WARNING = 3;
  let consecutiveSyncFailures = 0;
  let databaseConnectionIconTone = "info";
  let pendingSummaryData = null;
  let syncConnected = false;
  let isColdStart = false;
  let isInitialSyncComplete = false; // Track if the first sync from startup has completed
  const SYNC_REQUEST_TIMEOUT_MS = appConfig.syncRequestTimeoutMs ?? 60000;
  const BROADCAST_PROTOCOL = "mrh-broadcast-v1";
  const inFlightDeckMutations = new Set();
  const deckMutationsInProgress = new Set();
  let appDataClearInProgress = false;
  let appDataClearGeneration = 0;
  let clearDatabaseInProgress = false;
  let clearAppDataInProgress = false;
  let __mrhAppInitialized = false;
  let __mrhAppReady = false;
  let __mrhInitializationTimer = null;
  let localDatabaseReady = false;
  let localDatabaseReadyPromise = Promise.resolve(false);
  let __mrhPollLoopToken = 0;
  function scheduleAppAnimationFrame(callback) {
    return renderingScheduler.schedule(callback);
  }

  function cancelAppAnimationFrames() {
    renderingScheduler.cancelAll();
  }

  /**
   * Ensure the bootstrap lifecycle has reached the ready state before app work
   * continues.
   *
   * @returns {void}
   */
  function ensureAppReady() {
    const bootstrapStatus =
      typeof window !== "undefined" ? window.__MRH_BOOTSTRAP__?.status : null;

    if (bootstrapStatus !== "ready" && !__mrhAppReady) {
      throw new Error("App bootstrap not complete yet.");
    }
  }

  function hasRequiredAppRuntime() {
    if (typeof document === "undefined") {
      return false;
    }

    return [
      "StorageUtils",
      "TextUtils",
      "AppState",
      "AppNetwork",
      "DelegatedActionsCore",
      "AppBootstrapCore",
      "AppEventControllerCore",
      "AppStatusUICore",
      "AppThemeControllerCore",
      "ResourceTelemetryCore",
      "ResourceDashboardControllerCore",
      "ResourceCatalogViewCore",
      "ResourcePortalBrowserCore",
      "ResourcePreviewControllerCore",
      "ReviewerPdfProcessorCore",
      "ReviewerPdfViewerCore",
      "ReviewerPdfDownloadCore",
      "ReviewerAuthCore",
      "ReviewerSessionCoordinatorCore",
      "ReviewerProfileUICore",
      "ReviewControllerCore",
      "QuestionNavigationCore",
      "ProgressServiceCore",
      "SessionPersistenceCore",
      "DeckSummaryMapperCore",
      "SyncCacheManagerCore",
      "DeckRefreshQueueCore",
      "SyncCoordinatorCore",
      "DeckRepositoryCore",
      "DeckDatabaseLifecycleCore",
      "DeckLoaderCore",
      "DeckAccessStateCore",
    ].every(
      (name) => typeof globalThis[name] !== "undefined",
    );
  }

  function scheduleDeferredInitialization() {
    if (__mrhInitializationTimer !== null) return false;

    __mrhInitializationTimer = lifecycle.setTimeout(() => {
      __mrhInitializationTimer = null;
      if (
        typeof window !== "undefined" &&
        typeof window.initializeApp === "function"
      ) {
        window.initializeApp();
      }
    }, appConfig.deferredInitializationDelayMs ?? 50);

    return true;
  }

  function readStoredSyncStatusTimestamp() {
    return syncCacheManager.readStoredSyncStatusTimestamp();
  }

  function readStoredSyncStatusCacheVersion() {
    return syncCacheManager.readStoredSyncStatusCacheVersion();
  }

  function persistSyncStatusTimestamp(timestamp, cacheVersion = "") {
    syncCacheManager.persistSyncStatusTimestamp(timestamp, cacheVersion);
  }

  // OPTIMIZATION: Leader election pattern - only one tab polls
  let isLeaderTab = false;

  const debugLogger =
    typeof DebugUtils !== "undefined" && DebugUtils.createDebugLogger
      ? DebugUtils.createDebugLogger("mrh-app")
      : {
          snapshot: (label, details = {}) => ({ label, ...details }),
          emit: () => undefined,
        };
  const appLogger =
    typeof DebugUtils !== "undefined" && DebugUtils.createDebugLogger
      ? DebugUtils.createDebugLogger("mrh-app")
      : { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const deckRepository = rootScope.DeckRepositoryCore.create({
    getStorage: () => rootScope.idbKeyval,
    isDeckLocked: (subject) => isDeckLocked(subject),
    shouldPauseWrites: () => appDataClearInProgress,
  });
  const deckDatabaseLifecycle =
    rootScope.DeckDatabaseLifecycleCore.create({
      repository: deckRepository,
    });
  const syncCacheManager = rootScope.SyncCacheManagerCore.create({
    getStoredItem: (...args) => getStoredItem(...args),
    setStoredItem: (...args) => setStoredItem(...args),
    logger: appLogger,
    protocol: BROADCAST_PROTOCOL,
    isLeader: () => isLeaderTab,
    hasCachedSummary: () =>
      Array.isArray(state.categorySummary) && state.categorySummary.length > 0,
    getPayloadSchemaVersion: () =>
      Number(appConfig.backendPayloadSchemaVersion ?? 2),
    onCacheInvalidated: () => handleCacheInvalidation(),
    onPayloadChanged: () => {
      void refreshFromBackendPayloadBroadcast();
    },
    onCurrentSyncStatus: () => {
      reviewerSyncFailed = false;
      syncConnected = true;
      isColdStart = false;
      syncCacheManager.persistDeckCacheTimestamp(Date.now());
      markInitialSyncCompleteFromCache();
      refreshReviewerSyncGate();
      updateSyncStatus(
        '<i class="fa-solid fa-check mr-1"></i> Connected. Database is up to date.',
        "success",
        false,
      );
    },
  });
  const pendingDeckPayloadRefreshes =
    rootScope.DeckRefreshQueueCore.create({
      state,
      lifecycle: globalScope,
      logger: appLogger,
      waitForLocalDatabaseReady: () => waitForLocalDatabaseReady(),
      isSessionActive: () => Boolean(state.session?.active),
      isReviewViewActive: () => isReviewViewActive(),
      getCurrentReviewSubject: () => getCurrentReviewSubject(),
      getSummary: () =>
        Array.isArray(state.categorySummary) ? state.categorySummary : [],
      getQuestionsForSubject: (subject) => getQuestionsForSubject(subject),
      getLocalDeckVersion: (subject) => getLocalDeckVersion(subject),
      getDeckFetchGeneration: (subject) => getDeckFetchGeneration(subject),
      isDeckFetchCurrentForSubject: (subject, generation) =>
        isDeckFetchCurrentForSubject(subject, generation),
      removeDeckFromLocalDatabase: async (subject) => {
        const previousSubjectQuestions = (state.db || []).filter(
          (question) => String(question?.Subject || "").trim() === subject,
        );
        state.db = (state.db || []).filter(
          (question) => String(question?.Subject || "").trim() !== subject,
        );
        rebuildQuestionIndex();
        invalidateCategoryProgressRenderSignature();
        try {
          await safeIdbDeleteDeck(subject);
          setLocalDeckVersion(subject, "");
          return true;
        } catch (error) {
          state.db = [
            ...(state.db || []).filter(
              (question) => String(question?.Subject || "").trim() !== subject,
            ),
            ...previousSubjectQuestions,
          ];
          rebuildQuestionIndex();
          throw error;
        }
      },
      fetchDeck: (subject, expectedQuestionCount) =>
        fetchDeckQuestions(
          subject,
          null,
          null,
          null,
          expectedQuestionCount,
          true,
        ),
      saveState: (key) => saveState(key),
    });

  function createDebugSnapshot(label, details = {}) {
    return debugLogger.snapshot(label, {
      state,
      ...details,
    });
  }

  function emitDebugState(label, details = {}) {
    return debugLogger.emit(label, {
      state,
      ...details,
    });
  }

  if (typeof window !== "undefined") {
    const existingDebugApi = window.MRHDebug || {};
    window.MRHDebug = {
      ...existingDebugApi,
      enable: () => {
        window.__MRH_DEBUG__ = true;
        return true;
      },
      disable: () => {
        window.__MRH_DEBUG__ = false;
        return false;
      },
      snapshot: createDebugSnapshot,
      emit: emitDebugState,
      inspect: createDebugSnapshot,
    };
  }

  function normalizeQuestionRecord(question, subjectOverride = null) {
    if (
      typeof AppState !== "undefined" &&
      typeof AppState.normalizeQuestionRecord === "function"
    ) {
      return AppState.normalizeQuestionRecord(question, subjectOverride);
    }
    throw new Error(
      "AppState is required before normalizing application questions.",
    );
  }

  const {
    escapeHTML,
    renderMathExpression,
    encodeHandlerValue,
    decodeHandlerValue,
  } = TextUtils;
  const delegatedActions = rootScope.DelegatedActionsCore?.create({
    document,
    logger: appLogger,
    escapeHTML,
  });
  if (!delegatedActions) {
    throw new Error("DelegatedActionsCore is required before AppCore.");
  }
  const delegatedActionAttributes = delegatedActions.delegatedActionAttributes;
  const handleDelegatedUiAction = delegatedActions.handleDelegatedUiAction;
  const setResourceDashboardPortalMode =
    delegatedActions.setResourceDashboardPortalMode;

  Object.assign(
    typeof globalThis !== "undefined" ? globalThis : window,
    TextUtils,
  );

  function sanitizeDeletedDeckReferences() {
    const deletedSet = new Set(
      (state.prefs?.deletedDecks || [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    );

    if (deletedSet.size === 0) return;

    state.prefs.favoriteDecks = (state.prefs.favoriteDecks || []).filter(
      (item) => !deletedSet.has(String(item || "").trim()),
    );
    state.prefs.recentDecks = (state.prefs.recentDecks || []).filter(
      (item) => !deletedSet.has(String(item || "").trim()),
    );
    state.categorySummary = (state.categorySummary || []).filter((deck) => {
      if (!deck || !deck.Subject) return true;
      return !deletedSet.has(String(deck.Subject || "").trim());
    });
  }

  const actionLocks = {};

  function runWithActionLock(lockKey, action) {
    if (actionLocks[lockKey]) {
      return Promise.resolve(false);
    }
    actionLocks[lockKey] = true;
    return Promise.resolve()
      .then(action)
      .finally(() => {
        delete actionLocks[lockKey];
      });
  }

  async function runWithBusyButton(button, loadingText, action) {
    if (!button) {
      return action();
    }

    const previousNodes = Array.from(button.childNodes).map((node) =>
      node.cloneNode(true),
    );
    const previousDisabled = button.disabled;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    const spinner = document.createElement("i");
    spinner.className = "fa-solid fa-spinner fa-spin mr-2";
    button.replaceChildren(
      spinner,
      document.createTextNode(` ${String(loadingText ?? "")}`),
    );

    try {
      return await action();
    } finally {
      button.disabled = previousDisabled;
      button.removeAttribute("aria-busy");
      button.replaceChildren(...previousNodes);
    }
  }

  function setInlineError(element, message) {
    if (!element) return;
    element.textContent = message || "";
    element.classList.toggle("hidden", !message);
  }

  function showDeckNotFound(path) {
    const notice = document.getElementById("deck-not-found-notice");
    const pathLabel = document.getElementById("deck-not-found-path");
    if (!notice || !pathLabel) return;

    pathLabel.textContent = Array.isArray(path) ? path.join(" / ") : "";
    notice.classList.remove("hidden");
  }

  function dismissDeckNotFound() {
    document.getElementById("deck-not-found-notice")?.classList.add("hidden");
  }

  function setFormError(inputId, message) {
    const input = inputId ? document.getElementById(inputId) : null;
    const errorElement = inputId
      ? document.getElementById(`${inputId}-error`)
      : null;

    if (errorElement) {
      setInlineError(errorElement, message);
    }

    if (input) {
      input.setAttribute("aria-invalid", message ? "true" : "false");
      input.classList.toggle("border-red-500", Boolean(message));
      input.classList.toggle("focus:ring-red-500", Boolean(message));
    }
  }

  async function loadState(options = {}) {
    if (
      typeof AppState !== "undefined" &&
      typeof AppState.loadState === "function"
    ) {
      return AppState.loadState(options);
    }
    throw new Error("AppState is required before loading application state.");
  }

  async function waitForLocalDatabaseReady() {
    const ready = await localDatabaseReadyPromise;
    return ready === true && localDatabaseReady;
  }

  async function saveState(dirty = "all") {
    if (
      typeof AppState !== "undefined" &&
      typeof AppState.saveState === "function"
    ) {
      return AppState.saveState(dirty);
    }
    throw new Error("AppState is required before saving application state.");
  }

  function syncPreferenceControls() {
    if (
      typeof PreferencesCore !== "undefined" &&
      typeof PreferencesCore.syncPreferenceControls === "function"
    ) {
      return PreferencesCore.syncPreferenceControls();
    }
    throw new Error(
      "PreferencesCore is required before synchronizing preference controls.",
    );
  }

  async function safeIdbSaveDeck(subject, questions) {
    return deckRepository.saveDeck(subject, questions);
  }

  async function safeIdbDeleteDeck(subject) {
    return deckRepository.deleteDeck(subject);
  }

  async function safeIdbClearQuestionDatabase() {
    return deckDatabaseLifecycle.clearQuestionDatabase();
  }

  function isDeckFetchCurrent(generation) {
    return !appDataClearInProgress && generation === appDataClearGeneration;
  }

  async function purgeLegacyReviewerPdfPreviews() {
    try {
      if (
        typeof idbKeyval === "undefined" ||
        typeof idbKeyval.keys !== "function" ||
        typeof idbKeyval.del !== "function"
      )
        return;
      const keys = await idbKeyval.keys();
      await Promise.all(
        keys
          .filter((key) =>
            String(key).startsWith("mrh_reviewer_pdf_prepared_v1:"),
          )
          .map((key) => idbKeyval.del(key)),
      );
    } catch (error) {
      (globalScope.DebugUtils || console).error(
        "Unable to remove legacy cached Reviewer PDFs.",
        error,
      );
    }
  }

  function getDeckFetchGeneration(subject) {
    return deckLoader.getGeneration(subject);
  }

  function invalidateDeckFetch(subject) {
    deckLoader.invalidate(subject);
  }

  function canFetchDeck(subject) {
    const key = String(subject || "").trim();
    return (
      !appDataClearInProgress &&
      !clearDatabaseInProgress &&
      !clearAppDataInProgress &&
      !deckMutationsInProgress.has(key)
    );
  }

  function isDeckFetchCurrentForSubject(subject, generation) {
    return deckLoader.isCurrentForSubject(subject, generation);
  }

  const deckLoader = rootScope.DeckLoaderCore.create({
    canFetchDeck: (subject) => canFetchDeck(subject),
    hasPendingPayloadUpdate: (subject) =>
      pendingDeckPayloadRefreshes.has(String(subject || "").trim()),
    getClearGeneration: () => appDataClearGeneration,
    isClearGenerationCurrent: (generation) =>
      isDeckFetchCurrent(generation),
    getNetwork: () => rootScope.AppNetwork,
    isDeckLocked: (subject) => isDeckLocked(subject),
    onLockedDeck: (subject) => {
      pendingDeckSubject = subject;
      pendingDeckAction = pendingDeckAction || "continue";
      openDeckPasswordModal(subject, pendingDeckAction);
    },
    onFailure: (subject, error, { suppressRender }) => {
      if (!suppressRender) {
        showToast(getDeckFetchFailureMessage(subject, error), "error");
      }
    },
    logger: appLogger,
  });

  async function safeIdbDel(key) {
    if (
      typeof idbKeyval === "undefined" ||
      typeof idbKeyval.del !== "function" ||
      typeof idbKeyval.get !== "function"
    ) {
      throw new Error("IndexedDB storage is unavailable.");
    }

    const storageKey =
      key.includes(":") || key.startsWith("mrh_") ? key : getStorageKey(key);
    await idbKeyval.del(storageKey);
    if ((await idbKeyval.get(storageKey)) !== undefined) {
      throw new Error(`Unable to remove IndexedDB entry "${storageKey}".`);
    }
  }

  function getSyncStatusVisualState(tone = "info") {
    return getAppStatusUI().getSyncStatusVisualState(tone);
  }

  function setDatabaseConnectionStatus(tone) {
    return getAppStatusUI().setDatabaseConnectionStatus(tone);
  }

  function updateDatabaseConnectionIcon(tone) {
    if (databaseConnectionIconTone === tone) return false;
    databaseConnectionIconTone = tone;
    return setDatabaseConnectionStatus(tone);
  }

  function setGlobalLoadingState(
    isLoading,
    title = "Loading...",
    detail = "Preparing the latest data...",
    tone = "info",
  ) {
    return getAppStatusUI().setGlobalLoadingState(
      isLoading,
      title,
      detail,
      tone,
    );
  }

  function updateSyncStatus(message, tone = "info", showOverlay = true) {
    return getAppStatusUI().updateSyncStatus(message, tone, showOverlay);
  }

  function hideConnectionStatusAfterDelay(delay = 3000) {
    return getAppStatusUI().hideConnectionStatusAfterDelay(delay);
  }

  function formatCacheAge(ageMs) {
    const ageValue = Number(ageMs || 0);
    if (!Number.isFinite(ageValue) || ageValue <= 0) return "just now";
    const minutes = Math.floor(ageValue / 60000);
    if (minutes <= 0) return "under a minute ago";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function readStoredDeckCacheTimestamp() {
    return syncCacheManager.readStoredDeckCacheTimestamp();
  }

  function persistDeckCacheTimestamp(timestampMs = Date.now()) {
    syncCacheManager.persistDeckCacheTimestamp(timestampMs);
  }

  function getDeckDataFreshnessState() {
    const summaryCount = Array.isArray(state.categorySummary)
      ? state.categorySummary.length
      : 0;
    const hasCachedData = summaryCount > 0;
    const lastSuccessfulSyncMs = Number(
      syncCacheManager.getLastSyncAt() || readStoredDeckCacheTimestamp(),
    );
    const cacheAgeMs =
      lastSuccessfulSyncMs > 0 ? Date.now() - lastSuccessfulSyncMs : Infinity;
    const isEmpty = !hasCachedData;
    const coldStartState = Boolean(isColdStart && isEmpty);
    const isStale =
      hasCachedData &&
      (!syncConnected ||
        !Number.isFinite(lastSuccessfulSyncMs) ||
        cacheAgeMs >= STALE_CACHE_MAX_AGE_MS ||
        lastSuccessfulSyncMs <= 0);
    const isHealthy =
      syncConnected &&
      hasCachedData &&
      Number.isFinite(lastSuccessfulSyncMs) &&
      lastSuccessfulSyncMs > 0 &&
      cacheAgeMs < STALE_CACHE_MAX_AGE_MS;

    return {
      hasCachedData,
      isEmpty,
      isColdStart: coldStartState,
      isStale,
      isHealthy,
      cacheAgeMs: Number.isFinite(cacheAgeMs) ? cacheAgeMs : 0,
      lastUpdatedAt: lastSuccessfulSyncMs > 0 ? lastSuccessfulSyncMs : 0,
      summaryCount,
    };
  }

  function getDeckDataReadinessState() {
    const freshness = getDeckDataFreshnessState();
    const isOffline = !syncConnected;
    const isBlocked = isOffline && freshness.isColdStart && freshness.isEmpty;
    const shouldPromptForCachedData =
      isOffline && freshness.isStale && freshness.hasCachedData;
    const isUsingCachedData = isOffline && freshness.hasCachedData;
    const isReady = freshness.isHealthy;

    return {
      ...freshness,
      isOffline,
      isBlocked,
      shouldPromptForCachedData,
      isUsingCachedData,
      isReady,
    };
  }

  function getDeckDataFreshnessBannerHtml() {
    const freshness = getDeckDataFreshnessState();

    if (!freshness.hasCachedData && !freshness.isColdStart) {
      return "";
    }

    if (freshness.isHealthy) {
      return "";
    }

    if (freshness.isColdStart) {
      return `
      <div data-deck-freshness class="mb-4 flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-medium text-yellow-700 dark:border-yellow-900/60 dark:bg-yellow-900/20 dark:text-yellow-300">
        <i class="fa-solid fa-hourglass-half"></i>
        <span>Waiting for fresh deck data. The app is reconnecting and may be temporarily empty.</span>
      </div>
    `;
    }

    if (freshness.isEmpty) {
      return `
      <div data-deck-freshness class="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-300">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>No deck data is available yet. Please wait for the database to reconnect.</span>
      </div>
    `;
    }

    return "";
  }

  async function optimizedBackgroundSync() {
    return getSyncController().optimizedBackgroundSync();
  }

  function scheduleSyncPoll() {
    getSyncController().scheduleSyncPoll();
  }

  const syncScheduler = {
    schedule: scheduleSyncPoll,
    cancel: () => getSyncController().cancel(),
    scheduleForLeader: scheduleSyncPoll,
    handleVisibility: (isHidden) =>
      getSyncController().handleVisibility(isHidden),
  };

  function markInitialSyncCompleteFromCache() {
    if (
      isInitialSyncComplete ||
      !Array.isArray(state.categorySummary) ||
      state.categorySummary.length === 0
    )
      return false;
    isInitialSyncComplete = true;
    renderCategoryProgress();
    return true;
  }

  function scheduleSinglePollLoop() {
    if (!isLeaderTab) {
      return;
    }

    scheduleSyncPoll();
  }

  function createSyncControllerOptions() {
    return {
      state,
      lifecycle,
      appConfig,
      network: AppNetwork,
      logger: appLogger,
      isLeader: () => isLeaderTab,
      hasActiveSession: () => Boolean(state.session?.active),
      isImmediateUpdateMode: () =>
        state.prefs.databaseUpdateMode === "immediate",
      setSyncConnected: (value) => {
        if (value) {
          consecutiveSyncFailures = 0;
          updateDatabaseConnectionIcon("success");
        }
        const wasConnected = syncConnected;
        syncConnected = value;
        if (wasConnected !== value)
          lifecycle.setTimeout(refreshReviewerSyncGate, 0);
      },
      onSyncFailure: () => {
        consecutiveSyncFailures += 1;
        if (consecutiveSyncFailures >= SYNC_FAILURES_BEFORE_WARNING)
          updateDatabaseConnectionIcon("warning");
        reviewerSyncFailed = true;
        refreshReviewerSyncGate();
      },
      markInitialSyncCompleteFromCache,
      onSyncSuccess: (status) => {
        reviewerSyncFailed = false;
        broadcastBackendSyncStatus(status);
      },
      setColdStart: (value) => {
        isColdStart = value;
      },
      normalizeSummaryData,
      readStoredSyncStatusTimestamp,
      readStoredSyncStatusCacheVersion,
      persistSyncStatusTimestamp,
      persistSummaryData: async () => {
        const saved = await saveState("summary");
        if (saved === false) {
          throw new Error("Unable to persist the synchronized summary.");
        }
        return true;
      },
      setPendingSummaryData: (summary) => {
        pendingSummaryData = summary;
      },
      applySummaryData,
      purgeUnavailableDeckCache,
      setAccessMetadata: (summary) => {
        state.accessMetadata = buildAccessMetadataMap(summary);
      },
      sanitizeDeletedDeckReferences,
      updateSyncStatus,
      setGlobalLoadingState,
      hideConnectionStatusAfterDelay,
      renderCategoryProgress,
      showColdStartNotification,
      getSummarySignature,
      refreshPendingPayloads: refreshPendingDeckPayloads,
    };
  }

  const syncCoordinator = rootScope.SyncCoordinatorCore.create({
    engineProvider: () => rootScope.SyncCore,
    getControllerOptions: createSyncControllerOptions,
    leaderOptions: {
      lifecycle,
      logger: appLogger,
      protocol: BROADCAST_PROTOCOL,
      tabId:
        typeof window !== "undefined"
          ? (window.mrh_tabId ||= `tab_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`)
          : undefined,
      heartbeatIntervalMs: appConfig.leaderHeartbeatIntervalMs ?? 10 * 1000,
    },
    onLeaderChange: (isLeader) => {
      isLeaderTab = isLeader;
      if (isLeader && typeof scheduleNextPolling === "function") {
        scheduleNextPolling();
        if (__mrhAppReady) {
          if (startupSyncStarted) syncScheduler.handleVisibility(false);
          else scheduleStartupSync();
        }
      } else {
        syncScheduler.cancel();
      }
    },
  });

  function getSyncController() {
    return syncCoordinator.getController();
  }

  function stripAccessMetadataFromSummary(summaryData) {
    return deckSummaryMapper.stripAccessMetadata(summaryData);
  }

  function normalizeSummaryData(summaryData) {
    return deckSummaryMapper.normalizeSummaryData(summaryData);
  }

  function normalizeAccessFlag(value, fallback = false) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;

    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "y", "on", "t"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off", "f"].includes(normalized))
      return false;

    return Boolean(value);
  }

  const deckSummaryMapper = rootScope.DeckSummaryMapperCore.create({
    normalizeAccessFlag,
  });
  const deckAccessState = rootScope.DeckAccessStateCore.create({
    state,
    normalizeAccessFlag,
    getAccessMetadata: () => state.accessMetadata || {},
    getSummary: () => state.categorySummary || [],
    saveState: () => saveState(),
  });
  const {
    buildAccessMetadataMap,
    ensureUnlockedFolderState,
    isDeckHidden,
    isDeckLocked,
    isDeckPasswordProtected,
    isFolderUnlocked,
    resolveSubjectAccess,
    setFolderUnlocked,
  } = deckAccessState;

  function getSummarySignature(summaryData) {
    return deckSummaryMapper.getSummarySignature(summaryData);
  }

  function getSubjectListSignature(summaryData) {
    return deckSummaryMapper.getSubjectListSignature(summaryData);
  }

  let startupSyncStarted = false;
  function scheduleStartupSync() {
    if (typeof window === "undefined" || !isLeaderTab || startupSyncStarted)
      return;
    startupSyncStarted = true;

    if (typeof fetchAccessMetadata === "function") {
      fetchAccessMetadata().catch((error) => {
        appLogger.warn("Initial access metadata refresh failed:", error);
      });
    }
    optimizedBackgroundSync().catch((error) => {
      appLogger.warn("Background startup sync was skipped:", error);
    });
  }

  // REMOVED: mergeAccessMetadataIntoSummary - NOT USED
  // Backend handles all access control in filterSummaryDataByAccess()
  // Frontend should never merge or modify backend response

  async function fetchAccessMetadata() {
    // Backend v8 does not expose the old ?access=1 endpoint. The public summary
    // is the authoritative client-safe access representation: it contains
    // Locked and excludes hidden subjects entirely.
    state.accessMetadata = buildAccessMetadataMap(
      Array.isArray(state.categorySummary) ? state.categorySummary : [],
    );
    return state.accessMetadata;
  }

  function getChangedDownloadedDecks(
    previousSummary,
    nextSummary,
    downloadedSubjects,
  ) {
    const previousDecks = Array.isArray(previousSummary) ? previousSummary : [];
    const nextDecks = Array.isArray(nextSummary) ? nextSummary : [];
    const previousVersions = new Map();
    previousDecks.forEach((deck) => {
      const subject = String(deck?.Subject || "").trim();
      if (subject) {
        previousVersions.set(subject, String(deck?.PayloadVersion || ""));
      }
    });
    const nextSubjects = new Set(
      nextDecks
        .map((deck) => String(deck?.Subject || "").trim())
        .filter(Boolean),
    );
    const downloaded = new Set(downloadedSubjects || []);
    const changedSubjects = new Set();
    nextDecks.forEach((deck) => {
      const subject = String(deck?.Subject || "").trim();
      const nextVersion = String(deck?.PayloadVersion || "");
      if (
        subject &&
        nextVersion &&
        previousVersions.get(subject) !== nextVersion &&
        downloaded.has(subject)
      ) {
        changedSubjects.add(subject);
      }
    });
    previousDecks.forEach((deck) => {
      const subject = String(deck?.Subject || "").trim();
      if (subject && !nextSubjects.has(subject) && downloaded.has(subject)) {
        changedSubjects.add(subject);
      }
    });
    return changedSubjects;
  }

  function getLocalDeckVersion(subject) {
    const normalizedSubject = String(subject || "").trim();
    const versions = state.prefs?.localDeckPayloadVersions;
    return normalizedSubject &&
      versions &&
      typeof versions === "object" &&
      Object.prototype.hasOwnProperty.call(versions, normalizedSubject)
      ? String(versions[normalizedSubject] || "")
      : "";
  }

  function setLocalDeckVersion(subject, version) {
    const normalizedSubject = String(subject || "").trim();
    if (!normalizedSubject) return;
    if (
      !state.prefs.localDeckPayloadVersions ||
      typeof state.prefs.localDeckPayloadVersions !== "object" ||
      Array.isArray(state.prefs.localDeckPayloadVersions)
    ) {
      state.prefs.localDeckPayloadVersions = {};
    }
    if (version) {
      Object.defineProperty(
        state.prefs.localDeckPayloadVersions,
        normalizedSubject,
        {
          value: String(version),
          writable: true,
          enumerable: true,
          configurable: true,
        },
      );
    } else {
      delete state.prefs.localDeckPayloadVersions[normalizedSubject];
    }
  }

  async function purgeUnavailableDeckCache(summaryData) {
    if (!Array.isArray(summaryData)) {
      throw new TypeError(
        "Cannot reconcile local decks without a valid summary.",
      );
    }
    if (!(await waitForLocalDatabaseReady())) {
      throw new Error(
        "Local question data is not ready for backend cache reconciliation.",
      );
    }
    const availableSubjects = new Set(
      summaryData
        .map((deck) => String(deck?.Subject || "").trim())
        .filter(Boolean),
    );
    const lockedSubjects = new Set(
      summaryData
        .filter(
          (deck) =>
            deck?.Locked === true ||
            String(deck?.Locked || "")
              .trim()
              .toLowerCase() === "true",
        )
        .map((deck) => String(deck.Subject || "").trim())
        .filter(Boolean),
    );
    const savedSession = AppState.getStoredItem("saved_session");
    let parsedSavedSession = null;
    if (savedSession) {
      try {
        parsedSavedSession = JSON.parse(savedSession);
      } catch (error) {
        appLogger.warn(
          "Unable to inspect the saved session during deck cleanup; removing the malformed session.",
          error,
        );
        if (!AppState.removeStoredItem("saved_session")) {
          throw new Error("Unable to remove a malformed saved session.");
        }
      }
    }
    const unavailableSubjects = new Set(
      [
        ...(state.db || []).map((question) =>
          String(question?.Subject || "").trim(),
        ),
        ...(state.categorySummary || []).map((deck) =>
          String(deck?.Subject || "").trim(),
        ),
        ...(state.session?.questions || []).map((question) =>
          String(question?.Subject || "").trim(),
        ),
        ...(parsedSavedSession?.questions || []).map((question) =>
          String(question?.Subject || "").trim(),
        ),
        ...(state.prefs?.pendingDeckCachePurges || []).map((subject) =>
          String(subject || "").trim(),
        ),
      ].filter(
        (subject) =>
          subject &&
          (!availableSubjects.has(subject) || lockedSubjects.has(subject)),
      ),
    );
    if (unavailableSubjects.size === 0) return false;

    unavailableSubjects.forEach((subject) => {
      invalidateDeckFetch(subject);
      pendingDeckPayloadRefreshes.delete(subject);
    });
    state.prefs.pendingDeckCachePurges = [...unavailableSubjects];
    state.prefs.pendingDeckPayloadRefreshes = [...pendingDeckPayloadRefreshes];

    const currentSessionSubjects = new Set(
      (state.session?.questions || [])
        .map((question) => String(question?.Subject || "").trim())
        .filter(Boolean),
    );
    const revokedSession = Boolean(
      state.session?.active &&
      [...currentSessionSubjects].some((subject) =>
        unavailableSubjects.has(subject),
      ),
    );
    if (revokedSession) {
      const sessionContainsLockedDeck = [...currentSessionSubjects].some(
        (subject) => lockedSubjects.has(subject),
      );
      SessionCore.endSession(true);
      if (!SessionCore.clearSessionProgress()) {
        throw new Error(
          "Unable to clear the saved session for a deck that is no longer accessible.",
        );
      }
      state.session = {
        active: false,
        questions: [],
        currentIndex: 0,
        userAnswers: {},
        autoNextTimeout: null,
        revealedCloze: false,
      };
      await globalScope.navigate?.("dashboard");
      globalScope.showToast?.(
        sessionContainsLockedDeck
          ? "This password-protected deck is no longer authorized. Your active session has ended."
          : "This deck is no longer available. Your active session has ended.",
        "warning",
      );
    }

    state.categorySummary = (state.categorySummary || []).filter((deck) =>
      availableSubjects.has(String(deck?.Subject || "").trim()),
    );
    state.accessMetadata = buildAccessMetadataMap(state.categorySummary);
    if (
      !AppState.setStoredJSON(
        "summary",
        stripAccessMetadataFromSummary(state.categorySummary),
      )
    ) {
      throw new Error("Unable to persist the filtered local deck summary.");
    }

    if (
      !revokedSession &&
      (parsedSavedSession?.questions || []).some((question) =>
        unavailableSubjects.has(String(question?.Subject || "").trim()),
      ) &&
      !AppState.removeStoredItem("saved_session")
    ) {
      throw new Error(
        "Unable to remove a saved session containing a deck that is no longer accessible.",
      );
    }

    state.db = (state.db || []).filter((question) => {
      const subject = String(question?.Subject || "").trim();
      return availableSubjects.has(subject) && !lockedSubjects.has(subject);
    });
    rebuildQuestionIndex();
    invalidateCategoryProgressRenderSignature();
    try {
      await deckRepository.waitForWrites();
      state.db = (state.db || []).filter((question) => {
        const subject = String(question?.Subject || "").trim();
        return availableSubjects.has(subject) && !lockedSubjects.has(subject);
      });
      rebuildQuestionIndex();
      await Promise.all(
        [...unavailableSubjects].map((subject) => safeIdbDeleteDeck(subject)),
      );
    } catch (error) {
      appLogger.error(
        "Unable to remove unavailable deck data from local storage.",
        error,
      );
      throw error;
    }

    state.prefs.pendingDeckCachePurges = [];
    for (const subject of unavailableSubjects) {
      setLocalDeckVersion(subject, "");
    }
    if ((await saveState("prefs")) === false) {
      throw new Error("Unable to persist completion of local deck cleanup.");
    }
    return true;
  }

  function broadcastBackendSyncStatus(status = {}) {
    return syncCacheManager.broadcastBackendSyncStatus(status);
  }

  function applySummaryData(summaryData, knownChanged = null) {
    // CRITICAL FIX: Don't double-filter - backend already filters hidden decks
    // Only use the data as-is from the backend response
    const changed =
      knownChanged === null
        ? getSummarySignature(state.categorySummary || []) !==
          getSummarySignature(summaryData || [])
        : Boolean(knownChanged);
    const pendingSummaryToApply = pendingSummaryData;
    const applyingPendingSummary = Boolean(pendingSummaryToApply);

    if (!Array.isArray(summaryData)) {
      return false;
    }

    const downloadedSubjects = new Set(
      (state.db || [])
        .map((question) => String(question?.Subject || "").trim())
        .filter(Boolean),
    );
    const changedDownloadedSubjects = new Set(
      getChangedDownloadedDecks(
        state.categorySummary || [],
        summaryData,
        downloadedSubjects,
      ),
    );
    for (const subject of pendingDeckPayloadRefreshes) {
      const previousEntry = (state.categorySummary || []).find(
        (deck) => String(deck?.Subject || "").trim() === subject,
      );
      const nextEntry = summaryData.find(
        (deck) => String(deck?.Subject || "").trim() === subject,
      );
      if (
        !previousEntry ||
        !nextEntry ||
        String(previousEntry.PayloadVersion || "") !==
          String(nextEntry.PayloadVersion || "") ||
        Math.max(0, Number(previousEntry.QuestionCount) || 0) !==
          Math.max(0, Number(nextEntry.QuestionCount) || 0) ||
        Boolean(previousEntry.Locked) !== Boolean(nextEntry.Locked)
      ) {
        changedDownloadedSubjects.add(subject);
      }
    }
    changedDownloadedSubjects.forEach((subject) => {
      pendingDeckPayloadRefreshes.add(subject);
      invalidateDeckFetch(subject);
    });
    state.prefs.pendingDeckPayloadRefreshes = [...pendingDeckPayloadRefreshes];

    state.categorySummary = summaryData;
    syncConnected = true;
    invalidateCategoryProgressRenderSignature();
    persistDeckCacheTimestamp(Date.now());
    // FEATURE: Mark initial sync as complete after first successful sync
    if (!isInitialSyncComplete) {
      isInitialSyncComplete = true;
    }
    refreshReviewerSyncGate();
    const summaryStateSavePromise = Promise.resolve(saveState());
    summaryStateSavePromise.then(
      (saved) => {
        if (saved === false) {
          appLogger.error(
            applyingPendingSummary
              ? "Unable to persist the deferred database summary."
              : "Unable to persist the database summary.",
          );
          return;
        }
        if (
          !applyingPendingSummary ||
          pendingSummaryData !== pendingSummaryToApply
        ) {
          return;
        }
        pendingSummaryData = null;
        syncController?.confirmPendingSummaryApplied?.();
        updateSyncStatus(
          '<i class="fa-solid fa-check mr-1"></i> Database update applied after your session.',
          "success",
        );
      },
      (error) => {
        appLogger.error(
          applyingPendingSummary
            ? "Unable to persist the deferred database summary."
            : "Unable to persist the database summary.",
          error,
        );
      },
    );
    if (!hasActiveContentSession()) {
      populateFilters();
      renderCategoryProgress();
      Promise.resolve().then(() => refreshPendingDeckPayloads());
    }
    return changed;
  }

  function hasActiveContentSession() {
    return Boolean(state.session?.active || isReviewViewActive());
  }

  function isReviewViewActive() {
    return Boolean(
      typeof document !== "undefined" &&
      document.getElementById("view-deck-review")?.classList.contains("active"),
    );
  }

  function schedulePendingDeckPayloadRefresh(delayMs) {
    return pendingDeckPayloadRefreshes.schedule(delayMs);
  }

  async function refreshPendingDeckPayloads() {
    return pendingDeckPayloadRefreshes.refresh();
  }

  function scheduleSyncRetry(showOverlay = true) {
    return getSyncController().scheduleSyncRetry(showOverlay);
  }

  // ============================================
  // COLD START NOTIFICATION
  // ============================================
  function showColdStartNotification() {
    const overlay = document.getElementById("app-loading-overlay");
    if (!overlay) return;
    const titleEl = document.getElementById("app-loading-title");
    const detailEl = document.getElementById("app-loading-detail");
    const iconEl = document.getElementById("app-loading-icon");
    if (titleEl) titleEl.textContent = "Cold Start Detected";
    if (detailEl)
      detailEl.textContent =
        "The database is being rebuilt. The app will retry automatically...";
    if (iconEl)
      iconEl.className =
        "text-3xl fa-solid fa-exclamation-triangle text-yellow-300";
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  }

  // ============================================
  // LIGHTWEIGHT SYNC STATUS CHECK
  // ============================================
  async function checkSyncStatusLightweight() {
    return getSyncController().checkSyncStatusLightweight();
  }

  // ============================================
  // ENHANCED SYNC DATABASE WITH ALL FIXES
  // ============================================
  function getSummarySyncDecision(summaryData, wasConnected) {
    const changed =
      getSummarySignature(state.categorySummary || []) !==
      getSummarySignature(summaryData);
    const canApplyNow =
      state.prefs.databaseUpdateMode === "immediate" || !state.session.active;

    return {
      changed,
      canApplyNow,
      shouldApply: canApplyNow && (changed || !wasConnected),
      shouldQueue: !canApplyNow && changed,
    };
  }

  /**
   * Synchronize the summary cache while preserving active-session state.
   * @param {boolean} [isRetry]
   * @param {boolean} [isBackgroundCheck]
   * @returns {Promise<boolean>}
   */
  async function syncDatabase(
    isRetry = false,
    isBackgroundCheck = false,
    expectedSyncTimestamp = "",
    prefetchedSnapshot = null,
  ) {
    const bootstrapStatus =
      typeof window !== "undefined" ? window.__MRH_BOOTSTRAP__?.status : null;

    if (bootstrapStatus === "failed") {
      throw new Error("App bootstrap failed; database sync is unavailable.");
    }

    if (bootstrapStatus !== "ready" && !__mrhAppReady) {
      appLogger.debug(
        "Skipping syncDatabase until app bootstrap has reached ready state.",
      );
      return false;
    }

    return getSyncController().syncDatabase(
      isRetry,
      isBackgroundCheck,
      expectedSyncTimestamp,
      prefetchedSnapshot,
    );
  }

  function enterFolder(folderName, isLockedFolder, expectedParentPath) {
    return DeckNavCore.enterFolder(
      folderName,
      isLockedFolder,
      expectedParentPath,
    );
  }

  function goToPath(index) {
    return DeckNavCore.goToPath(index);
  }

  function closeAllDropdownMenus(exceptElement = null) {
    if (
      typeof ModalCore === "undefined" ||
      typeof ModalCore.closeAllDropdownMenus !== "function"
    ) {
      return false;
    }
    return ModalCore.closeAllDropdownMenus(exceptElement);
  }

  function initDetailsExclusivity() {
    if (
      typeof ModalCore === "undefined" ||
      typeof ModalCore.initDetailsExclusivity !== "function"
    ) {
      return false;
    }
    return ModalCore.initDetailsExclusivity();
  }

  let categoryProgressRenderScheduled = false;
  let categoryProgressRenderInFlight = false;
  let categoryProgressRenderQueued = false;
  let categoryProgressLastRenderSignature = "";
  let categoryHierarchyCache = null;
  let categoryHierarchyFolderStatsCache = null;
  let categoryHierarchyNodeMetadataCache = null;

  function invalidateCategoryProgressRenderSignature() {
    globalScope.invalidateCategoryProgressSignatureCache?.();
    categoryProgressLastRenderSignature = "";
  }

  function renderCategoryProgress() {
    if (
      typeof window !== "undefined" &&
      window.__MRH_BOOTSTRAP__?.status !== "ready" &&
      !__mrhAppReady
    ) {
      return;
    }

    if (categoryProgressRenderQueued) return;
    categoryProgressRenderQueued = true;

    const render = () => {
      categoryProgressRenderQueued = false;
      renderCategoryProgressNow();
    };

    if (typeof requestAnimationFrame === "function") {
      scheduleAppAnimationFrame(render);
    } else {
      lifecycle.setTimeout(render, 0);
    }
  }

  function renderCategoryProgressNow({ allowInactive = false } = {}) {
    if (!document.body) {
      if (!categoryProgressRenderScheduled) {
        categoryProgressRenderScheduled = true;
        scheduleAppAnimationFrame(() => {
          categoryProgressRenderScheduled = false;
          if (document.body && typeof renderCategoryProgress === "function") {
            renderCategoryProgress();
          }
        });
      }
      return;
    }

    const dashboardView = document.getElementById("view-dashboard");
    if (
      !allowInactive &&
      dashboardView &&
      !dashboardView.classList.contains("active")
    ) {
      categoryProgressRenderQueued = false;
      return;
    }

    const renderSignature = getCategoryProgressRenderSignature({
      currentAppMode,
      isInitialSyncComplete,
    });
    if (renderSignature === categoryProgressLastRenderSignature) {
      categoryProgressRenderQueued = false;
      return;
    }

    if (categoryProgressRenderInFlight) {
      if (!categoryProgressRenderScheduled) {
        categoryProgressRenderScheduled = true;
        scheduleAppAnimationFrame(() => {
          categoryProgressRenderScheduled = false;
          if (document.body && typeof renderCategoryProgress === "function") {
            renderCategoryProgress();
          }
        });
      }
      return;
    }

    categoryProgressRenderInFlight = true;

    try {
      const dashboardControls = dashboardView || document;
      syncDashboardControls(dashboardControls);

      const container = document.getElementById("category-list");
      const completedSet = new Set(state.stats?.completedQs || []);
      const mistakesSet = new Set(state.stats?.mistakes || []);
      const subjectIdsBySubject = ensureQuestionIndex().bySubject;
      const deckHasExplanations = (deckData) =>
        Object.prototype.hasOwnProperty.call(deckData || {}, "e") ||
        deckData?.HasExplanations === true;
      const folderExplanationAvailabilityCache = new WeakMap();
      function getFolderExplanationStatus(node) {
        if (!node || typeof node !== "object") {
          return { hasDecks: false, allHaveExplanations: true };
        }
        if (folderExplanationAvailabilityCache.has(node)) {
          return folderExplanationAvailabilityCache.get(node);
        }

        const status = { hasDecks: false, allHaveExplanations: true };
        if (node._data && node._data.IsFolder !== true) {
          status.hasDecks = true;
          status.allHaveExplanations = deckHasExplanations(node._data);
        }

        Object.values(node._children || {}).forEach((child) => {
          const childStatus = getFolderExplanationStatus(child);
          if (!childStatus.hasDecks) return;
          status.hasDecks = true;
          status.allHaveExplanations =
            status.allHaveExplanations && childStatus.allHaveExplanations;
        });

        folderExplanationAvailabilityCache.set(node, status);
        return status;
      }
      function folderHasOnlyExplainedDecks(node) {
        const status = getFolderExplanationStatus(node);
        return status.hasDecks && status.allHaveExplanations;
      }
      const downloadedSubjects = new Set(
        (state.db || []).map((question) => question?.Subject).filter(Boolean),
      );
      const databaseUnavailable = !localDatabaseReady || !isInitialSyncComplete;
      const getStudyDeckProgress = (subject, total) => {
        const safeTotal = Math.max(0, Number(total) || 0);
        const progress = state.prefs?.studyProgress?.[subject];
        if (safeTotal === 0 || !progress) {
          return { current: 0, total: safeTotal, percent: 0 };
        }

        let current = 0;
        const layout =
          rootScope.getDeckSessionSetting?.("study", "studyLayout", subject) ||
          state.prefs.studyLayout ||
          "scroll";
        const pageSize =
          rootScope.getDeckSessionSetting?.(
            "study",
            "studyPageSize",
            subject,
          ) ||
          state.prefs.studyPageSize ||
          10;
        const hasQuestionPosition =
          Boolean(progress.questionId) || Number(progress.index) > 0;
        if (layout === "single") {
          current = Number(progress.index || 0) + 1;
        } else if (pageSize === "All") {
          current = hasQuestionPosition
            ? Number(progress.index || 0) + 1
            : Math.floor(Math.max(0, Number(progress.scrollY) || 0) / 420);
        } else if (hasQuestionPosition) {
          current = Number(progress.index) + 1;
        } else {
          current = Math.max(0, (Number(progress.page || 1) - 1) * pageSize);
        }

        current = Math.min(safeTotal, Math.max(0, current));
        return {
          current,
          total: safeTotal,
          percent: safeTotal > 0 ? (current / safeTotal) * 100 : 0,
        };
      };
      const visibleSummary = getVisibleCategorySummary();
      const visibleSummarySignature = getSummarySignature(visibleSummary);
      const visibleSubjectSignature = getSubjectListSignature(visibleSummary);
      let categoryHierarchy;
      if (
        categoryHierarchyCache &&
        categoryHierarchyCache.summarySignature === visibleSummarySignature
      ) {
        categoryHierarchy = categoryHierarchyCache.hierarchy;
      } else {
        categoryHierarchy = buildCategoryHierarchy(visibleSummary);
        categoryHierarchyCache = {
          summarySignature: visibleSummarySignature,
          subjectSignature: visibleSubjectSignature,
          hierarchy: categoryHierarchy,
        };
        // Hierarchy nodes are stable until the structure is rebuilt. Keep
        // metadata cached instead of recalculating folder totals on each render.
        categoryHierarchyFolderStatsCache = new WeakMap();
        categoryHierarchyNodeMetadataCache = new WeakMap();
      }

      if (!Array.isArray(state.currentPath)) state.currentPath = [];
      let currentNode = categoryHierarchy;
      let pathValid = true;

      for (let i = 0; i < state.currentPath.length; i++) {
        const dir = state.currentPath[i];
        const nextNode = currentNode[dir];
        const isFolder =
          nextNode &&
          (Object.keys(nextNode._children || {}).length > 0 ||
            Boolean(nextNode._data?.IsFolder));
        if (isFolder) {
          currentNode = nextNode._children;
        } else if (
          nextNode &&
          nextNode._data &&
          !nextNode._data.IsFolder &&
          i === state.currentPath.length - 1
        ) {
          state.currentPath = state.currentPath.slice(0, i);
          globalScope.persistNavigationPath?.(state.currentPath);
          break;
        } else {
          pathValid = false;
          break;
        }
      }

      if (!pathValid && isInitialSyncComplete) {
        showDeckNotFound(state.currentPath);
        state.currentPath = [];
        globalScope.persistNavigationPath(state.currentPath);
        currentNode = categoryHierarchy;
      } else if (pathValid) {
        dismissDeckNotFound();
      }

      const folderStatsCache =
        categoryHierarchyFolderStatsCache || new WeakMap();
      const nodeMetadataCache =
        categoryHierarchyNodeMetadataCache || new WeakMap();
      categoryHierarchyFolderStatsCache = folderStatsCache;
      categoryHierarchyNodeMetadataCache = nodeMetadataCache;

      const freshnessBannerHtml = getDeckDataFreshnessBannerHtml();
      let html = `
      <div data-deck-breadcrumb class="deck-breadcrumb-nav flex flex-nowrap items-center gap-2 text-sm overflow-x-auto">
        <button ${delegatedActionAttributes("goToPath", [-1])} aria-label="Home" title="Home" class="deck-breadcrumb-home">
          HOME
        </button>
        ${state.currentPath
          .map(
            (dir, i) => `
              <i class="fa-solid fa-chevron-right text-xs text-gray-400 flex-shrink-0"></i>
              <button ${delegatedActionAttributes("goToPath", [i])} class="whitespace-nowrap flex-shrink-0">${escapeHTML(dir.toUpperCase())}</button>
            `,
          )
          .join("")}
      </div>
      <div class="deck-controls-row flex justify-between items-center">
        <div class="deck-section-heading text-sm font-bold text-gray-500 dark:text-gray-400"></div>
        <div class="dashboard-controls flex-shrink-0">
          <!-- Deck Source Filter -->
          <details id="deck-source-menu" data-deck-control="source-menu" class="relative">
            <summary
              id="deck-source-trigger"
              class="dashboard-control flex items-center gap-1.5 rounded-lg transition-colors text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 outline-none cursor-pointer list-none"
              aria-label="Filter source"
            >
              <span id="deck-source-label">All</span>
              <i class="fa-solid fa-chevron-down text-[9px] ml-0.5"></i>
            </summary>
            <div
              class="absolute right-0 mt-2 w-44 z-40 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1.5 shadow-xl"
            >
              <button
                type="button"
                data-source-value="all"
                data-action="changeDeckSource"
                data-action-args='["all"]'
                class="deck-source-option"
              >
                All <i class="fa-solid fa-check source-check"></i>
              </button>
              <button
                type="button"
                data-source-value="favorites"
                data-action="changeDeckSource"
                data-action-args='["favorites"]'
                class="deck-source-option"
              >
                Favorites <i class="fa-solid fa-check source-check"></i>
              </button>
              <button
                type="button"
                data-source-value="archived"
                data-action="changeDeckSource"
                data-action-args='["archived"]'
                class="deck-source-option"
              >
                Archived <i class="fa-solid fa-check source-check"></i>
              </button>
            </div>
          </details>
          <select
            id="deck-source-filter"
            aria-label="Deck source filter"
            class="hidden"
          ></select>

          <details id="deck-sort-menu" data-deck-control="sort-menu" class="relative">
            <summary
              id="deck-sort-trigger"
              class="dashboard-control flex items-center gap-1.5 rounded-lg transition-colors text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 outline-none cursor-pointer list-none"
              aria-label="Sort decks"
            >
              <i id="deck-sort-icon" class="fa-solid fa-arrow-up"></i>
              <span>Sort</span>
              <i class="fa-solid fa-chevron-down text-[9px] ml-0.5"></i>
            </summary>
            <div
              class="absolute right-0 mt-2 w-44 z-40 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1.5 shadow-xl"
            >
              <p
                class="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400"
              >
                Sort by
              </p>
              <button
                type="button"
                data-sort-value="letters"
                data-action="changeDeckSort"
                data-action-args='["letters"]'
                class="deck-sort-option"
              >
                Name <i class="fa-solid fa-check sort-check"></i>
              </button>
              <button
                type="button"
                data-sort-value="questions"
                data-action="changeDeckSort"
                data-action-args='["questions"]'
                class="deck-sort-option"
              >
                Question Count <i class="fa-solid fa-check sort-check"></i>
              </button>
              <div
                class="my-1 border-t border-gray-200 dark:border-gray-700"
              ></div>
              <p
                class="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400"
              >
                Order
              </p>
              <button
                type="button"
                data-sort-direction="asc"
                data-action="setDeckSortDirection"
                data-action-args='["asc"]'
                class="deck-sort-option"
              >
                Ascending
                <i class="fa-solid fa-check sort-direction-check"></i>
              </button>
              <button
                type="button"
                data-sort-direction="desc"
                data-action="setDeckSortDirection"
                data-action-args='["desc"]'
                class="deck-sort-option"
              >
                Descending
                <i class="fa-solid fa-check sort-direction-check"></i>
              </button>
            </div>
          </details>

          <!-- Study/Quiz Mode Toggle -->
          <label
            class="dashboard-control flex items-center justify-center cursor-pointer rounded-lg"
          >
            <span
              id="modeLabel"
              class="mr-2 w-12 sm:w-14 shrink-0 text-center text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide"
              >Quiz</span
            >
            <div class="relative flex items-center">
              <input
                type="checkbox"
                id="globalModeToggle"
                class="peer sr-only"
                data-action="toggleAppMode"
                data-action-event="change"
              />

              <!-- Track -->
              <div
                class="block bg-blue-500 peer-checked:bg-purple-600 w-7 sm:w-8 h-4 rounded-full"
              ></div>

              <!-- Dot -->
              <div
                class="dot absolute left-0.5 bg-white w-3 h-3 rounded-full peer-checked:translate-x-3.5 shadow-sm"
              ></div>
            </div>
          </label>
        </div>
      </div>
      ${freshnessBannerHtml}`;

      html += `<div data-deck-list-layout class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">`;
      const sortBy = state.prefs.deckSortBy || "letters";
      const sortDirection = state.prefs.deckSortDirection === "desc" ? -1 : 1;
      const popularDeckPaths = new Set(
        [
          "BSMT 3.1 - ALPHA (Finals)",
          "Mock Exams",
          "GENERAL KNOWLEDGE",
          "BSMT COMPETENCIES",
          "REVIEW NOTES FOR DECK OFFICERS (BOOK)",
        ].map((path) => path.toLocaleLowerCase()),
      );
      const isPopularDeckPath = (path) =>
        popularDeckPaths.has(
          String(path || "")
            .split("::")
            .pop()
            .trim()
            .toLocaleLowerCase(),
        );
      const pinnedDecks = new Set(
        Array.isArray(state.prefs.pinnedDecks)
          ? state.prefs.pinnedDecks.filter((entry) => typeof entry === "string")
          : [],
      );
      const getPinnedSortKey = (key) => {
        const fullKey =
          state.currentPath && state.currentPath.length > 0
            ? [...state.currentPath, key].join("::")
            : key;
        return fullKey;
      };
      const isLockedListingEntry = (entry, path) =>
        Boolean(entry.node?._data?.Locked) ||
        isDeckLocked([...path, entry.key].join("::"));
      const keys = Object.keys(currentNode)
        .map((key) => {
          const node = currentNode[key];
          const metadata = getNodeMetadata(
            node,
            nodeMetadataCache,
            folderStatsCache,
          );
          return { key, metadata, node };
        })
        .sort((leftEntry, rightEntry) => {
          const leftLocked = isLockedListingEntry(
            leftEntry,
            state.currentPath || [],
          );
          const rightLocked = isLockedListingEntry(
            rightEntry,
            state.currentPath || [],
          );
          if (leftLocked !== rightLocked) {
            return leftLocked ? 1 : -1;
          }

          const leftKey = getPinnedSortKey(leftEntry.key);
          const rightKey = getPinnedSortKey(rightEntry.key);

          const leftPinned =
            leftEntry.metadata.isFolder && pinnedDecks.has(leftKey);
          const rightPinned =
            rightEntry.metadata.isFolder && pinnedDecks.has(rightKey);

          if (leftPinned !== rightPinned) {
            return leftPinned ? -1 : 1;
          }

          const left = leftEntry.key;
          const right = rightEntry.key;

          if (sortBy === "questions") {
            const leftCount = leftEntry.metadata.totalCards;
            const rightCount = rightEntry.metadata.totalCards;
            return (
              (leftCount - rightCount) * sortDirection ||
              TextUtils.naturalSortStrings(left, right) * sortDirection
            );
          }

          return TextUtils.naturalSortStrings(left, right) * sortDirection;
        })
        .map((entry) => entry.key);

      const sourceFilter = state.prefs.deckSourceFilter || "all";
      const archivedDecks = Array.isArray(state.prefs?.archivedDecks)
        ? state.prefs.archivedDecks
        : [];
      const archiveScopePath = (state.currentPath || []).join("::");
      const expandedArchivedPaths = Array.isArray(
        state.prefs?.expandedArchivedPaths,
      )
        ? state.prefs.expandedArchivedPaths
        : [];
      const showArchivedDecks =
        expandedArchivedPaths.includes(archiveScopePath);
      const favoriteDecks = Array.isArray(state.prefs.favoriteDecks)
        ? state.prefs.favoriteDecks
        : [];
      const favoriteMatchCache = new WeakMap();

      function matchesFavoriteDeck(node, currentKey) {
        const subject = node?._data?.Subject || "";
        const folderKey = String(currentKey || "").trim();
        const childKeys = Object.keys(node?._children || {});
        const cachedMatches = favoriteMatchCache.get(node);
        if (cachedMatches?.has(folderKey)) {
          return cachedMatches.get(folderKey);
        }

        const matchesNode = favoriteDecks.some((entry) => {
          const favoriteText = String(entry || "").trim();
          if (!favoriteText) return false;
          if (favoriteText === subject) return true;
          if (folderKey && favoriteText === folderKey) return true;
          return (
            subject.startsWith(favoriteText + "::") ||
            subject.startsWith(favoriteText + "/")
          );
        });
        if (matchesNode) {
          const matches = true;
          if (!cachedMatches) favoriteMatchCache.set(node, new Map());
          (favoriteMatchCache.get(node) || cachedMatches).set(
            folderKey,
            matches,
          );
          return matches;
        }

        const matches = childKeys.some((childKey) =>
          matchesFavoriteDeck(node._children[childKey], childKey),
        );
        if (!cachedMatches) favoriteMatchCache.set(node, new Map());
        (favoriteMatchCache.get(node) || cachedMatches).set(folderKey, matches);
        return matches;
      }

      function nodeMatchesFilter(
        node,
        filter,
        currentKey = null,
        parentPath = state.currentPath || [],
      ) {
        const nodePathSegments = [...parentPath, currentKey].filter(Boolean);
        const nodePath = nodePathSegments.join("::");
        const subjectPath = String(node?._data?.Subject || nodePath);
        const isArchived = archivedDecks.some((entry) => {
          const archivedPath = String(entry || "");
          return (
            archivedPath &&
            [nodePath, subjectPath].some(
              (path) =>
                path === archivedPath ||
                path.startsWith(`${archivedPath}::`),
            )
          );
        });
        const hasArchivedDescendant =
          Boolean(nodePath) &&
          archivedDecks.some((entry) =>
            String(entry || "").startsWith(`${nodePath}::`),
          );

        if (filter === "archived") {
          return isArchived || hasArchivedDescendant;
        }
        if (isArchived && !showArchivedDecks) return false;

        const childKeys = Object.keys(node._children || {});
        if (filter === "all" && !isArchived && hasArchivedDescendant) {
          return true;
        }

        if (filter === "all") return true;
        if (filter === "favorites") {
          if (matchesFavoriteDeck(node, currentKey)) return true;
          const childKeys = Object.keys(node._children || {});
          return childKeys.some((childKey) =>
            nodeMatchesFilter(
              node._children[childKey],
              filter,
              childKey,
              nodePathSegments,
            ),
          );
        }

        if (
          node._data !== null &&
          node._data !== undefined &&
          !node._data.IsFolder
        ) {
          const isDownloaded = downloadedSubjects.has(node._data.Subject);
          if (filter === "downloaded") return isDownloaded;
          if (filter === "cloud") return !isDownloaded;
        }

        if (childKeys.length > 0) {
          return childKeys.some((childKey) =>
            nodeMatchesFilter(
              node._children[childKey],
              filter,
              childKey,
              nodePathSegments,
            ),
          );
        }

        return false;
      }

      let visibleKeys = keys.filter((key) => {
        const item = currentNode[key];
        if (
          item._data &&
          !item._data.IsFolder &&
          Number(item._data.QuestionCount || 0) === 0
        ) {
          return false;
        }
        return nodeMatchesFilter(currentNode[key], sourceFilter, key);
      });

      function getDeckTypeBadgeLabel(deckData) {
        const rawType = String(deckData?.QuestionType ?? "")
          .trim()
          .toUpperCase();
        if (!rawType) return "";

        if (rawType === "ID") return "Identification";
        if (rawType === "MCQ" || rawType === "MC") return "Multiple Choices";
        if (
          rawType === "MX" ||
          rawType === "MIXED" ||
          rawType === "MCQ/ID" ||
          rawType === "ID/MCQ"
        ) {
          return "Mixed";
        }

        return "";
      }

      function renderDeckBadge(label, icon = "") {
        const normalizedLabel = String(label || "").trim();
        if (!normalizedLabel) return "";

        const toneNames = {
          identification: "identification",
          "multiple choices": "multiple-choices",
          mixed: "mixed",
          popular: "popular",
          explanations: "explanations",
        };
        const tone = toneNames[normalizedLabel.toLowerCase()] || "other";
        const defaultIcons = {
          identification: "fa-pen-to-square",
          "multiple choices": "fa-list-check",
          mixed: "fa-shuffle",
          popular: "fa-fire",
          explanations: "fa-lightbulb",
        };
        const iconClass =
          icon || defaultIcons[normalizedLabel.toLowerCase()] || "";
        const iconHtml = iconClass
          ? `<i class="deck-label-icon deck-label-icon-${tone} fa-solid ${iconClass}" aria-hidden="true"></i>`
          : "";

        const compactLabel =
          normalizedLabel.toLowerCase() === "multiple choices"
            ? '<span class="deck-label-compact-text" aria-hidden="true">MCQ</span>'
            : normalizedLabel.toLowerCase() === "identification"
              ? '<span class="deck-label-compact-text" aria-hidden="true">IDENT</span>'
              : "";
        return `<span class="deck-label-badge deck-label-${tone}" title="${escapeHTML(normalizedLabel)}" role="img" aria-label="${escapeHTML(normalizedLabel)}">${iconHtml}<span class="deck-label-text">${escapeHTML(normalizedLabel)}</span>${compactLabel}</span>`;
      }

      function getFolderDeckTypeBadgeLabel(folderNode) {
        const directBadge = getDeckTypeBadgeLabel(folderNode?._data);
        if (directBadge) return directBadge;

        const badges = new Set();
        const collectChildBadges = (node) => {
          if (!node) return;
          const childBadge = getDeckTypeBadgeLabel(node._data);
          if (childBadge) badges.add(childBadge);
          Object.values(node._children || {}).forEach(collectChildBadges);
        };
        Object.values(folderNode?._children || {}).forEach(collectChildBadges);

        if (badges.size === 1) return [...badges][0];
        return badges.size > 1 ? "Mixed" : "";
      }

      function generateCardHTML(cat, displayName) {
        const subj = cat.Subject;
        const safeSubj = escapeHTML(subj);
        const isLocked = isDeckLocked(subj) || Boolean(cat?.Locked);
        const displayTitle = isLocked
          ? TextUtils.scrambleWords(displayName)
          : displayName;
        const safeName = escapeHTML(displayTitle);
        const loaderId = getDeckLoaderId(subj);
        const deckTypeBadge = getDeckTypeBadgeLabel(cat);
        const explanationsAvailableBadge = deckHasExplanations(cat)
          ? renderDeckBadge("Explanations", "fa-lightbulb")
          : "";
        const popularBadge = isPopularDeckPath(subj)
          ? renderDeckBadge("Popular", "fa-fire")
          : "";
        const deckCardLabels = [
          popularBadge,
          deckTypeBadge ? renderDeckBadge(deckTypeBadge) : "",
          explanationsAvailableBadge,
        ]
          .filter(Boolean)
          .join("");
        const deckNameMode =
          state.prefs.deckNameMode === "clip"
            ? "truncate"
            : "whitespace-normal";
        const deckTitleModeClass =
          state.prefs.deckNameMode === "clip" ? "deck-card-title-clip" : "";
        const totalQuestionsInDb = cat.QuestionCount;

        const isRoot = !state.currentPath || state.currentPath.length === 0;

        const data = state.stats.subjectAccuracy[subj] || {
          total: 0,
          correct: 0,
        };
        const progressStats = getSubjectProgressStats(
          subj,
          subjectIdsBySubject,
          completedSet,
          mistakesSet,
        );
        const isReview = currentAppMode === "review";
        const isQuiz = currentAppMode === "quiz";
        const completedCount = progressStats.completedCount;
        const mistakesCount = progressStats.mistakesCount;
        const hasQuizProgress = completedCount > 0 || mistakesCount > 0;
        const cardCountLabel = isQuiz
          ? `${completedCount} / ${totalQuestionsInDb} cards`
          : `${totalQuestionsInDb} cards`;
        const quizProgressPercent =
          totalQuestionsInDb > 0
            ? Math.min(100, (completedCount / totalQuestionsInDb) * 100)
            : 0;
        const isCompleted = progressStats.isCompleted;
        const cardClasses = isCompleted
          ? "bg-green-50 dark:bg-green-900/30 border-green-300"
          : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700";
        const unfinishedBadge =
          mistakesCount > 0
            ? '<i class="fa-solid fa-file-circle-xmark text-white mr-2 flex-shrink-0" title="Unfinished"></i>'
            : "";
        const isRecentlyViewed = getRecentPathDepth(subj) > 0;
        const recentViewedBadge = isRecentlyViewed
          ? '<i class="fa-regular fa-clock text-base text-amber-500 mr-0.5 flex-shrink-0" title="Recently Viewed"></i>'
          : "";
        const primaryActionText = isReview
          ? "Review"
          : completedCount === 0
            ? "Quiz"
            : "Continue";
        const primaryActionIcon = isReview ? "fa-eye" : "fa-play";
        const primaryActionColor = isReview
          ? "bg-purple-600 hover:bg-purple-700"
          : "bg-brand-600 hover:bg-brand-700";
        const themeColorText = isReview
          ? "text-purple-600 dark:text-purple-400"
          : "text-brand-600 dark:text-brand-400";
        const themeShadowHover = isReview
          ? "hover:shadow-purple-500/10"
          : "hover:shadow-brand-500/10";
        const loaderColor = isReview ? "text-purple-500" : "text-brand-500";
        const isDeckInteractionBusy =
          (deckInteractionLocked && subj !== activeDeckInteractionSubject) ||
          databaseUnavailable;
        const syncLockClass = databaseUnavailable ? "deck-sync-locked" : "";
        const isDeckLoading =
          deckInteractionLocked && subj === activeDeckInteractionSubject;

        let statsHTML = "";
        let countBadgeHTML = "";
        let resetBtnHTML = "";

        countBadgeHTML = `
          <div class="flex items-center gap-1.5 flex-shrink-0 pt-1">
            <span class="text-sm font-black ${themeColorText} transition-colors">${cardCountLabel}</span>
          </div>`;

        if (!isReview) {
          if (completedCount > 0 || mistakesCount > 0) {
            resetBtnHTML = `
            <button ${databaseUnavailable ? "disabled" : ""} data-reset-subject="${escapeHTML(subj)}" ${delegatedActionAttributes("resetCategory", [encodeHandlerValue(subj)], { stopPropagation: true })} class="reset-deck-btn w-10 sm:w-12 shrink-0 bg-red-600 text-white dark:bg-red-600 py-2 px-1 rounded-lg font-bold hover:bg-red-700 dark:hover:bg-red-700 active:scale-90 transition-all duration-300 text-xs sm:text-sm border border-red-600 dark:border-red-600 flex items-center justify-center" title="Reset Progress">
              <i class="fa-solid fa-rotate-left"></i>
            </button>`;
          }
        }

        return `
        <div data-deck-key="${escapeHTML(subj)}" ${delegatedActionAttributes("handleDeckClick", [encodeHandlerValue(subj)])} class="deck-card deck-card-container ${isDeckInteractionBusy ? "deck-interaction-blocked" : "cursor-pointer"} ${syncLockClass} ${isLocked ? "password-protected-deck" : ""} ${cardClasses} p-5 rounded-xl shadow-sm hover:shadow-lg ${themeShadowHover} border relative w-full flex flex-col" aria-busy="${isDeckInteractionBusy || isDeckLoading}">
          <div id="${loaderId}" data-deck-loader class="hidden absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-10 rounded-xl flex-col items-center justify-center transition-opacity">
            <i class="fa-solid fa-spinner fa-spin text-3xl ${loaderColor} mb-2"></i>
            <span class="text-sm font-bold text-gray-700 dark:text-gray-200">Loading...</span>
          </div>
          <div class="mb-4">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <h3 class="deck-card-title font-bold text-lg text-gray-800 dark:text-gray-100 flex items-center transition-colors min-w-0 gap-1" title="${safeName}">
                  ${recentViewedBadge}
                  ${unfinishedBadge}
                  <span class="deck-card-title-text ${deckTitleModeClass} ${deckNameMode} break-words">${escapeHTML(displayTitle)}</span>
                </h3>
                ${statsHTML}
              </div>
              <div class="flex items-center gap-1.5">
                ${countBadgeHTML}
              </div>
            </div>
          </div>
          ${
            isQuiz && hasQuizProgress
              ? `<div class="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700" role="progressbar" aria-label="Quiz progress for ${safeName}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(quizProgressPercent)}">
                  <div class="h-full rounded-full bg-brand-500 transition-all duration-300" style="width: ${quizProgressPercent}%"></div>
                </div>`
              : ""
          }

          <div class="deck-card-action-group">
            ${deckCardLabels ? `<div class="deck-card-action-labels"><div class="deck-card-labels">${deckCardLabels}</div></div>` : ""}
            <div class="flex gap-2 w-full" data-action-stop-propagation="true">
            <button ${databaseUnavailable ? "disabled" : ""} ${delegatedActionAttributes("handleDeckClick", [encodeHandlerValue(subj)], { stopPropagation: true })} class="flex-1 ${primaryActionColor} text-white py-2 px-2 rounded-lg font-bold active:scale-95 text-xs sm:text-sm shadow-sm hover:shadow transition-all duration-300 flex items-center justify-center group truncate" title="${primaryActionText}">
              <i class="fa-solid ${primaryActionIcon} mr-1 sm:mr-2 group-hover:scale-125 transition-transform flex-shrink-0"></i>
              <span class="truncate">${primaryActionText}</span>
            </button>

            ${
              !isReview && mistakesCount > 0
                ? `
                  <button ${databaseUnavailable ? "disabled" : ""} ${delegatedActionAttributes("handleDeckClick", [encodeHandlerValue(subj), "mistakes"], { stopPropagation: true })} class="flex-1 bg-yellow-500 text-white py-2 px-2 rounded-lg font-bold hover:bg-yellow-600 active:scale-95 text-xs sm:text-sm shadow-sm hover:shadow transition-all duration-300 flex items-center justify-center group truncate" title="Review Mistakes">
                    <i class="fa-solid fa-triangle-exclamation mr-1 sm:mr-2 group-hover:scale-125 transition-transform flex-shrink-0"></i>
                    <span class="truncate">Review (${mistakesCount})</span>
                  </button>
                `
                : ""
            }

            ${resetBtnHTML}
            </div>
          </div>
        </div>
      `;
      }

      {
        const folderKeys = [];
        const deckKeys = [];
        visibleKeys.forEach((key) => {
          const item = currentNode[key];
          const isFolder =
            Object.keys(item._children).length > 0 ||
            (item._data !== null && item._data.IsFolder === true);
          (isFolder ? folderKeys : deckKeys).push(key);
        });

        if (visibleKeys.length === 0) {
          html += `<div data-deck-empty class="col-span-full text-center py-10 text-gray-500 dark:text-gray-400 rounded-xl border border-gray-100 dark:border-gray-700">No decks match your filter.</div>`;
        }

        // Render Folders section
        if (folderKeys.length > 0) {
          // Add section header with data attribute for syncing to controls row (hidden in grid, shown in controls row)
          html += `<h3 data-deck-section="folders" class="col-span-full mt-2 mb-2 text-sm font-bold text-gray-500 dark:text-gray-400 hidden-in-grid">Folders (${folderKeys.length})</h3>`;
          folderKeys.forEach((key) => {
            const item = currentNode[key];
            const hasChildren = Object.keys(item._children).length > 0;
            const hasData = item._data !== null;
            const isExplicitFolder = hasData && item._data.IsFolder === true;

            const totalCards = getFolderStats(item, folderStatsCache);
            const isReview = currentAppMode === "review";
            const isRecentlyViewedFolder =
              getRecentPathDepth(
                (state.currentPath || []).concat(key).join("::"),
              ) > 0;
            const folderColorClass = isReview
              ? "bg-purple-500 dark:bg-purple-700 group-hover:bg-purple-600 dark:group-hover:bg-purple-600"
              : "bg-brand-500 dark:bg-brand-700 group-hover:bg-brand-600 dark:group-hover:bg-brand-600";
            const folderTextHover = isReview
              ? "group-hover:text-purple-600 dark:group-hover:text-purple-400"
              : "group-hover:text-brand-600 dark:group-hover:text-brand-400";

            const folderSubject =
              (state.currentPath || []).concat(key).join("::") || key;
            const deckTypeBadge = getFolderDeckTypeBadgeLabel(item);
            const explanationsAvailableBadge = folderHasOnlyExplainedDecks(item)
              ? renderDeckBadge("Explanations", "fa-lightbulb")
              : "";
            const folderCardLabels = [
              deckTypeBadge ? renderDeckBadge(deckTypeBadge) : "",
              explanationsAvailableBadge,
            ]
              .filter(Boolean)
              .join("");
            const isLocked =
              isDeckLocked(folderSubject) || Boolean(item?._data?.Locked);

            const isRoot = !state.currentPath || state.currentPath.length === 0;
            let pinBtnHtml = "";
            let archiveBtnHtml = "";
            let favoriteBtnHtml = "";
            const isArchived = (state.prefs?.archivedDecks || []).includes(
              folderSubject,
            );
            const isFavorite = (state.prefs?.favoriteDecks || []).includes(
              folderSubject,
            );
            const isPinned = (state.prefs?.pinnedDecks || []).includes(
              folderSubject,
            );
            const folderDisplayName = isLocked
              ? TextUtils.scrambleWords(key)
              : key;
            pinBtnHtml = `
            <button ${delegatedActionAttributes("togglePinDeck", [encodeHandlerValue(folderSubject)], { stopPropagation: true })}
              class="deck-icon-action deck-icon-action-pin ${isPinned ? "is-active" : ""}"
              aria-label="${isPinned ? "Unpin Folder" : "Pin Folder"}"
              title="${isPinned ? "Unpin Folder" : "Pin Folder"}">
              <i class="fa-solid fa-thumbtack text-lg" style="${isPinned ? "" : "transform: rotate(45deg); display: inline-block;"}"></i>
            </button>
          `;
            archiveBtnHtml = `
            <button ${delegatedActionAttributes("toggleArchiveDeck", [encodeHandlerValue(folderSubject)], { stopPropagation: true })}
              class="deck-icon-action deck-icon-action-archive ${isArchived ? "is-active" : ""}"
              aria-label="${isArchived ? "Unarchive Folder" : "Archive Folder"}"
              title="${isArchived ? "Unarchive Folder" : "Archive Folder"}">
              <i class="fa-solid fa-box-archive text-lg"></i>
            </button>
          `;
            favoriteBtnHtml = `
            <button ${delegatedActionAttributes("toggleFavoriteDeck", [encodeHandlerValue(folderSubject)], { stopPropagation: true })}
              class="deck-icon-action deck-icon-action-favorite ${isFavorite ? "is-active" : ""}"
              aria-label="${isFavorite ? "Remove from Favorites" : "Add to Favorites"}"
              title="${isFavorite ? "Remove from Favorites" : "Add to Favorites"}">
              <i class="fa-solid fa-star text-lg"></i>
            </button>
          `;

            html += `
          <div data-folder-key="${escapeHTML(key)}" ${delegatedActionAttributes("enterFolder", [key, isLocked, (state.currentPath || []).join("::")])} class="deck-folder-card deck-card-container ${deckInteractionLocked ? "deck-interaction-blocked" : "cursor-pointer"} ${isLocked ? "password-protected-deck" : ""} group bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col relative">
            <div class="h-12 ${folderColorClass} transition-colors relative">
              <div class="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors"></div>
              <div class="deck-folder-banner-actions" data-action-stop-propagation="true">
                ${pinBtnHtml}
                ${favoriteBtnHtml}
                ${archiveBtnHtml}
              </div>
            </div>
            <div class="p-5 flex flex-col flex-1">
              <div class="flex justify-between items-start w-full gap-2">
                <div class="min-w-0 flex flex-col flex-1">
                  <h3 class="deck-folder-title font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide ${folderTextHover} transition-colors text-lg flex items-center min-w-0 gap-1" title="${escapeHTML(folderDisplayName)}">
                    ${isRecentlyViewedFolder ? '<i class="fa-regular fa-clock text-base text-amber-500 mr-0.5 flex-shrink-0" title="Recently Viewed"></i>' : ""}
                    <span class="deck-card-title-text ${state.prefs.deckNameMode === "clip" ? "deck-card-title-clip truncate" : "whitespace-normal break-words"}">${escapeHTML(folderDisplayName)}</span>
                  </h3>
                </div>
              </div>
              <div class="deck-folder-card-footer mt-auto pt-2 text-sm text-gray-500 dark:text-gray-400">
                <span class="deck-folder-card-count">${totalCards} cards</span>
                <div class="deck-card-labels deck-folder-card-labels">${folderCardLabels}</div>
              </div>
            </div>
          </div>`;
          });
        }

        // Render Cards section
        if (deckKeys.length > 0) {
          // Add section header - shown in grid if there are folders, hidden if cards-only (shown in controls row instead)
          const cardsHeaderClass = folderKeys.length > 0 ? "" : "hidden-in-grid";
          html += `<h3 data-deck-section="cards" class="col-span-full mt-2 mb-2 text-sm font-bold text-gray-500 dark:text-gray-400 ${cardsHeaderClass}">Cards (${deckKeys.length})</h3>`;
          deckKeys.forEach((key) => {
            const item = currentNode[key];
            const hasData = item._data !== null;
            const isExplicitFolder = hasData && item._data.IsFolder === true;

            if (hasData && !isExplicitFolder) {
              html += generateCardHTML(item._data, key);
            }
          });
        }
      }

      html += `</div>`;
      const archivedDeckCount = new Set(
        archivedDecks.filter((entry) => {
          if (typeof entry !== "string" || !entry.trim()) return false;
          return archiveScopePath
            ? entry === archiveScopePath ||
                entry.startsWith(`${archiveScopePath}::`)
            : true;
        }),
      ).size;
      if (archivedDeckCount > 0 && sourceFilter !== "archived") {
        const archivedToggleLabel = showArchivedDecks ? "Hide" : "Show";
        const archivedDeckNoun = archivedDeckCount === 1 ? "Deck" : "Decks";
        html += `<div data-archived-deck-toggle class="w-full flex justify-center mt-4 mb-2">
          <button type="button" ${delegatedActionAttributes("toggleArchivedDeckVisibility")} class="text-sm font-bold text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
            ${archivedToggleLabel} (${archivedDeckCount}) Archived ${archivedDeckNoun}
          </button>
        </div>`;
      }
      if (container) {
        const template = document.createElement("template");
        template.innerHTML = html;
        const getNodeKey = (node) => {
          if (!(node instanceof Element)) return "";
          for (const attribute of [
            "data-deck-list-layout",
            "data-deck-breadcrumb",
            "data-deck-freshness",
            "data-deck-empty",
            "data-archived-deck-toggle",
            "data-deck-section",
            "data-deck-key",
            "data-folder-key",
          ]) {
            if (node.hasAttribute(attribute)) {
              return `${attribute}:${node.getAttribute(attribute) || ""}`;
            }
          }
          return "";
        };
        const syncAttributes = (current, next) => {
          Array.from(current.attributes).forEach((attribute) => {
            if (attribute.name === "data-render-signature") return;
            if (!next.hasAttribute(attribute.name)) {
              current.removeAttribute(attribute.name);
            }
          });
          Array.from(next.attributes).forEach((attribute) => {
            if (current.getAttribute(attribute.name) !== attribute.value) {
              current.setAttribute(attribute.name, attribute.value);
            }
          });
        };
        const getChildrenRenderSignature = (node) => {
          let firstHash = 0x811c9dc5;
          let secondHash = 0x9e3779b9;
          const appendToken = (value) => {
            const token = String(value ?? "");
            for (let index = 0; index < token.length; index += 1) {
              const code = token.charCodeAt(index);
              firstHash = Math.imul(firstHash ^ code, 0x01000193);
              secondHash = Math.imul(secondHash ^ code, 0x85ebca6b);
            }
            firstHash = Math.imul(firstHash ^ 255, 0x01000193);
            secondHash = Math.imul(secondHash ^ 255, 0x85ebca6b);
          };
          const appendNode = (child) => {
            appendToken(child.nodeType);
            appendToken(child.nodeName);
            if (child.nodeType === Node.TEXT_NODE) {
              appendToken(child.nodeValue);
              return;
            }
            if (child.nodeType === Node.ELEMENT_NODE) {
              const attributes = Array.from(child.attributes).sort(
                (left, right) => left.name.localeCompare(right.name),
              );
              appendToken(attributes.length);
              attributes.forEach((attribute) => {
                appendToken(attribute.name);
                appendToken(attribute.value);
              });
            }
            appendToken(child.childNodes.length);
            Array.from(child.childNodes).forEach(appendNode);
          };
          appendToken(node.childNodes.length);
          Array.from(node.childNodes).forEach(appendNode);
          return `${(firstHash >>> 0).toString(36)}.${(
            secondHash >>> 0
          ).toString(36)}`;
        };
        const reconcileChildren = (currentParent, nextParent) => {
          Array.from(currentParent.childNodes).forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
              node.remove();
            }
          });

          const currentByKey = new Map();
          Array.from(currentParent.children).forEach((node) => {
            const key = getNodeKey(node);
            if (key) currentByKey.set(key, node);
          });

          let cursor = currentParent.firstElementChild;
          Array.from(nextParent.children).forEach((nextNode) => {
            const key = getNodeKey(nextNode);
            let currentNode = key ? currentByKey.get(key) : null;

            if (currentNode) {
              syncAttributes(currentNode, nextNode);
              if (currentNode.hasAttribute("data-deck-list-layout")) {
                reconcileChildren(currentNode, nextNode);
              } else {
                const nextSignature = getChildrenRenderSignature(nextNode);
                const currentSignature =
                  currentNode.getAttribute("data-render-signature") ||
                  getChildrenRenderSignature(currentNode);
                if (currentSignature !== nextSignature) {
                  currentNode.replaceChildren(
                    ...Array.from(nextNode.childNodes, (node) =>
                      node.cloneNode(true),
                    ),
                  );
                }
                currentNode.setAttribute(
                  "data-render-signature",
                  nextSignature,
                );
              }
            } else {
              currentNode = nextNode.cloneNode(true);
            }

            if (currentNode !== cursor) {
              currentParent.insertBefore(currentNode, cursor);
            }
            cursor = currentNode.nextElementSibling;
          });

          while (cursor) {
            const nextNode = cursor.nextElementSibling;
            cursor.remove();
            cursor = nextNode;
          }
        };

        reconcileChildren(container, template.content);
        const breadcrumb = container.querySelector("[data-deck-breadcrumb]");
        if (breadcrumb && (state.currentPath || []).length > 0) {
          breadcrumb.scrollTo({
            left: breadcrumb.scrollWidth,
            behavior: "smooth",
          });
        }
        
        // Update the deck-section-heading in the controls row
        const folderSection = container.querySelector('[data-deck-section="folders"]');
        const cardSection = container.querySelector('[data-deck-section="cards"]');
        const controlsHeading = document.querySelector(".deck-section-heading");
        if (controlsHeading) {
          // Show the first section header in the controls row (even if hidden in grid)
          if (folderSection) {
            controlsHeading.textContent = folderSection.textContent;
          } else if (cardSection) {
            controlsHeading.textContent = cardSection.textContent;
          } else {
            controlsHeading.textContent = "";
          }
        }
        
        container.className = "";
      }
      categoryProgressLastRenderSignature = renderSignature;

      applyTitleMode();
      
      // Re-initialize dropdown event listeners after re-render
      initDetailsExclusivity();
      
      // Sync preference controls to ensure UI state is correct
      syncPreferenceControls();
    } finally {
      categoryProgressRenderInFlight = false;
    }
  }

  async function fetchAndStartCategory(subject, mode, pass = null) {
    const started = await DeckNavCore.fetchAndStartCategory(
      subject,
      mode,
      pass,
    );
    if (started && state.session?.active) {
      await markQuizActivity(subject);
    }
    return started;
  }

  function startCustomSession(pool) {
    return DeckNavCore.startCustomSession(pool);
  }

  async function resetCategory(subject) {
    return DeckNavCore.resetCategory(subject);
  }

  function markLocalDownloadDeleted(subject) {
    const normalized = String(subject || "").trim();
    if (!normalized) return;
    const set = new Set(
      (state.prefs.localDownloadDeletedDecks || []).filter(Boolean),
    );
    set.add(normalized);
    state.prefs.localDownloadDeletedDecks = [...set];
  }

  function clearLocalDownloadDeleted(subject) {
    const normalized = String(subject || "").trim();
    if (!normalized) return;
    state.prefs.localDownloadDeletedDecks = (
      state.prefs.localDownloadDeletedDecks || []
    ).filter((deck) => deck !== normalized);
  }

  async function deleteSubjectData(subject) {
    subject = decodeHandlerValue(subject);
    if (
      await requestConfirmation(
        `Are you sure you want to delete the downloaded questions for "${subject}"? Your accuracy and progress stats will remain, but the app will remove the local data to save space. The deck will remain in your list until you download it again.`,
        "Delete Downloaded Data",
      )
    ) {
      if (
        appDataClearInProgress ||
        clearDatabaseInProgress ||
        clearAppDataInProgress
      ) {
        return;
      }
      let finishMutation;
      const mutation = new Promise((resolve) => {
        finishMutation = resolve;
      });
      inFlightDeckMutations.add(mutation);
      const clearGeneration = appDataClearGeneration;
      invalidateDeckFetch(subject);
      deckMutationsInProgress.add(String(subject || "").trim());

      try {
        // Clear any pending sync timers - deletion is a local operation
        lifecycle.clearTimeout(syncRetryTimer);
        lifecycle.clearInterval(syncCountdownTimer);

        // Reset sync state after local deletion succeeds
        // (deletion doesn't depend on backend connectivity)
        syncAttempt = 0;
        setGlobalLoadingState(false);

        state.db = state.db.filter((q) => q.Subject !== subject);
        rebuildQuestionIndex();
        markLocalDownloadDeleted(subject);
        state.categorySummary = (state.categorySummary || []).map((deck) => {
          if (deck && deck.Subject === subject) {
            return {
              ...deck,
              Downloaded: false,
              IsDownloaded: false,
              LocalQuestionCount: 0,
              QuestionCount: Math.max(0, Number(deck.QuestionCount || 0)),
            };
          }
          return deck;
        });
        invalidateCategoryProgressRenderSignature();

        state.prefs.favoriteDecks = (state.prefs.favoriteDecks || []).filter(
          (deck) => deck !== subject,
        );
        state.prefs.recentDecks = (state.prefs.recentDecks || []).filter(
          (deck) => deck !== subject,
        );
        if (state.prefs.lastActivity?.subject === subject) {
          state.prefs.lastActivity = null;
        }

        state.prefs.deletedDecks = Array.from(
          new Set((state.prefs.deletedDecks || []).filter(Boolean)),
        ).filter((deck) => deck !== subject);

        saveState();
        await deckRepository.settleWrites();
        if (!isDeckFetchCurrent(clearGeneration)) return;
        await safeIdbDeleteDeck(subject);
        if (!isDeckFetchCurrent(clearGeneration)) return;
        renderCategoryProgress();

        const saved = getStoredItem("saved_session");
        if (saved) {
          try {
            const sessionObj = JSON.parse(saved);
            const hasDeletedQuestions = Array.isArray(sessionObj.questions)
              ? sessionObj.questions.some((q) => q.Subject === subject)
              : false;

            if (hasDeletedQuestions) {
              let newQuestions = [];
              let newUserAnswers = {};
              let newIdentificationRatings = {};
              let newIdentificationSrsSnapshots = {};
              let keptBeforeCurrent = 0;

              let newIdx = 0;
              for (let i = 0; i < sessionObj.questions.length; i++) {
                if (sessionObj.questions[i].Subject !== subject) {
                  newQuestions.push(sessionObj.questions[i]);

                  if (sessionObj.userAnswers && sessionObj.userAnswers[i]) {
                    newUserAnswers[newIdx] = sessionObj.userAnswers[i];
                  }
                  if (
                    Object.prototype.hasOwnProperty.call(
                      sessionObj.identificationRatings || {},
                      i,
                    )
                  ) {
                    newIdentificationRatings[newIdx] =
                      sessionObj.identificationRatings[i];
                  }
                  if (
                    Object.prototype.hasOwnProperty.call(
                      sessionObj.identificationSrsSnapshots || {},
                      i,
                    )
                  ) {
                    newIdentificationSrsSnapshots[newIdx] =
                      sessionObj.identificationSrsSnapshots[i];
                  }

                  if (i < sessionObj.currentIndex) {
                    keptBeforeCurrent++;
                  }

                  newIdx++;
                }
              }

              if (newQuestions.length === 0) {
                clearSessionProgress();
                state.session = {
                  active: false,
                  questions: [],
                  currentIndex: 0,
                  userAnswers: {},
                };
              } else {
                sessionObj.questions = newQuestions;
                sessionObj.userAnswers = newUserAnswers;
                sessionObj.identificationRatings = newIdentificationRatings;
                sessionObj.identificationSrsSnapshots =
                  newIdentificationSrsSnapshots;
                sessionObj.currentIndex = Math.min(
                  keptBeforeCurrent,
                  newQuestions.length - 1,
                );
                setStoredJSON("saved_session", sessionObj);

                if (state.session.active) {
                  state.session = { ...sessionObj };
                }
              }
            } else if (
              state.session?.questions?.some((q) => q.Subject === subject) ||
              state.prefs.lastActivity?.subject === subject
            ) {
              clearSessionProgress();
              state.session = {
                active: false,
                questions: [],
                currentIndex: 0,
                userAnswers: {},
              };
            }
          } catch (e) {
            appLogger.error("Error parsing saved session during deletion.", e);
          }
        }

        if (
          state.session?.questions?.some((q) => q.Subject === subject) ||
          state.prefs.lastActivity?.subject === subject
        ) {
          clearSessionProgress();
          state.session = {
            active: false,
            questions: [],
            currentIndex: 0,
            userAnswers: {},
          };
        }

        updateDashboard();
      } finally {
        deckMutationsInProgress.delete(String(subject || "").trim());
        inFlightDeckMutations.delete(mutation);
        finishMutation();
      }
    }
  }

  function getDeckFetchKey(subject, pass = null, customFilter = null) {
    return deckLoader.getKey(subject, pass, customFilter);
  }

  async function fetchDeckQuestions(
    subject,
    pass = null,
    loaderElement = null,
    customFilter = null,
    expectedQuestionCount = null,
    suppressRender = false,
  ) {
    const subjectKey = String(subject || "").trim();
    if (!subjectKey) return [];
    if (!canFetchDeck(subjectKey)) return [];
    if (!(await waitForLocalDatabaseReady())) {
      throw new Error("Local question data is not ready yet.");
    }

    return await fetchDeckQuestionsFromNetwork(
      subject,
      pass,
      customFilter,
      loaderElement,
      expectedQuestionCount,
      suppressRender,
    );
  }

  function getDeckFetchFailureMessage(subject, error) {
    const message =
      error && error.message
        ? error.message
        : "Unable to load deck data from the backend.";
    if (/incorrect password/i.test(message)) return "Incorrect Password";
    return `Unable to load "${subject}" from the database. ${message}`;
  }

  /**
   * @param {string} subject
   * @param {string|null} pass
   * @param {((question: Record<string, unknown>) => boolean)|null} customFilter
   * @param {HTMLElement|null} [loaderElement]
   * @param {number|null} [expectedQuestionCount]
   * @param {boolean} [suppressRender]
   * @returns {Promise<Array<Record<string, unknown>>>}
   */
  async function fetchDeckQuestionsFromNetwork(
    subject,
    pass,
    customFilter,
    loaderElement = null,
    expectedQuestionCount = null,
    suppressRender = false,
  ) {
    return deckLoader.fetch({
      subject,
      pass,
      customFilter,
      loaderElement,
      expectedQuestionCount,
      suppressRender,
      processResponse: (
        response,
        { clearGeneration, deckGeneration, expectedQuestionCount: expectedCount },
      ) =>
        processDeckResponse(
          subject,
          pass,
          customFilter,
          response,
          expectedCount,
          suppressRender,
          clearGeneration,
          deckGeneration,
        ),
    });
  }

  async function processDeckResponse(
    subject,
    pass,
    customFilter,
    response,
    expectedQuestionCount = null,
    suppressRender = false,
    clearGeneration,
    deckGeneration,
  ) {
    let previousSubjectQuestionsForRollback = null;
    let installedQuestionsForRollback = null;
    const restoreSubjectQuestionsIfUnchanged = () => {
      if (
        !previousSubjectQuestionsForRollback ||
        !installedQuestionsForRollback
      ) {
        return false;
      }
      const currentSubjectQuestions = state.db.filter(
        (question) => String(question?.Subject || "").trim() === subject,
      );
      if (
        currentSubjectQuestions.length !==
          installedQuestionsForRollback.length ||
        !currentSubjectQuestions.every(
          (question, index) =>
            question === installedQuestionsForRollback[index],
        )
      ) {
        return false;
      }
      state.db = [
        ...state.db.filter(
          (question) => String(question?.Subject || "").trim() !== subject,
        ),
        ...previousSubjectQuestionsForRollback,
      ];
      rebuildQuestionIndex();
      invalidateCategoryProgressRenderSignature();
      return true;
    };

    try {
        const newQuestions = response;

        const normalizedSubject = String(subject || "").trim();
        const summaryEntry = (state.categorySummary || []).find(
          (deck) => String(deck?.Subject || "").trim() === normalizedSubject,
        );
        const expectedPayloadVersion = String(
          summaryEntry?.PayloadVersion || "",
        );
        let verifiedPayloadVersion = "";
        if (
          pendingDeckPayloadRefreshes.has(normalizedSubject) ||
          /^[a-f0-9]{64}$/i.test(expectedPayloadVersion)
        ) {
          if (!/^[a-f0-9]{64}$/i.test(expectedPayloadVersion)) {
            throw new Error(
              `Backend payload version for "${subject}" is unavailable.`,
            );
          }
          if (typeof AppNetwork.getPayloadFingerprint !== "function") {
            throw new Error(
              "Backend payload fingerprint verification is unavailable.",
            );
          }
          const receivedPayloadVersion =
            await AppNetwork.getPayloadFingerprint(newQuestions);
          if (
            !isDeckFetchCurrent(clearGeneration) ||
            !isDeckFetchCurrentForSubject(subject, deckGeneration)
          ) {
            return [];
          }
          if (receivedPayloadVersion !== expectedPayloadVersion) {
            throw new Error(
              `Backend returned a stale or incompatible payload for "${subject}".`,
            );
          }
          verifiedPayloadVersion = expectedPayloadVersion;
        }

        let validQuestions = newQuestions
          .map((q) => normalizeQuestionRecord(q, subject))
          .filter((q) => q.Question && q.Question.trim() !== "");
        if (typeof customFilter === "function")
          validQuestions = validQuestions.filter(customFilter);

        if (
          expectedQuestionCount === null &&
          pendingDeckPayloadRefreshes.has(String(subject || "").trim())
        ) {
          const summaryEntry = (state.categorySummary || []).find(
            (deck) =>
              String(deck?.Subject || "").trim() ===
              String(subject || "").trim(),
          );
          if (summaryEntry) {
            expectedQuestionCount = Math.max(
              0,
              Number(summaryEntry.QuestionCount) || 0,
            );
          }
        }

        const existingSubjectQuestions = getQuestionsForSubject(subject);
        const existingById = new Map();
        for (const existingQuestion of existingSubjectQuestions) {
          if (existingQuestion?.ID) {
            existingById.set(String(existingQuestion.ID), existingQuestion);
          }
        }

        let stableIdBySignature = null;
        const getQuestionSignature = (question) =>
          [
            String(question?.Question || "").trim(),
            String(question?.Answer || "").trim(),
            String(question?.ChoiceA || "").trim(),
            String(question?.ChoiceB || "").trim(),
            String(question?.ChoiceC || "").trim(),
            String(question?.ChoiceD || "").trim(),
            String(question?.ChoiceE || "").trim(),
            String(question?.Explanation || "").trim(),
          ].join("||");
        const getStableIdBySignature = (question) => {
          if (!stableIdBySignature) {
            stableIdBySignature = new Map();
            for (const existingQuestion of existingSubjectQuestions) {
              const signature = getQuestionSignature(existingQuestion);
              const stableKey = `${String(existingQuestion?.Subject || subject).trim()}::${signature}`;
              if (signature && existingQuestion?.ID) {
                stableIdBySignature.set(stableKey, String(existingQuestion.ID));
              }
            }
          }

          const signature = getQuestionSignature(question);
          if (!signature) return "";
          return (
            stableIdBySignature.get(
              `${String(question?.Subject || subject).trim()}::${signature}`,
            ) || ""
          );
        };

        const generateDeterministicQuestionId = (
          questionSubject,
          questionText,
          answerText,
        ) => {
          const subjectKey = String(questionSubject || "").trim();
          const raw = [
            subjectKey,
            String(questionText || "").trim(),
            String(answerText || "").trim(),
          ].join("::");
          let hash = 0x811c9dc5;
          for (let index = 0; index < raw.length; index += 1) {
            hash ^= raw.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193) >>> 0;
          }
          return `${subjectKey || "question"}::q_${hash.toString(36)}`;
        };

        const normalizeDeckQuestionId = (rawId, question) => {
          const questionSubject = question?.Subject || subject;
          const subjectKey = String(questionSubject || subject || "").trim();
          const incomingId = String(rawId ?? "").trim();

          if (!subjectKey) {
            if (incomingId) return incomingId;
            return generateDeterministicQuestionId(
              subjectKey,
              question?.Question,
              question?.Answer,
            );
          }

          if (!incomingId) {
            return generateDeterministicQuestionId(
              subjectKey,
              question?.Question,
              question?.Answer,
            );
          }

          const segments = incomingId
            .split("::")
            .map((segment) => segment.trim())
            .filter(Boolean);
          const lastSegment = segments[segments.length - 1] || incomingId;

          if (incomingId.startsWith(`${subjectKey}::`)) {
            return incomingId;
          }

          return `${subjectKey}::${lastSegment}`;
        };

        validQuestions = validQuestions.map((q) => {
          const incomingId = String(q.ID ?? "").trim();
          const existing = incomingId ? existingById.get(incomingId) : null;
          if (existing) {
            q.ID = existing.ID;
            return q;
          }

          if (!incomingId) {
            const existingId = getStableIdBySignature(q);
            if (existingId) {
              q.ID = existingId;
              return q;
            }
          }

          q.ID = normalizeDeckQuestionId(q.ID, q);
          return q;
        });

        if (
          expectedQuestionCount !== null &&
          validQuestions.length !== expectedQuestionCount
        ) {
          throw new Error(
            `Backend payload for "${subject}" is incomplete: expected at least ${expectedQuestionCount} questions, received ${validQuestions.length}.`,
          );
        }

        if (
          suppressRender &&
          (state.session?.active ||
            (isReviewViewActive() && getCurrentReviewSubject() === subject))
        ) {
          return [];
        }

        if (validQuestions.length === 0) {
          return [];
        }

        if (suppressRender) {
          previousSubjectQuestionsForRollback = state.db.filter(
            (question) => String(question?.Subject || "").trim() === subject,
          );
          installedQuestionsForRollback = validQuestions;
        }
        const otherQuestions = state.db.filter(
          (q) => String(q?.Subject || "").trim() !== subject,
        );
        state.db = [...otherQuestions, ...validQuestions];
        rebuildQuestionIndex();
        invalidateCategoryProgressRenderSignature();
        await safeIdbSaveDeck(normalizedSubject, validQuestions);
        if (
          !isDeckFetchCurrent(clearGeneration) ||
          !isDeckFetchCurrentForSubject(subject, deckGeneration)
        ) {
          if (
            isDeckFetchCurrent(clearGeneration) &&
            restoreSubjectQuestionsIfUnchanged()
          ) {
            await safeIdbSaveDeck(
              normalizedSubject,
              state.db.filter(
                (question) =>
                  String(question?.Subject || "").trim() === normalizedSubject,
              ),
            );
          }
          return [];
        }
        clearLocalDownloadDeleted(subject);
        const previousLocalVersion = getLocalDeckVersion(normalizedSubject);
        if (verifiedPayloadVersion) {
          setLocalDeckVersion(normalizedSubject, verifiedPayloadVersion);
        }
        const completedPendingRefresh =
          pendingDeckPayloadRefreshes.delete(normalizedSubject);
        if (completedPendingRefresh) {
          state.prefs.pendingDeckPayloadRefreshes = [
            ...pendingDeckPayloadRefreshes,
          ];
          try {
            if ((await saveState("prefs")) === false) {
              pendingDeckPayloadRefreshes.add(normalizedSubject);
              setLocalDeckVersion(normalizedSubject, previousLocalVersion);
              state.prefs.pendingDeckPayloadRefreshes = [
                ...pendingDeckPayloadRefreshes,
              ];
              appLogger.error(
                `Unable to persist completion of the updated payload for "${subject}".`,
              );
            }
          } catch (error) {
            pendingDeckPayloadRefreshes.add(normalizedSubject);
            setLocalDeckVersion(normalizedSubject, previousLocalVersion);
            state.prefs.pendingDeckPayloadRefreshes = [
              ...pendingDeckPayloadRefreshes,
            ];
            appLogger.error(
              `Unable to persist completion of the updated payload for "${subject}".`,
              error,
            );
          }
          if (
            !isDeckFetchCurrent(clearGeneration) ||
            !isDeckFetchCurrentForSubject(subject, deckGeneration)
          ) {
            pendingDeckPayloadRefreshes.add(normalizedSubject);
            setLocalDeckVersion(normalizedSubject, previousLocalVersion);
            state.prefs.pendingDeckPayloadRefreshes = [
              ...pendingDeckPayloadRefreshes,
            ];
            try {
              await saveState("prefs");
            } catch (error) {
              appLogger.error(
                `Unable to preserve the newer pending payload refresh for "${subject}".`,
                error,
              );
            }
          }
        }
        if (
          !completedPendingRefresh &&
          verifiedPayloadVersion &&
          previousLocalVersion !== verifiedPayloadVersion
        ) {
          try {
            if ((await saveState("prefs")) === false) {
              setLocalDeckVersion(normalizedSubject, previousLocalVersion);
              appLogger.error(
                `Unable to persist the verified payload version for "${subject}".`,
              );
            }
          } catch (error) {
            setLocalDeckVersion(normalizedSubject, previousLocalVersion);
            appLogger.error(
              `Unable to persist the verified payload version for "${subject}".`,
              error,
            );
          }
          if (
            !isDeckFetchCurrent(clearGeneration) ||
            !isDeckFetchCurrentForSubject(subject, deckGeneration)
          ) {
            setLocalDeckVersion(normalizedSubject, previousLocalVersion);
            if (isDeckFetchCurrent(clearGeneration)) {
              pendingDeckPayloadRefreshes.add(normalizedSubject);
              state.prefs.pendingDeckPayloadRefreshes = [
                ...pendingDeckPayloadRefreshes,
              ];
              try {
                if ((await saveState("prefs")) === false) {
                  appLogger.error(
                    `Unable to preserve the pending payload refresh for "${subject}".`,
                  );
                }
              } catch (error) {
                appLogger.error(
                  `Unable to preserve the pending payload refresh for "${subject}".`,
                  error,
                );
              }
            }
          }
        }
        if (!suppressRender && typeof renderCategoryProgress === "function") {
          renderCategoryProgress();
        }

        return validQuestions;
    } catch (error) {
      restoreSubjectQuestionsIfUnchanged();
      throw error;
    }
  }

  async function reviewDeck(
    subject,
    pass = null,
    preferCachedQuestions = false,
    authorizedSessionQuestions = null,
  ) {
    return getReviewController().reviewDeck(
      subject,
      pass,
      preferCachedQuestions,
      authorizedSessionQuestions,
    );
  }

  function toggleFavoriteDeck(subjectId) {
    return getProgressService().toggleFavoriteDeck(subjectId);
  }

  function togglePinDeck(subjectId) {
    subjectId = decodeHandlerValue(subjectId);
    if (!subjectId) return;

    if (!Array.isArray(state.prefs.pinnedDecks)) {
      state.prefs.pinnedDecks = [];
    }

    const existing = state.prefs.pinnedDecks.filter(Boolean);
    const isPinned = existing.includes(subjectId);

    state.prefs.pinnedDecks = isPinned
      ? existing.filter((deck) => deck !== subjectId)
      : [...existing, subjectId];

    saveState();
    invalidateCategoryProgressRenderSignature();
    renderCategoryProgress();
    showToast(isPinned ? "Removed from Pins." : "Pinned to top.");
  }

  function toggleArchivedDeckVisibility() {
    return getProgressService().toggleArchivedDeckVisibility();
  }

  async function toggleArchiveDeck(subjectId) {
    return getProgressService().toggleArchiveDeck(subjectId);
  }

  function submitPracticeAnswer(selected, correct) {
    if (
      typeof SessionCore === "undefined" ||
      typeof SessionCore.submitPracticeAnswer !== "function"
    ) {
      throw new Error("SessionCore is required before submitting an answer.");
    }
    return SessionCore.submitPracticeAnswer(selected, correct);
  }

  function showExplanation(q) {
    if (
      typeof SessionCore === "undefined" ||
      typeof SessionCore.showExplanation !== "function"
    ) {
      throw new Error("SessionCore is required before showing an explanation.");
    }
    return SessionCore.showExplanation(q);
  }

  function nextQuestion() {
    return getQuestionNavigation().nextQuestion();
  }

  function prevQuestion() {
    return getQuestionNavigation().prevQuestion();
  }

  function getDefaultSrsEntry(qId) {
    return getProgressService().getDefaultSrsEntry(qId);
  }

  function updateSrsForQuestion(q, isCorrect) {
    return getProgressService().updateSrsForQuestion(q, isCorrect);
  }

  function computeSrsInterval(step, ease) {
    return getProgressService().computeSrsInterval(step, ease);
  }

  function trackStats(q, isCorrect) {
    return getProgressService().trackStats(q, isCorrect);
  }

  async function endSession(silent = false) {
    if (
      typeof SessionCore === "undefined" ||
      typeof SessionCore.endSession !== "function"
    ) {
      throw new Error("SessionCore is required before ending a session.");
    }

    if (!silent && state.session.active) {
      const confirmed = await globalScope.requestConfirmation?.(
        "Are you sure you want to exit this quiz? Your progress will be saved.",
        "Exit Quiz",
      );
      if (!confirmed) return false;
    }

    SessionCore.endSession(true);
    if (!silent && typeof globalScope.navigate === "function") {
      await globalScope.navigate("dashboard");
    }
    return true;
  }

  function getAnalyticsCore() {
    if (typeof globalThis !== "undefined" && globalThis.Analytics) {
      return globalThis.Analytics;
    }
    if (typeof Analytics !== "undefined") {
      return Analytics;
    }
    return null;
  }

  function renderCharts() {
    const analytics = getAnalyticsCore();
    if (!analytics || typeof analytics.renderCharts !== "function") {
      return null;
    }
    return analytics.renderCharts();
  }

  function applyAppTheme(darkMode) {
    return getAppThemeController().applyTheme(darkMode);
  }

  function toggleTheme() {
    return getAppThemeController().toggleTheme();
  }

  function updateThemeButton() {
    return getAppThemeController().updateThemeButton();
  }

  async function resetProgress() {
    if (
      await requestConfirmation(
        "Are you sure? This deletes mistakes, all statistics, and your current saved session.",
        "Reset All Progress",
      )
    ) {
      const previousStats = state.stats;
      const previousSession = state.session;
      const previousProgress = state.prefs.studyProgress;
      const previousToggles = state.prefs.qToggles;
      const previousLastActivity = state.prefs.lastActivity;
      const previousSavedSession = getStoredItem("saved_session");
      const pausedAutoNext = SessionCore.pauseAutoNext();
      stopVisualTimer();

      state.stats = {
        totalAnswered: 0,
        correct: 0,
        mistakes: [],
        subjectAccuracy: {},
        completedQs: [],
        srsMap: {},
      };
      state.session = {
        active: false,
        questions: [],
        currentIndex: 0,
        userAnswers: {},
        autoNextTimeout: null,
        revealedCloze: false,
      };

      state.prefs.studyProgress = {};
      state.prefs.qToggles = {};
      state.prefs.lastActivity = null;

      try {
        if (!clearSessionProgress()) {
          throw new Error("Unable to remove the saved session.");
        }
        if (!(await saveState())) {
          throw new Error("Unable to save the reset progress.");
        }
      } catch (error) {
        state.stats = previousStats;
        state.session = previousSession;
        state.prefs.studyProgress = previousProgress;
        state.prefs.qToggles = previousToggles;
        state.prefs.lastActivity = previousLastActivity;
        try {
          if (
            previousSavedSession !== null &&
            (typeof setStoredItem !== "function" ||
              !setStoredItem("saved_session", previousSavedSession))
          ) {
            throw new Error("Unable to restore the previous saved session.");
          }
          if (!(await saveState())) {
            throw new Error("Unable to restore the previous saved progress.");
          }
        } catch (restoreError) {
          appLogger.error("Unable to restore progress after reset failed.", {
            resetError: error,
            restoreError,
          });
        }
        if (pausedAutoNext && !SessionCore.resumeAutoNext(pausedAutoNext)) {
          appLogger.warn("Unable to resume the active session auto-advance.");
        }
        appLogger.error("Unable to reset progress.", error);
        updateDashboard();
        showToast(
          "Progress could not be fully reset. Your previous progress was restored where possible.",
          "error",
        );
        return;
      }

      updateDashboard();
      await checkSavedSession();
      showToast("Progress Reset.", "success");

      const statsView = document.getElementById("view-stats");
      const statsChart = document.getElementById("chart-accuracy");
      if (statsView && statsView.classList.contains("active") && statsChart) {
        renderCharts();
      }
    }
  }

  async function clearDatabase() {
    if (
      clearDatabaseInProgress ||
      clearAppDataInProgress ||
      appDataClearInProgress
    ) {
      return;
    }
    clearDatabaseInProgress = true;
    try {
      const confirmed = await requestConfirmation(
        "WARNING: Are you sure you want to clear the locally saved database? You will need an active internet connection to sync the questions again. The app will reload to apply changes.",
        "Clear Local Database",
      );
      if (!confirmed || clearAppDataInProgress || appDataClearInProgress)
        return;
      await Promise.allSettled([...inFlightDeckMutations]);
      appDataClearInProgress = true;
      appDataClearGeneration += 1;
      try {
        await deckRepository.settleWrites();
        await safeIdbClearQuestionDatabase();
        state.db = [];
        rebuildQuestionIndex();
        pendingDeckPayloadRefreshes.clear();
        state.prefs.pendingDeckPayloadRefreshes = [];
        state.prefs.localDeckPayloadVersions = {};
        if (!clearSessionProgress()) {
          throw new Error("Unable to remove the saved session.");
        }
        state.prefs.lastActivity = null;
        if (!(await saveState())) {
          throw new Error("Unable to save the cleared database state.");
        }
        window.location.reload();
      } catch (error) {
        appDataClearInProgress = false;
        appDataClearGeneration += 1;
        appLogger.error("Unable to clear the local database.", error);
        showToast(
          "The local database could not be fully cleared. Please try again.",
          "error",
        );
      }
    } catch (error) {
      appLogger.error("Unable to confirm local database clearing.", error);
      showToast(
        "The local database could not be cleared. Please try again.",
        "error",
      );
    } finally {
      clearDatabaseInProgress = false;
    }
  }

  async function clearAppData() {
    if (
      clearAppDataInProgress ||
      clearDatabaseInProgress ||
      appDataClearInProgress
    ) {
      return;
    }
    clearAppDataInProgress = true;

    try {
      if (
        !(await requestConfirmation(
          "This permanently deletes this app's locally saved decks, progress, preferences, saved sessions, and cached files. The app shell will be downloaded again after reload. Continue?",
          "Clear App Data",
        ))
      ) {
        return;
      }

      if (
        !(await requestConfirmation(
          "Final confirmation: only data owned by this app will be erased, including cached downloaded files. The app will cache its current offline shell again after reload; other same-origin website data will be left untouched.",
          "Confirm Permanent Deletion",
        ))
      ) {
        return;
      }

      if (clearDatabaseInProgress || appDataClearInProgress) return;
      if (typeof rootScope.AppState?.stopStatePersistence !== "function") {
        throw new Error("App state persistence control is unavailable.");
      }
      await Promise.allSettled([...inFlightDeckMutations]);
      await rootScope.AppState.stopStatePersistence();
      appDataClearInProgress = true;
      appDataClearGeneration += 1;
      await deckRepository.settleWrites();

      if (typeof caches !== "undefined") {
        if (
          typeof caches.keys !== "function" ||
          typeof caches.delete !== "function"
        ) {
          throw new Error("App cache storage is unavailable.");
        }
        const appCacheNames = (await caches.keys()).filter((name) =>
          name.startsWith("mrh-cache-"),
        );
        const cacheResults = await Promise.all(
          appCacheNames.map((name) => caches.delete(name)),
        );
        if (cacheResults.some((deleted) => !deleted)) {
          throw new Error("Unable to remove one or more app cache entries.");
        }
      }

      await safeIdbClearQuestionDatabase();
      pendingDeckPayloadRefreshes.clear();

      if (state.session) state.session.active = false;
      rootScope.SessionCore?.cleanup?.();

      if (
        typeof StorageUtils === "undefined" ||
        typeof StorageUtils.clearCurrentNamespace !== "function"
      ) {
        throw new Error("App storage cleanup is unavailable.");
      }
      StorageUtils.clearCurrentNamespace({ includeLegacy: true });
      setStudentPortalWelcomeHidden(false, true);

      state.db = [];
      state.categorySummary = [];
      state.accessMetadata = {};
      state.prefs.localDeckPayloadVersions = {};
      state.stats = {
        totalAnswered: 0,
        correct: 0,
        mistakes: [],
        subjectAccuracy: {},
        completedQs: [],
        srsMap: {},
      };
      state.session = {
        active: false,
        questions: [],
        currentIndex: 0,
        userAnswers: {},
        autoNextTimeout: null,
        revealedCloze: false,
      };
      state.prefs.lastActivity = null;
      rebuildQuestionIndex();
      window.location.reload();
    } catch (error) {
      appDataClearInProgress = false;
      rootScope.AppState?.resumeStatePersistence?.();
      appLogger.error("Unable to clear app data.", error);
      showToast(
        "Some app data could not be cleared. Please try again.",
        "error",
      );
    } finally {
      clearAppDataInProgress = false;
    }
  }

  document.addEventListener(
    "keydown",
    (e) => {
      const settingsModal = document.getElementById("session-settings-modal");

      const isSettingsModalOpen =
        settingsModal && settingsModal.getAttribute("aria-hidden") !== "true";

      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT" ||
          activeElement.isContentEditable);

      if (!state.session.active || isSettingsModalOpen || isInputFocused)
        return;

      const key = e.key.toUpperCase();
      const isAnswered = state.session.userAnswers[state.session.currentIndex];

      if (!isAnswered) {
        if (["1", "A"].includes(key))
          document.querySelector('.choice-btn[data-choice="A"]')?.click();
        if (["2", "B"].includes(key))
          document.querySelector('.choice-btn[data-choice="B"]')?.click();
        if (["3", "C"].includes(key))
          document.querySelector('.choice-btn[data-choice="C"]')?.click();
        if (["4", "D"].includes(key))
          document.querySelector('.choice-btn[data-choice="D"]')?.click();
        if (["5", "E"].includes(key))
          document.querySelector('.choice-btn[data-choice="E"]')?.click();
        if (e.code === "Space") {
          e.preventDefault();
          revealAnswer();
        }
      } else {
        if (e.code === "Space" || e.code === "ArrowRight") {
          e.preventDefault();
          nextQuestion();
        }
        if (e.code === "ArrowLeft") {
          e.preventDefault();
          prevQuestion();
        }
      }
    },
    { signal: uiEventController.signal },
  );

  window.addEventListener(
    "resize",
    () => {
      if (state.session.active && state.prefs.quizNavigationPosition === "auto")
        applyNavigationPosition();
    },
    { signal: uiEventController.signal },
  );

  function saveSessionProgress() {
    return getSessionPersistence().saveSessionProgress();
  }

  async function checkSavedSession() {
    return getSessionPersistence().checkSavedSession();
  }

  let pendingResumeSession = null;

  function hasSessionRestoreProgress(sessionRoute) {
    return getSessionPersistence().hasSessionRestoreProgress(sessionRoute);
  }

  async function resumeSession(password = null, options = {}) {
    return getSessionPersistence().resumeSession(password, options);
  }

  function clearSessionProgress() {
    return getSessionPersistence().clearSessionProgress();
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function showMCQOptions() {
    document.getElementById("active-recall-mask").classList.add("hidden");
    document.getElementById("q-choices").classList.remove("hidden");
  }

  function revealAnswer() {
    if (
      typeof SessionCore === "undefined" ||
      typeof SessionCore.revealAnswer !== "function"
    ) {
      throw new Error("SessionCore is required before revealing an answer.");
    }
    return SessionCore.revealAnswer();
  }

  function startVisualTimer() {
    if (
      typeof SessionCore === "undefined" ||
      typeof SessionCore.startVisualTimer !== "function"
    ) {
      throw new Error(
        "SessionCore is required before starting the visual timer.",
      );
    }
    return SessionCore.startVisualTimer();
  }

  function stopVisualTimer() {
    if (
      typeof SessionCore === "undefined" ||
      typeof SessionCore.stopVisualTimer !== "function"
    ) {
      throw new Error(
        "SessionCore is required before stopping the visual timer.",
      );
    }
    return SessionCore.stopVisualTimer();
  }

  function getCurrentReviewSubject() {
    return DeckReviewCore?.getCurrentReviewSubject?.() || "";
  }

  function showToast(message, type = "success", duration = 3000) {
    return getAppStatusUI().showToast(message, type, duration);
  }

  function setActiveDeckSessionPreference(mode, key, value, subject) {
    if (rootScope.setDeckSessionSetting?.(mode, key, value, subject) === true) {
      return true;
    }
    showToast("Open a deck session before changing this setting.", "warning");
    return false;
  }

  function toggleSessionHeader() {
    const currentView = document.querySelector(".view-section.active")?.id;
    const mode =
      currentView === "view-deck-review"
        ? "study"
        : currentView === "view-practice" && state.session?.active
          ? "quiz"
          : null;
    const subject = rootScope.PreferencesCore?.getNavigationContextSubject?.();
    if (!mode || !subject) return false;
    const showHeader =
      rootScope.getDeckSessionSetting?.(mode, "showSessionHeader", subject) !==
      true;
    if (
      !setActiveDeckSessionPreference(
        mode,
        "showSessionHeader",
        showHeader,
        subject,
      )
    )
      return false;
    saveState();
    syncPreferenceControls();
    return true;
  }

  function toggleActiveRecall() {
    const isChecked = document.getElementById("toggle-active-recall").checked;
    const value = Boolean(isChecked);
    const subject = rootScope.PreferencesCore?.getNavigationContextSubject?.();
    const isSettingsPage = document.getElementById("view-settings")?.classList.contains("active");
    
    if (isSettingsPage) {
      // Settings page - ALWAYS set global preference
      state.prefs.activeRecall = value;
    } else if (subject) {
      // Modal/active session - set deck-specific override
      if (!setActiveDeckSessionPreference("quiz", "activeRecall", value, subject)) return;
    } else {
      // No subject but not in settings - set global
      state.prefs.activeRecall = value;
    }
    saveState();
    syncPreferenceControls();

    if (state.session.active) {
      renderQuestion();
    }
  }

  let activeHubSubject = "";

  function openModeSelect(subject) {
    activeHubSubject = subject;
    document.getElementById("mode-select-deck-title").innerText = subject;
    navigate("mode-select");
  }

  function proceedToReview() {
    reviewDeck(activeHubSubject);
  }

  async function switchPracticeToReview() {
    return getReviewController().switchPracticeToReview();
  }

  async function continuePracticeReviewSwitch(subject, password) {
    return getReviewController().continuePracticeReviewSwitch(subject, password);
  }

  async function markQuizActivity(subject) {
    currentAppMode = "quiz";
    state.prefs.lastActivity = {
      ...(state.prefs.lastActivity || {}),
      mode: "quiz",
      subject: subject || null,
      updatedAt: new Date().toISOString(),
    };
    syncPreferenceControls();
    return saveState("prefs");
  }

  async function startReviewDeckQuiz(subject) {
    return getReviewController().startReviewDeckQuiz(subject);
  }

  async function switchReviewToPractice() {
    return getReviewController().switchReviewToPractice();
  }

  function cancelDeckPasswordRequest() {
    getReviewController().cancelPracticeReviewSwitch();
    closeDeckPasswordModal();
  }

  function proceedToQuiz() {
    if (activeHubSubject) {
      fetchAndStartCategory(activeHubSubject, "continue");
    }
  }

  let currentAppMode = "quiz";

  function toggleAppMode() {
    const toggleElement = document.getElementById("globalModeToggle");
    const modeLabel = document.getElementById("modeLabel");

    if (!toggleElement) return;

    currentAppMode = toggleElement.checked ? "review" : "quiz";
    state.prefs.lastActivity = {
      ...(state.prefs.lastActivity || {}),
      mode: currentAppMode,
      updatedAt: new Date().toISOString(),
    };

    if (modeLabel) {
      modeLabel.innerText = currentAppMode === "review" ? "Study" : "Quiz";
    }

    saveState();
    syncPreferenceControls();
    renderCategoryProgress();
  }

  function changeDatabaseUpdateMode(mode) {
    const normalizedMode = ["idle", "immediate"].includes(mode)
      ? mode
      : state.prefs.databaseUpdateMode || "idle";

    state.prefs.databaseUpdateMode = normalizedMode;
    saveState();

    const modeControl = document.getElementById("database-update-mode");
    if (modeControl && modeControl.value !== normalizedMode) {
      modeControl.value = normalizedMode;
    }

    if (pendingSummaryData && !state.session.active) {
      applySummaryData(pendingSummaryData);
      pendingSummaryData = null;
      updateSyncStatus(
        '<i class="fa-solid fa-check mr-1"></i> Database update applied immediately.',
        "success",
      );
    }
  }

  let pendingDeckSubject = null;
  let pendingDeckAction = null;
  let deckInteractionLocked = false;
  let activeDeckInteractionKey = null;
  let activeDeckInteractionSubject = null;
  let deckEntryInteractionSnapshots = null;

  function updateRecentDecks(subj) {
    if (!subj) return;
    if (!state.prefs.recentDecks) state.prefs.recentDecks = [];
    const recentDecks = state.prefs.recentDecks || [];
    const filtered = recentDecks.filter((d) => d !== subj);
    filtered.unshift(subj);
    state.prefs.recentDecks = filtered.slice(0, 10);
  }

  function getPathSegments(value) {
    return String(value || "")
      .split("::")
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  function getRecentPathRelationDepth(subjectA, subjectB) {
    const left = getPathSegments(subjectA);
    const right = getPathSegments(subjectB);

    if (left.length === 0 || right.length === 0) return 0;

    const leftKey = left.join("::");
    const rightKey = right.join("::");
    if (leftKey === rightKey) return left.length;

    if (left.length <= right.length) {
      const ancestor = right.slice(0, left.length).join("::");
      if (ancestor === leftKey) return left.length;
    }

    if (right.length <= left.length) {
      const ancestor = left.slice(0, right.length).join("::");
      if (ancestor === rightKey) return right.length;
    }

    return 0;
  }

  function isRecentlyViewedPath(subject) {
    const activity = String(subject || "").trim();
    const recentDecks = Array.isArray(state.prefs?.recentDecks)
      ? state.prefs.recentDecks
      : [];
    const latest = String(recentDecks[0] || "").trim();
    if (!activity || !latest) return false;

    return getRecentPathRelationDepth(activity, latest) > 0;
  }

  function getRecentPathDepth(subject) {
    const activity = String(subject || "").trim();
    const recentDecks = Array.isArray(state.prefs?.recentDecks)
      ? state.prefs.recentDecks
      : [];
    const latest = String(recentDecks[0] || "").trim();
    if (!activity || !latest) return 0;

    return getRecentPathRelationDepth(activity, latest);
  }

  function setOtherDeckInteractionsLocked(subject, isLocked) {
    const normalizedSubject = String(subject || "").trim();
    if (!normalizedSubject || typeof document === "undefined") return;

    document
      .querySelectorAll("[data-deck-key], [data-folder-key]")
      .forEach((element) => {
        const key = element.dataset.deckKey || element.dataset.folderKey || "";
        const shouldBlock = isLocked && key !== normalizedSubject;

        if (shouldBlock) {
          if (!element.hasAttribute("data-deck-lock-previous-aria-disabled")) {
            element.setAttribute(
              "data-deck-lock-previous-aria-disabled",
              element.getAttribute("aria-disabled") ?? "__unset__",
            );
          }
          element.classList.add("deck-interaction-blocked");
          element.setAttribute("aria-disabled", "true");
          return;
        }

        element.classList.remove("deck-interaction-blocked");
        const previousAriaDisabled = element.getAttribute(
          "data-deck-lock-previous-aria-disabled",
        );
        if (previousAriaDisabled !== null) {
          if (previousAriaDisabled === "__unset__") {
            element.removeAttribute("aria-disabled");
          } else {
            element.setAttribute("aria-disabled", previousAriaDisabled);
          }
          element.removeAttribute("data-deck-lock-previous-aria-disabled");
        }
      });
  }

  function setDeckEntryInteractionsLocked(isLocked) {
    if (typeof document === "undefined") return;

    if (isLocked) {
      if (deckEntryInteractionSnapshots) return;
      deckEntryInteractionSnapshots = Array.from(
        document.querySelectorAll("body"),
      ).map((element) => ({
        element,
        wasInert: element.hasAttribute("inert"),
        previousAriaBusy: element.getAttribute("aria-busy"),
      }));
      deckEntryInteractionSnapshots.forEach(({ element }) => {
        element.setAttribute("inert", "");
        element.setAttribute("aria-busy", "true");
      });
      return;
    }

    if (!deckEntryInteractionSnapshots) return;
    deckEntryInteractionSnapshots.forEach(
      ({ element, wasInert, previousAriaBusy }) => {
        if (!wasInert) element.removeAttribute("inert");
        if (previousAriaBusy === null) {
          element.removeAttribute("aria-busy");
        } else {
          element.setAttribute("aria-busy", previousAriaBusy);
        }
      },
    );
    deckEntryInteractionSnapshots = null;
  }

  let deckPasswordTransitionSnapshots = null;
  let deckPasswordControlSnapshots = null;
  let deckPasswordPreviousAriaBusy = null;

  function setDeckPasswordTransitionLoading(
    isLoading,
    statusText = "Loading...",
  ) {
    const modal = document.getElementById("deck-password-modal");
    if (!modal) return;

    const status = document.getElementById("deck-password-loading-status");
    const statusLabel = status?.querySelector("span");
    if (statusLabel) statusLabel.textContent = statusText;
    if (status) status.hidden = !isLoading || !statusText;

    if (isLoading) {
      if (!deckPasswordTransitionSnapshots) {
        deckPasswordPreviousAriaBusy = modal.getAttribute("aria-busy");
        modal.setAttribute("aria-busy", "true");
        deckPasswordTransitionSnapshots = [];
        let branch = modal;
        while (branch?.parentElement) {
          const parent = branch.parentElement;
          Array.from(parent.children).forEach((sibling) => {
            if (sibling === branch) return;
            deckPasswordTransitionSnapshots.push({
              element: sibling,
              wasInert: sibling.hasAttribute("inert"),
              previousAriaBusy: sibling.getAttribute("aria-busy"),
            });
            sibling.setAttribute("inert", "");
            sibling.setAttribute("aria-busy", "true");
          });
          if (parent === document.body) break;
          branch = parent;
        }

        deckPasswordControlSnapshots = Array.from(
          modal.querySelectorAll("input, button"),
        )
          .filter(
            (control) =>
              control.id !== "btn-submit-deck-password" && !control.disabled,
          )
          .map((control) => {
            control.disabled = true;
            return control;
          });
      }
      return;
    }

    if (deckPasswordControlSnapshots) {
      deckPasswordControlSnapshots.forEach((control) => {
        control.disabled = false;
      });
      deckPasswordControlSnapshots = null;
    }
    if (deckPasswordTransitionSnapshots) {
      deckPasswordTransitionSnapshots.forEach(
        ({ element, wasInert, previousAriaBusy }) => {
          if (!wasInert) element.removeAttribute("inert");
          if (previousAriaBusy === null) {
            element.removeAttribute("aria-busy");
          } else {
            element.setAttribute("aria-busy", previousAriaBusy);
          }
        },
      );
      deckPasswordTransitionSnapshots = null;
    }
    if (deckPasswordPreviousAriaBusy === null) {
      modal.removeAttribute("aria-busy");
    } else {
      modal.setAttribute("aria-busy", deckPasswordPreviousAriaBusy);
    }
    deckPasswordPreviousAriaBusy = null;
  }

  async function handleDeckClick(subj, action = "continue") {
    subj = decodeHandlerValue(subj);
    if (!subj) return;

    const nextKey = `${String(subj).trim()}|${String(action || "continue")}`;
    if (deckInteractionLocked) {
      if (activeDeckInteractionKey === nextKey) {
        return;
      }
      return;
    }

    deckInteractionLocked = true;
    activeDeckInteractionKey = nextKey;
    activeDeckInteractionSubject = String(subj).trim();
    setDeckEntryInteractionsLocked(true);
    setOtherDeckInteractionsLocked(activeDeckInteractionSubject, true);

    const finishDeckInteraction = () => {
      if (activeDeckInteractionKey === nextKey) {
        deckInteractionLocked = false;
        activeDeckInteractionKey = null;
        activeDeckInteractionSubject = null;
        setDeckEntryInteractionsLocked(false);
        setOtherDeckInteractionsLocked(subj, false);
      }
    };

    try {
      // If deck was locally deleted, clear it from deleted list so we fetch fresh
      if ((state.prefs.localDownloadDeletedDecks || []).includes(subj)) {
        clearLocalDownloadDeleted(subj);
        saveState();
      }

      const readiness = getDeckDataReadinessState();
      if (
        !localDatabaseReady ||
        !isInitialSyncComplete ||
        readiness.isBlocked
      ) {
        updateSyncStatus(
          '<i class="fa-solid fa-xmark mr-1"></i> Decks are temporarily unavailable while local questions and the initial database sync finish loading.',
          "warning",
        );
        return;
      }

      updateRecentDecks(subj);
      saveState();

      const deckInfo = state.categorySummary.find((c) => c.Subject === subj);
      if (isDeckHidden(subj) || (deckInfo && deckInfo.Hidden)) {
        showToast("This deck is hidden and not available.", "warning");
        return;
      }
      if (isDeckLocked(subj) || (deckInfo && deckInfo.Locked)) {
        pendingDeckSubject = subj;
        pendingDeckAction = action;
        openDeckPasswordModal(subj, action);
        return;
      }

      const startPromise =
        currentAppMode === "review"
          ? reviewDeck(subj, null)
          : fetchAndStartCategory(subj, action, null);
      await Promise.resolve(startPromise);
    } catch (error) {
      appLogger.error("Unable to start the selected deck.", error);
      showToast(
        "We're having a temporary issue with our servers or services, so this deck couldn't start. Please check your internet connection and try again later.",
        "error",
        8000,
      );
    } finally {
      finishDeckInteraction();
    }
  }

  function toggleShuffleChoices(source) {
    source =
      source ||
      document.getElementById("toggle-shuffle-choices") ||
      document.getElementById("toggle-modal-shuffle-choices");
    const isChecked = source ? source.checked : true;
    const isModal = source?.id === "toggle-modal-shuffle-choices";
    
    if (isModal) {
      const subject = rootScope.PreferencesCore?.getNavigationContextSubject?.();
      if (!setActiveDeckSessionPreference("quiz", "shuffleChoices", isChecked, subject))
        return;
    } else {
      // Settings page - ALWAYS set global preference
      state.prefs.shuffleChoices = isChecked;
    }
    saveState();
    syncPreferenceControls();

    if (state.session.active) {
      const remainingQuestions = state.session.questions.slice(
        state.session.currentIndex,
      );
      const deckSubject =
        state.session.questions?.[state.session.currentIndex]?.Subject || "";
      const reprepared = prepareSessionPool(remainingQuestions, deckSubject);
      state.session.questions.splice(
        state.session.currentIndex,
        reprepared.length,
        ...reprepared,
      );
      renderQuestion();
    }
  }

  function toggleShuffleQuestions(source) {
    const element =
      source || document.getElementById("toggle-shuffle-questions");
    const isChecked = element ? element.checked : true;
    const isModal = source?.id === "toggle-modal-shuffle-questions";

    if (isModal) {
      const subject = rootScope.PreferencesCore?.getNavigationContextSubject?.();
      if (!setActiveDeckSessionPreference("quiz", "shuffleQuestions", isChecked, subject))
        return;
    } else {
      // Settings page - ALWAYS set global preference
      state.prefs.shuffleQuestions = isChecked;
    }
    saveState();
    syncPreferenceControls();
  }

  function toggleShowExplanations(source) {
    const element =
      source || document.getElementById("toggle-show-explanations");
    const isChecked = element ? element.checked : true;
    const isModal = source?.id === "toggle-modal-show-explanations";

    if (isModal) {
      const subject = rootScope.PreferencesCore?.getNavigationContextSubject?.();
      if (!setActiveDeckSessionPreference("study", "studyShowExplanations", isChecked, subject))
        return;
    } else {
      // Settings page - ALWAYS set global preference
      state.prefs.studyShowExplanations = isChecked;
    }
    saveState();
    syncPreferenceControls();
  }

  function toggleShowABCD(source) {
    const element =
      source || document.getElementById("toggle-show-abcd");
    const isChecked = element ? element.checked : false;
    const isModal = source?.id === "toggle-modal-show-abcd";

    if (isModal) {
      const subject = rootScope.PreferencesCore?.getNavigationContextSubject?.();
      if (!setActiveDeckSessionPreference("study", "hideABCD", !isChecked, subject))
        return;
    } else {
      // Settings page - ALWAYS set global preference
      state.prefs.hideABCD = !isChecked;
    }
    saveState();
    syncPreferenceControls();
  }

  const folderPasswordButton = document.getElementById(
    "btn-submit-folder-password",
  );
  if (folderPasswordButton) {
    folderPasswordButton.addEventListener(
      "click",
      async () => {
        const input = document.getElementById("folder-password-input");
        const pass = input?.value || "";
        const btn = folderPasswordButton;

        if (!pass) {
          setFormError("folder-password-input", "Please enter a password.");
          input?.focus();
          return;
        }

        setFormError("folder-password-input", "");

        await runWithBusyButton(btn, "Verifying...", async () => {
          try {
            if (
              typeof AppNetwork === "undefined" ||
              typeof AppNetwork.verifyFolderAccess !== "function"
            ) {
              throw new Error("Backend network API is unavailable.");
            }

            await AppNetwork.verifyFolderAccess(
              String(pendingLockedFolderPath || "").trim(),
              String(pass),
              { timeoutMs: 15000 },
            );

            const folderPath =
              pendingLockedFolderPath || pendingLockedFolderName || "";
            setFolderUnlocked(folderPath, true);
            closeFolderPasswordModal();
            if (!state.currentPath) state.currentPath = [];
            if (
              pendingLockedFolderName &&
              !state.currentPath.includes(pendingLockedFolderName)
            ) {
              state.currentPath.push(pendingLockedFolderName);
            }
            renderCategoryProgress();
          } catch (error) {
            appLogger.error("Verification failed", error);
            setFormError(
              "folder-password-input",
              "Network error while verifying the folder password.",
            );
            showToast(
              "Network error while verifying the folder password.",
              "error",
            );
          }
        });
      },
      { signal: uiEventController.signal },
    );
  }

  const btnSubmitDeckPassword = document.getElementById(
    "btn-submit-deck-password",
  );

  if (btnSubmitDeckPassword) {
    btnSubmitDeckPassword.addEventListener(
      "click",
      async () => {
        const input = document.getElementById("deck-password-input");
        const pass = input?.value || "";

        if (!pass) {
          setFormError("deck-password-input", "Please enter a password.");
          input?.focus();
          return;
        }

        setFormError("deck-password-input", "");

        await runWithBusyButton(
          btnSubmitDeckPassword,
          pendingDeckAction === "resume-review"
            ? "Switching..."
            : "Loading...",
          async () => {
            setDeckPasswordTransitionLoading(true, "");
            try {
              if (pendingDeckAction === "resume") {
                await resumeSession(pass, { allowResume: true });
              } else if (pendingDeckAction === "resume-review") {
                await continuePracticeReviewSwitch(pendingDeckSubject, pass);
              } else if (currentAppMode === "review") {
                await reviewDeck(pendingDeckSubject, pass);
              } else {
                await fetchAndStartCategory(
                  pendingDeckSubject,
                  pendingDeckAction,
                  pass,
                );
              }
              if (input?.value === pass) closeDeckPasswordModal();
            } catch (error) {
              appLogger.error(
                "Unable to continue after password verification.",
                error,
              );
              if (
                /incorrect password/i.test(String(error?.message || "")) ||
                String(error?.code || "").toUpperCase() === "PASSWORD_REQUIRED"
              ) {
                setFormError("deck-password-input", "Incorrect password.");
                input?.focus();
                return;
              }
              showToast(
                "The requested mode could not be opened. Please try again.",
                "error",
              );
            } finally {
              setDeckPasswordTransitionLoading(false);
            }
          },
        );
      },
      { signal: uiEventController.signal },
    );
  }

  function togglePasswordVisibility(inputId, btnElement) {
    const input = document.getElementById(inputId);
    const icon = btnElement.querySelector("i");

    if (input.type === "password") {
      input.type = "text";
      icon.classList.replace("fa-eye", "fa-eye-slash");
      btnElement.setAttribute("aria-label", "Hide password");
      btnElement.setAttribute("title", "Hide password");
    } else {
      input.type = "password";
      icon.classList.replace("fa-eye-slash", "fa-eye");
      btnElement.setAttribute("aria-label", "Show password");
      btnElement.setAttribute("title", "Show password");
    }
  }

  function formatQuestionText(text, options = {}) {
    return TextUtils.formatQuestionText(text, options);
  }

  function revealClozeAnswer(trigger) {
    return getQuestionNavigation().revealClozeAnswer(trigger);
  }

  function toggleClozeMode(source) {
    return getQuestionNavigation().toggleClozeMode(source);
  }

  function toggleChoiceVisibility(source) {
    return getQuestionNavigation().toggleChoiceVisibility(source);
  }

  if (!state.prefs.studyLayout) state.prefs.studyLayout = "scroll";
  if (!state.prefs.studyPageSize) state.prefs.studyPageSize = 10;
  if (!state.prefs.studyProgress) state.prefs.studyProgress = {};
  if (!state.prefs.qToggles) state.prefs.qToggles = {};

  function changeStudyLayout(layout) {
    return getQuestionNavigation().changeStudyLayout(layout);
  }

  if (!state.prefs.studyFilterMode) state.prefs.studyFilterMode = "all";

  function changeStudyPageSize(size) {
    return getQuestionNavigation().changeStudyPageSize(size);
  }

  function changeStudyPage(delta) {
    return getQuestionNavigation().changeStudyPage(delta);
  }

  function jumpToStudyPage(pageNumber) {
    return getQuestionNavigation().jumpToStudyPage(pageNumber);
  }

  function changeStudyIndex(delta) {
    return getQuestionNavigation().changeStudyIndex(delta);
  }

  function toggleSpecificChoices(qId) {
    return getQuestionNavigation().toggleSpecificChoices(qId);
  }

  function toggleQuestionFavorite(qId) {
    return getProgressService().toggleQuestionFavorite(qId);
  }

  function toggleCurrentQuestionFavorite() {
    return getProgressService().toggleCurrentQuestionFavorite();
  }

  function toggleStudyFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        appLogger.warn(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  if (!state.prefs.qTypeOverride) state.prefs.qTypeOverride = "auto";

  function getQuestionTypeMode(q) {
    const qTypeOverride =
      rootScope.getDeckSessionSetting?.("quiz", "qTypeOverride", q?.Subject) ||
      state.prefs.qTypeOverride;
    const questionTypeCore = rootScope.QuestionTypeCore;
    if (!questionTypeCore) {
      throw new Error(
        "QuestionTypeCore must load before reading question type.",
      );
    }
    return questionTypeCore.getMode(q, qTypeOverride);
  }

  function getQuestionTypeDisplayName(mode) {
    const questionTypeCore = rootScope.QuestionTypeCore;
    if (!questionTypeCore) {
      throw new Error(
        "QuestionTypeCore must load before displaying question type.",
      );
    }
    return questionTypeCore.getDisplayName(mode);
  }

  async function changeQuestionTypeMode(mode) {
    const normalizedMode = String(mode || "auto").toLowerCase();
    const subject = state.session?.active
      ? state.session.questions?.[state.session.currentIndex]?.Subject
      : rootScope.PreferencesCore?.getNavigationContextSubject?.() || "";
    const currentOverride =
      rootScope.getDeckSessionSetting?.("quiz", "qTypeOverride", subject) ||
      state.prefs.qTypeOverride;
    if (currentOverride === normalizedMode) return;

    const displayName = getQuestionTypeDisplayName(normalizedMode);
    const userConfirmed = await requestConfirmation(
      {
        before: "Are you sure you want to switch to ",
        emphasis: displayName,
        after: " mode?",
      },
      "Change Question Type",
    );

    if (!userConfirmed) {
      const questionTypeSelect = document.getElementById(
        "toggle-question-type",
      );
      if (questionTypeSelect) {
        questionTypeSelect.value = currentOverride || "auto";
      }
      return;
    }

    const isSettingsPage = document.getElementById("view-settings")?.classList.contains("active");
    
    if (isSettingsPage) {
      // Settings page - ALWAYS set global preference
      state.prefs.qTypeOverride = normalizedMode;
    } else if (subject) {
      // Modal/active session - set deck-specific override
      if (
        !setActiveDeckSessionPreference(
          "quiz",
          "qTypeOverride",
          normalizedMode,
          subject,
        )
      ) {
        return;
      }
    } else {
      // No subject but not in settings - set global
      state.prefs.qTypeOverride = normalizedMode;
    }

    if (normalizedMode === "ident") {
      showToast(
        "Identification mode enabled. Choices are hidden for MCQs.",
        "warning",
      );
    } else if (normalizedMode === "mcq") {
      showToast(
        "Multiple Choices mode enabled. Choices may be undefined when no alternatives exist.",
        "warning",
      );
    } else {
      showToast("Auto (Mixed) mode enabled.", "info");
    }

    saveState();
    if (state.session.active) renderQuestion();
  }

  function flushReviewScrollProgress() {
    return getAppEventController().flushReviewScrollProgress();
  }

  async function refreshFromBackendPayloadBroadcast() {
    if (isLeaderTab || !AppNetwork?.getDeckSyncSnapshot) return;
    try {
      const storedTimestamp = readStoredSyncStatusTimestamp();
      const storedCacheVersion = readStoredSyncStatusCacheVersion();
      const hasCachedSummary =
        Array.isArray(state.categorySummary) &&
        state.categorySummary.length > 0;
      const snapshot = await AppNetwork.getDeckSyncSnapshot({
        since: hasCachedSummary ? storedTimestamp : "",
        sinceCacheVersion: hasCachedSummary ? storedCacheVersion : "",
        timeoutMs: SYNC_REQUEST_TIMEOUT_MS,
        maxRetries: 0,
      });
      if (
        snapshot?.status !== "ok" ||
        snapshot.isColdStart === true ||
        Number(snapshot.payloadSchemaVersion) !==
          Number(appConfig.backendPayloadSchemaVersion ?? 2)
      ) {
        appLogger.warn(
          "[CACHE] Ignoring an update notification with unavailable or incompatible backend data.",
          snapshot,
        );
        return;
      }
      await getSyncController().syncPrefetchedSnapshot(snapshot);
    } catch (error) {
      appLogger.warn(
        "[CACHE] Unable to synchronize the notified backend payload update.",
        error,
      );
    }
  }

  function setupCacheInvalidationListener() {
    return syncCacheManager.setupBroadcastListener();
  }

  function triggerSilentSummaryRefresh(reason = "cache invalidation") {
    appLogger.info(`[CACHE] ${reason} - syncing silently in background`);
    return syncDatabase(false, true);
  }

  function handleCacheInvalidation() {
    triggerSilentSummaryRefresh("Handling cache invalidation");
  }

  // ============================================
  // OPTIMIZATION: Toast Notification System
  // ============================================
  function showToastNotification(message, type = "info", duration = 3500) {
    showToast(message, type, duration);
  }

  // ============================================
  // OPTIMIZATION: In-Memory State Re-fetch
  // ============================================
  async function reloadAppStateInMemory() {
    try {
      appLogger.info("[STATE] Fetching latest app state in-memory...");
      await triggerSilentSummaryRefresh("Refreshing app state in memory");

      appLogger.info("[STATE] In-memory state refresh complete");
      return true;
    } catch (error) {
      appLogger.error("[STATE] Failed to refresh state:", error);
      showToastNotification(
        "Unable to load latest content. Please refresh the page.",
        "warning",
        4000,
      );
      return false;
    }
  }

  // ============================================
  // OPTIMIZATION: Leader Election Pattern
  // ============================================
  function setupLeaderElection() {
    return syncCoordinator.start();
  }

  let appResourcesCleanedUp = false;

  function cleanupAppResources(event) {
    if (appResourcesCleanedUp) return;

    flushReviewScrollProgress();

    if (typeof SessionCore?.saveSessionProgress === "function") {
      SessionCore.saveSessionProgress(true);
    }

    if (event?.persisted) {
      syncScheduler.handleVisibility(true);
      return;
    }

    resourceTelemetry.sendPageExitBeacon();
    void resourceTelemetry.flushQueuedEvents();
    appResourcesCleanedUp = true;
    reviewerPdfViewerCore.clearWatchdog();
    reviewerPdfViewerCore.clearRenderCheck();
    resourceTelemetry.clearFlushTimer();
    resourceDashboardController.close();
    stopReviewerStatusPolling();
    stopReviewerSessionRestoreRetry();
    reviewerSessionCoordinator.close();
    studentPortalWelcomeNameObserver?.disconnect();
    studentPortalWelcomeNameObserver = null;
    reviewerAuthCore.cleanup();
    if (studentPortalWelcomeNameResizeHandler) {
      globalScope.removeEventListener(
        "resize",
        studentPortalWelcomeNameResizeHandler,
      );
      studentPortalWelcomeNameResizeHandler = null;
    }
    if (typeof AppState?.stopStatePersistence === "function") {
      void AppState.stopStatePersistence();
    }

    lifecycle.cleanup();

    __mrhPollLoopToken += 1;
    lifecycle.clearTimeout(__mrhInitializationTimer);
    lifecycle.clearTimeout(syncRetryTimer);
    lifecycle.clearInterval(syncCountdownTimer);
    appStatusUI?.cleanup();
    syncScheduler.cancel();
    syncCoordinator.cleanup();
    syncCacheManager.cleanup();
    pendingDeckPayloadRefreshes.cleanup();

    cancelAppAnimationFrames();
    uiEventController.abort();

    if (syncAbortController) {
      syncAbortController.abort();
      syncAbortController = null;
    }

    lifecycle.clearTimeout(window.cacheInvalidationTimeout);
    lifecycle.clearTimeout(window.scrollSaveTimeout);
    if (typeof AppNetwork?.destroy === "function") AppNetwork.destroy();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", cleanupAppResources, {
      signal: uiEventController.signal,
    });
    window.addEventListener(
      "pageshow",
      (event) => {
        if (!event.persisted) return;
        appResourcesCleanedUp = false;
        syncScheduler.handleVisibility(false);
      },
      { signal: uiEventController.signal },
    );
  }

  function calculateBackoffDelay(retryCount) {
    // Exponential: 2^retryCount seconds
    // Jitter: add random 0-50% to avoid thundering herd
    const baseDelay = Math.pow(2, Math.min(retryCount, 5)) * 1000; // Cap at 32 seconds
    const jitter = Math.random() * baseDelay * 0.5;
    return baseDelay + jitter;
  }

  // ============================================
  // OPTIMIZATION: Enhanced Visibility Change Handler
  // ============================================
  function setupVisibilityChangeHandler() {
    if (typeof document === "undefined") return;

    document.addEventListener(
      "visibilitychange",
      () => {
        if (!document.hidden) {
          appLogger.info(
            "[VISIBILITY] Tab became visible, checking sync status",
          );
          syncScheduler.handleVisibility(false);
        } else {
          appLogger.info("[VISIBILITY] Tab hidden, will pause polling");
          syncScheduler.handleVisibility(true);
          flushReviewScrollProgress();
        }
      },
      { signal: uiEventController.signal },
    );

    window.addEventListener(
      "online",
      () => {
        if (!document.hidden && isLeaderTab) {
          appLogger.info(
            "[SYNC] Connectivity restored; resuming background sync",
          );
          syncScheduler.handleVisibility(false);
        }
      },
      { signal: uiEventController.signal },
    );
  }

  // ============================================
  // OPTIMIZATION: Smarter Polling Scheduler with Jitter
  // ============================================
  function scheduleNextPolling() {
    if (!isLeaderTab) {
      syncScheduler.cancel();
      return;
    }

    syncScheduler.scheduleForLeader();
  }

  function startCacheVersionChecking() {
    setupLeaderElection();
    setupVisibilityChangeHandler();
    scheduleNextPolling();
  }

  function forcePageRefresh() {
    appLogger.info("[CACHE] Cache invalidated - triggering background sync");
    clearTimeout(window.cacheInvalidationTimeout);
    window.cacheInvalidationTimeout = lifecycle.setTimeout(() => {
      triggerSilentSummaryRefresh("Forcing quiet cache refresh");
    }, 100);
  }

  function bindAppUi() {
    return getAppEventController().bind();
  }

  function applyThemeFromPrefs() {
    return getAppThemeController().applyPreferences();
  }

  function renderAppSkeleton() {
    return getAppStatusUI().renderAppSkeleton();
  }

  async function restoreSessionFromUrl() {
    return getSessionPersistence().restoreSessionFromUrl();
  }

  async function initializeApp() {
    const initialized = await getAppBootstrap().initialize();
    if (initialized) preloadResourcePortalDocuments();
    return initialized;
  }

  let resourcePortalCurrentFolderId = "";
  let resourcePortalLastItems = [];
  let resourcePortalOpenExternal = false;
  let resourcePortalHasLoadedListing = false;
  let resourcePortalHasLoadedDocuments = false;
  let resourcePortalItemCount = 0;
  let resourcePortalLastItemsSignature = "";
  let resourcePortalStatusMessage = "";
  let resourcePortalPreviewObjectUrl = "";
  let resourcePortalPreviewBlobViewerUrl = "";
  let resourcePortalPreviewPdfBytes = null;
  let resourcePortalPreviewBlobViewerReady = false;
  let resourcePortalPreviewBlobViewerError = "";
  let resourcePortalPreviewUrlOpened = false;
  let resourcePortalPreviewIsReviewer = false;
  let resourcePreviewReturnConfirmationPending = false;
  let resourcePortalPreviewCourse = "";
  let resourcePortalReviewerPdf = null;
  let reviewerPdfSourceCache = null;
  let reviewerPdfSourceReuseSupported = true;
  let resourceDashboardFolderGeneration = 0;
  let resourceDashboardFolderListing = null;
  let resourceDashboardFolderReturn = null;
  let reviewerPdfPreviewInFlight = null;
  let reviewerPdfPreviewAbortController = null;
  const REVIEWER_PDF_CLICK_WINDOW_MS = 5000;
  const REVIEWER_PDF_CLICK_LIMIT = 3;
  const REVIEWER_PDF_CLICK_COOLDOWN_MS = 6000;
  let reviewerPdfRecentSelections = [];
  let reviewerPdfLastSelectedFileId = "";
  let reviewerPdfRateLimitSessionId = "";
  let reviewerPdfCooldownUntil = 0;
  let reviewerPdfCooldownTimer = 0;
  let reviewerPdfRateLimitWarningShown = false;
  let resourcePortalPreviewBlobViewerStatus = "";
  let resourceDashboardData = null;
  let resourceDashboardActiveTab = "PROFILE";
  let resourceDashboardLoadingPromise = null;
  let reviewerAuthConfig = null;
  let reviewerAuthConfigPromise = null;
  let reviewerAuthCheckPending = false;
  let reviewerSessionId = "";
  let reviewerAuthorizedEmail = "";
  let reviewerAccountStatus = "";
  let reviewerSyncFailed = false;
  let reviewerPendingEnrollmentSessionId = "";
  let reviewerDashboardLoadedForEmail = "";
  let reviewerAuthGeneration = 0;
  let reviewerProfilePictureUrl = "";
  let reviewerProfileEditing = false;
  let reviewerDashboardRequestGeneration = 0;
  let reviewerDashboardRequestPromise = null;
  let reviewerStatusPollInFlight = false;
  let reviewerStatusPollRetryAttempt = 0;
  let reviewerStatusPollWindowStartedAt = 0;
  let reviewerStatusPollUnchangedCount = 0;
  let reviewerPendingRevocation = null;
  let reviewerVerificationInFlightToken = "";
  let reviewerVerificationRetryToken = "";
  let reviewerVerificationRetryAvailable = false;
  const reviewerSessionRestorePromises = new Map();
  const reviewerAccountStatusPromises = new Map();
  let reviewerSessionRestoreTarget = "";
  let reviewerSessionRestorePending = false;
  let reviewerReauthenticationPromptAttempted = false;
  let reviewerSignOutStorageListenerInstalled = false;
  const REVIEWER_STATUS_POLL_INTERVAL_MS = 10000;
  const REVIEWER_STATUS_POLL_RETRY_MAX_MS = 30000;
  const REVIEWER_SESSION_RESTORE_RETRY_BASE_MS = 1000;
  const REVIEWER_SESSION_RESTORE_RETRY_MAX_MS = 30000;
  const REVIEWER_EXPLICIT_SIGNOUT_KEY = "mrh_reviewer_explicit_signout_v1";
  const REVIEWER_EXPLICIT_SIGNOUT_COOKIE = "mrh_reviewer_explicit_signout_v1";
  const REVIEWER_SESSION_STORAGE_KEY = "mrh_reviewer_session_v1";
  const reviewerAuthCore = rootScope.ReviewerAuthCore.create({
    getAppNetwork: () => rootScope.AppNetwork,
  });
  const reviewerProfileUICore = rootScope.ReviewerProfileUICore.create({
    document,
    getAuthorizedEmail: () => reviewerAuthorizedEmail,
    getProfilePictureUrl: getReviewerProfilePictureUrl,
    getProfileEditing: () => reviewerProfileEditing,
    setProfileEditing: (editing) => {
      reviewerProfileEditing = editing;
    },
    setProfilePictureUrl: (pictureUrl) => {
      reviewerProfilePictureUrl = pictureUrl;
    },
    renderWelcome: renderStudentPortalWelcome,
  });
  const reviewerSessionCoordinator =
    rootScope.ReviewerSessionCoordinatorCore.create({
      document,
      debugLogger: rootScope.DebugUtils || console,
      getSessionIds: () => ({
        sessionId: reviewerSessionId,
        pendingEnrollmentSessionId: reviewerPendingEnrollmentSessionId,
      }),
      getAuthorizedEmail: () => reviewerAuthorizedEmail,
      getAuthGeneration: () => reviewerAuthGeneration,
      isDashboardAuthorized: () => reviewerAccountStatus === "TRUE",
      applyAccountStatus: (response, sessionId) =>
        applyReviewerAccountStatus(response, sessionId, true, true),
      applyDashboardSnapshot: (tab) => {
        resourceDashboardData = {
          ...(resourceDashboardData || {}),
          REVIEWERS: mergeResourceDashboardUpdates(
            "REVIEWERS",
            resourceDashboardData?.REVIEWERS ||
              getStoredReviewerDashboard(reviewerAuthorizedEmail),
            tab,
          ),
        };
        reviewerDashboardLoadedForEmail = reviewerAuthorizedEmail;
        cacheReviewerDashboard(
          reviewerAuthorizedEmail,
          resourceDashboardData.REVIEWERS,
        );
        renderResourceDashboardTab();
      },
      logRequestDiagnostic: logReviewerRequestDiagnostic,
    });
  void purgeLegacyReviewerPdfPreviews();
  const REVIEWER_PROFILE_CACHE_KEY = "mrh_reviewer_profile_v1";
  const STUDENT_PORTAL_WELCOME_HIDDEN_KEY =
    "mrh_student_portal_welcome_hidden_v1";
  const REVIEWER_PROFILE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const REVIEWER_DASHBOARD_CACHE_KEY = "mrh_reviewer_dashboard_session_v1";
  const REVIEWER_DASHBOARD_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const RESOURCE_DASHBOARD_UPDATED_TTL_MS = 48 * 60 * 60 * 1000;
  const REVIEWER_DASHBOARD_CACHE_MAX_CHARS = 1000000;
  const RESOURCE_CHANGE_BADGES_SEEN_KEY = "mrh_reviewer_change_badges_seen_v1";
  const RESOURCE_DASHBOARD_FILTERS_KEY = "mrh_resource_dashboard_filters_v2";
  const RESOURCE_DASHBOARD_LAST_SECTION_KEY =
    "mrh_resource_dashboard_last_section_v1";
  const RESOURCE_DASHBOARD_ACADEMIC_LAST_SECTION_KEY =
    "mrh_maritime_library_last_section_v1";
  const RESOURCE_PREVIEW_MAX_BYTES = 32 * 1024 * 1024;
  const RESOURCE_PREVIEW_MAX_BASE64_LENGTH =
    Math.ceil(RESOURCE_PREVIEW_MAX_BYTES / 3) * 4;
  const REVIEWER_PDF_MAX_SOURCE_BYTES = 16 * 1024 * 1024;
  const RESOURCE_DASHBOARD_CACHE_KEY = "resource_dashboard_cache_v1";
  const RESOURCE_DASHBOARD_AUTO_REFRESH_INTERVAL_MS = 30000;
  const RESOURCE_DASHBOARD_COURSE_NAMES_KEY =
    "mrh_resource_dashboard_course_names_v1";
  let resourceDashboardCourseNamesEnabled = false;
  const resourceCatalogCore = rootScope.ResourceCatalogCore;
  if (!resourceCatalogCore) {
    throw new Error(
      "ResourceCatalogCore must load before the application core.",
    );
  }
  const COURSE_TITLES = resourceCatalogCore.COURSE_TITLES;

  function getCourseCodeMatch(course) {
    return resourceCatalogCore.getCourseCodeMatch(course);
  }

  function getCourseTitle(course) {
    return resourceCatalogCore.getCourseTitle(course);
  }

  function buildCourseCatalogEntries(entries) {
    return resourceCatalogCore.buildCourseCatalogEntries(entries);
  }

  function getCourseHeading(
    course,
    useCourseNames = resourceDashboardCourseNamesEnabled,
  ) {
    return resourceCatalogCore.getCourseHeading(course, useCourseNames);
  }

  function getCourseCodeFromBreadcrumbs(breadcrumbs, fallback = "") {
    return resourceCatalogCore.getCourseCodeFromBreadcrumbs(
      breadcrumbs,
      fallback,
    );
  }

  function extractLeadingOrderNumber(name) {
    return resourceCatalogCore.extractLeadingOrderNumber(name);
  }

  function cleanResourceDisplayName(name) {
    return resourceCatalogCore.cleanResourceDisplayName(name);
  }

  function compareResourceOrder(leftName, rightName) {
    return resourceCatalogCore.compareResourceOrder(leftName, rightName);
  }
  const resourceCatalogView = rootScope.ResourceCatalogViewCore.create();

  let studentPortalWelcomeNameObserver = null;
  let studentPortalWelcomeNameResizeHandler = null;
  let studentPortalWelcomeInitialized = false;
  let studentPortalWelcomeHiddenPreference = false;
  let studentPortalWelcomeEmailVisible = false;
  let studentPortalWelcomeEmailAddress = "";
  let studentPortalWelcomeAccessSpinnerShown = false;
  let resourceDashboardFilterIndicatorResizeInstalled = false;
  let resourceDashboardSelectedYear = "all";
  let resourceDashboardSelectedSemester = "all";
  const resourceDashboardSelectedYears = {
    MODULES: "all",
    REVIEWERS: "all",
    SYLLABUS: "all",
    SUBJECTS: "all",
  };
  const resourceDashboardSelectedSemesters = {
    MODULES: "all",
    REVIEWERS: "all",
    SYLLABUS: "all",
    SUBJECTS: "all",
  };
  const resourceDashboardSelectedCategories = {
    MODULES: "all",
    REVIEWERS: "all",
    SYLLABUS: "all",
    SUBJECTS: "all",
  };
  const resourceDashboardCategorySelectionMade = {
    MODULES: false,
    REVIEWERS: false,
    SYLLABUS: false,
    SUBJECTS: false,
  };
  function loadResourceDashboardFilters() {
    try {
      const saved = JSON.parse(
        globalScope.localStorage.getItem(RESOURCE_DASHBOARD_FILTERS_KEY) ||
          "null",
      );
      if (!saved || typeof saved !== "object") return;
      ["MODULES", "REVIEWERS", "SYLLABUS", "SUBJECTS"].forEach((tabName) => {
        const sectionFilters = saved.sections?.[tabName];
        const legacyFilters = saved;
        const year = sectionFilters?.year ?? legacyFilters.year;
        const semester = sectionFilters?.semester ?? legacyFilters.semester;
        const category =
          sectionFilters?.category ?? saved.categories?.[tabName];
        if (year === "all" || /^\d+$/.test(String(year || "")))
          resourceDashboardSelectedYears[tabName] = String(year);
        if (semester === "all" || /^\d+$/.test(String(semester || "")))
          resourceDashboardSelectedSemesters[tabName] = String(semester);
        if (["all", "PRELIMS", "MIDTERMS", "FINALS"].includes(category)) {
          resourceDashboardSelectedCategories[tabName] = category;
          resourceDashboardCategorySelectionMade[tabName] =
            sectionFilters?.categorySelectionMade !== false;
        }
      });
    } catch (error) {
      (globalScope.DebugUtils || console).error(
        "Unable to load saved Student Portal filters.",
        error,
      );
    }
  }

  function saveResourceDashboardFilters() {
    try {
      const tabName = resourceDashboardActiveTab;
      if (["MODULES", "REVIEWERS", "SYLLABUS"].includes(tabName)) {
        resourceDashboardSelectedYears[tabName] = resourceDashboardSelectedYear;
        resourceDashboardSelectedSemesters[tabName] =
          resourceDashboardSelectedSemester;
      }
      globalScope.localStorage.setItem(
        RESOURCE_DASHBOARD_FILTERS_KEY,
        JSON.stringify({
          sections: Object.fromEntries(
            ["MODULES", "REVIEWERS", "SYLLABUS", "SUBJECTS"].map((section) => [
              section,
              {
                year: resourceDashboardSelectedYears[section],
                semester: resourceDashboardSelectedSemesters[section],
                category: resourceDashboardSelectedCategories[section],
                categorySelectionMade:
                  resourceDashboardCategorySelectionMade[section],
              },
            ]),
          ),
        }),
      );
    } catch (error) {
      (globalScope.DebugUtils || console).error(
        "Unable to save Student Portal filters.",
        error,
      );
    }
  }

  function getResourceDashboardPortalMode() {
    const portalMode = globalScope.document?.querySelector(
      ".resource-dashboard-layout",
    )?.dataset.portalMode;
    return ["academic", "profile"].includes(portalMode)
      ? portalMode
      : "student";
  }

  function getLastResourceDashboardSection(
    portalMode = getResourceDashboardPortalMode(),
  ) {
    try {
      const section = String(
        globalScope.localStorage.getItem(
          portalMode === "academic"
            ? RESOURCE_DASHBOARD_ACADEMIC_LAST_SECTION_KEY
            : RESOURCE_DASHBOARD_LAST_SECTION_KEY,
        ) || "",
      );
      const allowedSections =
        portalMode === "academic"
          ? ["DOCUMENTS", "SUBJECTS"]
          : portalMode === "profile"
            ? ["PROFILE"]
            : ["MODULES", "REVIEWERS", "SYLLABUS"];
      return allowedSections.includes(section)
        ? section
        : portalMode === "academic"
          ? "SUBJECTS"
          : portalMode === "profile"
            ? "PROFILE"
            : "REVIEWERS";
    } catch (error) {
      (globalScope.DebugUtils || console).error(
        "Unable to restore the last Student Portal section.",
        error,
      );
      return portalMode === "academic" ? "SUBJECTS" : "REVIEWERS";
    }
  }

  function saveResourceDashboardSection(section) {
    const portalMode = getResourceDashboardPortalMode();
    if (portalMode === "profile") return;
    const allowedSections =
      portalMode === "academic"
        ? ["DOCUMENTS", "SUBJECTS"]
        : portalMode === "profile"
          ? ["PROFILE"]
          : ["MODULES", "REVIEWERS", "SYLLABUS"];
    if (!allowedSections.includes(section)) return;
    try {
      globalScope.localStorage.setItem(
        portalMode === "academic"
          ? RESOURCE_DASHBOARD_ACADEMIC_LAST_SECTION_KEY
          : RESOURCE_DASHBOARD_LAST_SECTION_KEY,
        section,
      );
    } catch (error) {
      (globalScope.DebugUtils || console).error(
        "Unable to remember the last Student Portal section.",
        error,
      );
    }
  }

  function activateResourceDashboardFilters(tabName) {
    if (!["MODULES", "REVIEWERS", "SYLLABUS", "SUBJECTS"].includes(tabName))
      return;
    resourceDashboardSelectedYear =
      resourceDashboardSelectedYears[tabName] || "all";
    resourceDashboardSelectedSemester =
      resourceDashboardSelectedSemesters[tabName] || "all";
  }

  loadResourceDashboardFilters();

  function getSelectedResourceCategory(tabName = resourceDashboardActiveTab) {
    return resourceDashboardSelectedCategories[tabName] || "all";
  }

  function isDefinitivelyInvalidReviewerCredential(error) {
    return [
      "UNAUTHORIZED",
      "SESSION_EXPIRED",
      "SESSION_INVALID",
      "SESSION_REVOKED",
    ].includes(error?.code);
  }

  const resourceDashboardController =
    rootScope.ResourceDashboardControllerCore.create({
      document,
      intervalMs: RESOURCE_DASHBOARD_AUTO_REFRESH_INTERVAL_MS,
      isVisible: isResourceDashboardVisible,
      getActiveTab: () => resourceDashboardActiveTab,
      getReviewerSessionId: () => reviewerSessionId,
      isReviewerAuthorized: () => reviewerAccountStatus === "TRUE",
      loadReviewerDashboard: (options) => loadReviewerDashboard(options),
      loadResourceDashboard: (options) => loadResourceDashboard(options),
      refreshReviewerStatus: () => refreshReviewerStatusOnReturn(),
    });
  const resourcePortalBrowser = rootScope.ResourcePortalBrowserCore.create({
    document,
    storage: globalScope.StorageUtils,
    network: () => globalScope.AppNetwork,
    logger: globalScope.DebugUtils || console,
    renderListing: (response, options) =>
      renderResourcePortalListing(response, options),
    clearListing: () => {
      const list = document.getElementById("resource-portal-items");
      if (list?.childElementCount) list.replaceChildren();
      const breadcrumbs = document.getElementById(
        "resource-portal-breadcrumbs",
      );
      if (breadcrumbs?.childElementCount) renderResourcePortalBreadcrumbs([]);
      resourcePortalCurrentFolderId = "";
      resourcePortalLastItems = [];
      resourcePortalLastItemsSignature = "";
      resourcePortalItemCount = 0;
      resourcePortalStatusMessage = "";
      resourcePortalHasLoadedListing = false;
      resourcePortalHasLoadedDocuments = false;
    },
    setStatus: (message, busy = false) => {
      const status = document.getElementById("resource-documents-status");
      resourcePortalStatusMessage = message;
      if (!status) return;
      status.textContent = message;
      status.hidden = !message;
      if (busy) status.setAttribute("aria-busy", "true");
      else status.removeAttribute("aria-busy");
    },
    onError: (message, error) =>
      (globalScope.DebugUtils || console).error(message, error),
    getLoadedState: () => ({
      listing: resourcePortalHasLoadedListing,
      documents: resourcePortalHasLoadedDocuments,
    }),
    getPreviewGeneration: () => resourcePreviewController.getGeneration(),
    getFolderGeneration: () => resourceDashboardFolderGeneration,
    nextFolderGeneration: () => ++resourceDashboardFolderGeneration,
    getFolderListing: () => resourceDashboardFolderListing,
    setFolderListing: (listing) => {
      resourceDashboardFolderListing = listing;
    },
    getFolderPanel: (frame) => getResourceDashboardFolderPanel(frame),
    renderFolderListing: (listing, frame, status) =>
      renderResourceDashboardFolderListing(listing, frame, status),
    releasePreviewObjectUrl: () => releaseResourcePortalPreviewObjectUrl(),
  });

  const resourceTelemetryCore = rootScope.ResourceTelemetryCore;
  if (!resourceTelemetryCore) {
    throw new Error(
      "ResourceTelemetryCore must load before the application core.",
    );
  }
  const resourceTelemetry = resourceTelemetryCore.create({
    logger: appLogger,
    debugLogger: rootScope.DebugUtils || console,
    getAppNetwork: () => rootScope.AppNetwork,
    getReviewerSessionId: () => reviewerSessionId,
    getPendingEnrollmentSessionId: () => reviewerPendingEnrollmentSessionId,
    getSelectedResourceCategory,
    getSelectedYear: () => resourceDashboardSelectedYear,
    getSelectedSemester: () => resourceDashboardSelectedSemester,
    createResourceEventId,
    isDefinitivelyInvalidReviewerCredential,
    signOutReviewer,
  });
  const {
    logResourceDashboardAction,
    logResourceFileClick,
  } = resourceTelemetry;

  function getStoredReviewerSessionId() {
    try {
      const sessionId = String(
        globalScope.localStorage.getItem(REVIEWER_SESSION_STORAGE_KEY) || "",
      ).trim();
      return /^[a-f0-9]{96}$/.test(sessionId) ? sessionId : "";
    } catch (error) {
      (globalScope.DebugUtils || console).error(
        "Unable to read the saved access session.",
        error,
      );
      return "";
    }
  }

  function saveReviewerSessionId(sessionId) {
    if (!/^[a-f0-9]{96}$/.test(String(sessionId || "")))
      throw new Error("Google sign-in returned an invalid session.");
    globalScope.localStorage.setItem(REVIEWER_SESSION_STORAGE_KEY, sessionId);
  }

  function clearStoredReviewerSession() {
    try {
      globalScope.localStorage.removeItem(REVIEWER_SESSION_STORAGE_KEY);
      return true;
    } catch (error) {
      (globalScope.DebugUtils || console).error(
        "Unable to clear the saved access session.",
        error,
      );
      return false;
    }
  }

  function getReviewerProfilePictureUrl(value) {
    const picture = typeof value === "string" ? value.trim() : "";
    return /^https:\/\/lh[3-6]\.googleusercontent\.com\//.test(picture)
      ? picture
      : "";
  }

  function getStoredReviewerProfile() {
    if (
      hasExplicitReviewerSignOut() ||
      !(reviewerSessionId || getStoredReviewerSessionId())
    )
      return null;
    try {
      const cached = JSON.parse(
        globalScope.localStorage.getItem(REVIEWER_PROFILE_CACHE_KEY) || "null",
      );
      const email = String(cached?.email || "").trim();
      const age = Date.now() - Number(cached?.cachedAt || 0);
      if (
        !email ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > REVIEWER_PROFILE_CACHE_MAX_AGE_MS
      ) {
        clearStoredReviewerProfile();
        return null;
      }
      return {
        email,
        firstName: String(cached.firstName || "").slice(0, 100),
        middleInitial: String(cached.middleInitial || "").slice(0, 10),
        lastName: String(cached.lastName || "").slice(0, 100),
        suggestedFirstName: String(cached.suggestedFirstName || "").slice(
          0,
          100,
        ),
        suggestedLastName: String(cached.suggestedLastName || "").slice(0, 100),
        picture: getReviewerProfilePictureUrl(cached.picture),
        accountStatus: [
          "TRUE",
          "FALSE",
          "DENIED",
          "RESTRICTED",
          "NOT_FOUND",
        ].includes(cached.accountStatus)
          ? cached.accountStatus
          : "",
      };
    } catch {
      return null;
    }
  }

  function cacheReviewerProfile(response) {
    const email = String(response?.email || "").trim();
    if (!email) return false;
    try {
      globalScope.localStorage.setItem(
        REVIEWER_PROFILE_CACHE_KEY,
        JSON.stringify({
          email,
          firstName: String(response.firstName || "").slice(0, 100),
          middleInitial: String(response.middleInitial || "").slice(0, 10),
          lastName: String(response.lastName || "").slice(0, 100),
          suggestedFirstName: String(response.suggestedFirstName || "").slice(
            0,
            100,
          ),
          suggestedLastName: String(response.suggestedLastName || "").slice(
            0,
            100,
          ),
          picture: getReviewerProfilePictureUrl(response.picture),
          accountStatus: [
            "TRUE",
            "FALSE",
            "DENIED",
            "RESTRICTED",
            "NOT_FOUND",
          ].includes(response.accountStatus)
            ? response.accountStatus
            : "",
          cachedAt: Date.now(),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  function clearStoredReviewerProfile() {
    try {
      globalScope.localStorage.removeItem(REVIEWER_PROFILE_CACHE_KEY);
    } catch {
      // Cached profile details are optional when browser storage is unavailable.
    }
  }

  function getStoredReviewerDashboard(email) {
    try {
      const cached = JSON.parse(
        globalScope.sessionStorage.getItem(REVIEWER_DASHBOARD_CACHE_KEY) ||
          "null",
      );
      const cachedEmail = String(cached?.email || "")
        .trim()
        .toLowerCase();
      const age = Date.now() - Number(cached?.cachedAt || 0);
      const tab = cached?.tab;
      if (
        cachedEmail !==
          String(email || "")
            .trim()
            .toLowerCase() ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > REVIEWER_DASHBOARD_CACHE_MAX_AGE_MS ||
        !Array.isArray(tab?.columns) ||
        !Array.isArray(tab?.rows) ||
        !tab.rows.every(Array.isArray)
      ) {
        globalScope.sessionStorage.removeItem(REVIEWER_DASHBOARD_CACHE_KEY);
        return null;
      }
      return normalizeReviewerDashboardTab(tab);
    } catch (error) {
      (globalScope.DebugUtils || console).warn(
        "Unable to read the current-tab reviewer dashboard cache.",
        error,
      );
      return null;
    }
  }

  function restoreStoredReviewerDashboard(email) {
    const tab = getStoredReviewerDashboard(email);
    if (!tab) return false;
    resourceDashboardData = {
      ...(resourceDashboardData || {}),
      REVIEWERS: tab,
    };
    reviewerAuthorizedEmail = String(email || "").trim();
    reviewerDashboardLoadedForEmail = reviewerAuthorizedEmail;
    return true;
  }

  function hasCachedAuthorizedReviewerDashboard() {
    const reviewerTab = resourceDashboardData?.REVIEWERS;
    return (
      !hasExplicitReviewerSignOut() &&
      Boolean(reviewerSessionId || getStoredReviewerSessionId()) &&
      reviewerAccountStatus === "TRUE" &&
      Boolean(reviewerAuthorizedEmail) &&
      reviewerDashboardLoadedForEmail?.toLowerCase() ===
        reviewerAuthorizedEmail.toLowerCase() &&
      Array.isArray(reviewerTab?.columns) &&
      Array.isArray(reviewerTab?.rows) &&
      reviewerTab.rows.every(Array.isArray)
    );
  }

  function cacheReviewerDashboard(email, tab) {
    if (
      !email ||
      !Array.isArray(tab?.columns) ||
      !Array.isArray(tab?.rows) ||
      !tab.rows.every(Array.isArray)
    )
      return false;
    const value = JSON.stringify({
      email: String(email).trim().toLowerCase(),
      cachedAt: Date.now(),
      tab,
    });
    if (value.length > REVIEWER_DASHBOARD_CACHE_MAX_CHARS) return false;
    try {
      globalScope.sessionStorage.setItem(REVIEWER_DASHBOARD_CACHE_KEY, value);
      return true;
    } catch (error) {
      (globalScope.DebugUtils || console).warn(
        "Unable to save the current-tab reviewer dashboard cache.",
        error,
      );
      return false;
    }
  }

  function clearStoredReviewerDashboard() {
    try {
      globalScope.sessionStorage.removeItem(REVIEWER_DASHBOARD_CACHE_KEY);
    } catch (error) {
      (globalScope.DebugUtils || console).warn(
        "Unable to clear the current-tab reviewer dashboard cache.",
        error,
      );
    }
  }

  function hasSeenResourceChangeBadge(
    updateKey,
    updatedAt,
    changeType,
    markSeen = false,
  ) {
    const now = Date.now();
    const accountEmail = reviewerAuthorizedEmail.trim().toLowerCase();
    if (!accountEmail) return false;
    const marker = JSON.stringify([updateKey, updatedAt, changeType]);
    const storageKey = `${RESOURCE_CHANGE_BADGES_SEEN_KEY}:${accountEmail}`;
    try {
      const stored = JSON.parse(
        globalScope.localStorage.getItem(storageKey) || "[]",
      );
      const activeEntries = Array.isArray(stored)
        ? stored.filter(
            (entry) =>
              entry &&
              typeof entry.marker === "string" &&
              Number.isFinite(Number(entry.seenAt)) &&
              Number(entry.seenAt) <= now &&
              now - Number(entry.seenAt) <= RESOURCE_DASHBOARD_UPDATED_TTL_MS,
          )
        : [];
      const alreadySeen = activeEntries.some(
        (entry) => entry.marker === marker,
      );
      if (markSeen && !alreadySeen) {
        activeEntries.push({ marker, seenAt: now });
        globalScope.localStorage.setItem(
          storageKey,
          JSON.stringify(activeEntries),
        );
      }

      return alreadySeen;
    } catch (error) {
      (globalScope.DebugUtils || console).warn(
        "Unable to track resource change badges for this account.",
        error,
      );
      return false;
    }
  }

  function updateResourceDashboardFilterIndicators() {
    document
      .querySelectorAll(".resource-dashboard-segmented-control")
      .forEach((control) => {
        const selected = control.querySelector(
          "button.is-active:not(:disabled)",
        );
        if (!selected) return;
        const controlRect = control.getBoundingClientRect();
        const selectedRect = selected.getBoundingClientRect();
        control.style.setProperty(
          "--filter-indicator-left",
          `${selectedRect.left - controlRect.left - control.clientLeft}px`,
        );
        control.style.setProperty(
          "--filter-indicator-top",
          `${selectedRect.top - controlRect.top - control.clientTop}px`,
        );
        control.style.setProperty(
          "--filter-indicator-width",
          `${selectedRect.width}px`,
        );
        control.style.setProperty(
          "--filter-indicator-height",
          `${selectedRect.height}px`,
        );
        if (!control.classList.contains("has-filter-indicator")) {
          const revealIndicator = () => {
            control.classList.add("has-filter-indicator");
          };
          if (typeof globalScope.requestAnimationFrame === "function")
            globalScope.requestAnimationFrame(revealIndicator);
          else globalScope.setTimeout(revealIndicator, 0);
        }
      });
  }

  function promptReviewerReauthentication() {
    const identityApi = globalScope.google?.accounts?.id;
    if (
      reviewerReauthenticationPromptAttempted ||
      hasExplicitReviewerSignOut() ||
      typeof identityApi?.prompt !== "function"
    )
      return false;
    reviewerReauthenticationPromptAttempted = true;
    const authGeneration = reviewerAuthGeneration;
    try {
      identityApi.prompt((notification) => {
        if (authGeneration !== reviewerAuthGeneration) return;
        const promptFinished =
          notification?.isNotDisplayed?.() ||
          notification?.isSkippedMoment?.() ||
          notification?.isDismissedMoment?.();
        if (!promptFinished) return;
        const authStatus = document.getElementById(
          "resource-reviewer-auth-status",
        );
        if (authStatus)
          authStatus.textContent =
            "Google sign-in is required. Use the Google sign-in button to continue.";
      });
      return true;
    } catch (error) {
      (globalScope.DebugUtils || console).error(
        "Unable to prompt for Google reauthentication.",
        error,
      );
      return false;
    }
  }

  function handleReviewerSignOutStorageChange(event) {
    if (event?.key === REVIEWER_SESSION_STORAGE_KEY) {
      if (!event.newValue) {
        if (
          reviewerSessionId ||
          reviewerPendingEnrollmentSessionId ||
          reviewerSessionRestorePending
        )
          signOutReviewer(false);
        return;
      }
      if (
        /^[a-f0-9]{96}$/.test(event.newValue) &&
        event.newValue !== reviewerSessionId
      ) {
        signOutReviewer(false, true);
        void restoreReviewerSession(event.newValue);
      }
      return;
    }
    if (
      event?.key !== REVIEWER_EXPLICIT_SIGNOUT_KEY ||
      event.newValue !== "true" ||
      (!reviewerSessionId &&
        !reviewerPendingEnrollmentSessionId &&
        !reviewerVerificationRetryToken)
    )
      return;
    signOutReviewer(false);
    setReviewerAuthStatus("Use Google to sign in and request access.");
  }

  function installReviewerSignOutStorageListener() {
    if (
      reviewerSignOutStorageListenerInstalled ||
      typeof globalScope.addEventListener !== "function"
    )
      return;
    globalScope.addEventListener("storage", handleReviewerSignOutStorageChange);
    reviewerSignOutStorageListenerInstalled = true;
  }

  function hasExplicitReviewerSignOut() {
    const signOutCookie = String(globalScope.document?.cookie || "")
      .split("; ")
      .find((entry) =>
        entry.startsWith(`${REVIEWER_EXPLICIT_SIGNOUT_COOKIE}=`),
      );
    if (signOutCookie === `${REVIEWER_EXPLICIT_SIGNOUT_COOKIE}=true`)
      return true;
    try {
      if (
        globalScope.localStorage.getItem(REVIEWER_EXPLICIT_SIGNOUT_KEY) ===
        "true"
      )
        return true;
    } catch (error) {
      // The first-party cookie remains available when local storage is blocked.
    }
    return false;
  }

  function setExplicitReviewerSignOut(signedOut) {
    let persisted = false;
    try {
      if (signedOut)
        globalScope.localStorage.setItem(REVIEWER_EXPLICIT_SIGNOUT_KEY, "true");
      else globalScope.localStorage.removeItem(REVIEWER_EXPLICIT_SIGNOUT_KEY);
      persisted = true;
    } catch (error) {
      // Fall back to the same-origin cookie when local storage is blocked.
    }
    try {
      if (globalScope.document) {
        globalScope.document.cookie = signedOut
          ? `${REVIEWER_EXPLICIT_SIGNOUT_COOKIE}=true; Max-Age=315360000; Path=/; SameSite=Strict; Secure`
          : `${REVIEWER_EXPLICIT_SIGNOUT_COOKIE}=false; Max-Age=315360000; Path=/; SameSite=Strict; Secure`;
        const cookieValue = String(globalScope.document.cookie || "")
          .split("; ")
          .find((entry) =>
            entry.startsWith(`${REVIEWER_EXPLICIT_SIGNOUT_COOKIE}=`),
          );
        persisted =
          (signedOut
            ? cookieValue === `${REVIEWER_EXPLICIT_SIGNOUT_COOKIE}=true`
            : cookieValue === `${REVIEWER_EXPLICIT_SIGNOUT_COOKIE}=false`) ||
          persisted;
      }
    } catch (error) {
      // Local storage may still preserve the explicit sign-out preference.
    }
    if (!persisted)
      throw new Error(
        "The sign-out preference could not be saved. Enable site storage and try again.",
      );
  }

  function clearLegacyBrowserId() {
    try {
      globalScope.localStorage.removeItem("mrh_device_identity_v1");
    } catch (error) {
      (globalScope.DebugUtils || console).warn(
        "Unable to remove a saved legacy browser identifier.",
        error,
      );
    }
    try {
      if (globalScope.document) {
        globalScope.document.cookie =
          "mrh_device_identity_v1=; Max-Age=0; Path=/; SameSite=Strict; Secure";
      }
    } catch (error) {
      (globalScope.DebugUtils || console).warn(
        "Unable to remove a legacy browser identifier cookie.",
        error,
      );
    }
  }

  clearLegacyBrowserId();

  function createResourceEventId() {
    const cryptoApi = globalScope.crypto || globalThis.crypto;
    if (typeof cryptoApi?.randomUUID === "function")
      return cryptoApi.randomUUID();
    if (!cryptoApi?.getRandomValues)
      throw new Error("Secure event ID generation is unavailable.");
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }

  function setResourceDashboardStatus(message, busy = false, stacked = false) {
    const status = document.getElementById("resource-portal-status");
    if (!status) return;
    status.classList?.remove("resource-dashboard-entry-count");
    status.textContent = message;
    status.hidden = !message;
    status.classList?.toggle(
      "resource-dashboard-status-stacked",
      Boolean(message && busy && stacked),
    );
    if (busy) status.setAttribute("aria-busy", "true");
    else status.removeAttribute("aria-busy");
  }

  function setResourceDashboardTableVisible(tabName, visible) {
    const tableBody = document.getElementById(
      tabName === "SUBJECTS"
        ? "resource-dashboard-subjects-body"
        : "resource-dashboard-table-body",
    );
    const table = tableBody?.closest(".resource-dashboard-table-scroll");
    if (table) table.hidden = !visible;
  }

  function showResourceDashboardTableLoading(tabName) {
    setResourceDashboardTableVisible(tabName, false);
    const status = document.getElementById(
      tabName === "SUBJECTS"
        ? "resource-dashboard-subjects-status"
        : "resource-portal-status",
    );
    if (!status) return;
    status.classList?.remove("resource-dashboard-entry-count");
    status.textContent = "Loading";
    status.hidden = false;
    status.setAttribute("aria-busy", "true");
  }

  function setReviewerAuthStatus(message, busy = false) {
    const status = document.getElementById("resource-reviewer-auth-status");
    if (!status) return;
    status.textContent = message;
    if (busy) status.setAttribute("aria-busy", "true");
    else status.removeAttribute("aria-busy");
  }

  function setReviewerEnrollmentStatus(message, busy = false) {
    const status = document.getElementById(
      "resource-reviewer-enrollment-status",
    );
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
    if (busy) status.setAttribute("aria-busy", "true");
    else status.removeAttribute("aria-busy");
  }

  function setReviewerNavigationBusy() {
    const button = document.getElementById("resource-dashboard-reviewers-nav");
    button?.removeAttribute("aria-busy");
  }

  function setReviewerDashboardFiltersDisabled(disabled) {
    document
      .querySelectorAll(
        ".resource-dashboard-filters [data-filter-value], .resource-dashboard-filters [data-category]",
      )
      .forEach((button) => {
        if (disabled) {
          if (!("reviewerLoadingDisabled" in button.dataset))
            button.dataset.reviewerLoadingDisabled = String(button.disabled);
          button.disabled = true;
        } else if ("reviewerLoadingDisabled" in button.dataset) {
          button.disabled = button.dataset.reviewerLoadingDisabled === "true";
          delete button.dataset.reviewerLoadingDisabled;
        }
        button.setAttribute("aria-disabled", String(button.disabled));
      });
  }

  function showReviewerDashboardLoading(clearRows = false, force = false) {
    const yearControl = document.getElementById(
      "resource-dashboard-filter-year",
    );
    const semesterControl = document.getElementById(
      "resource-dashboard-filter-semester",
    );
    const filters = document
      .getElementById("resource-dashboard-filter-year")
      ?.closest(".resource-dashboard-filters");
    const categoryFilter = document.getElementById(
      "resource-dashboard-category-filter",
    );
    const status = document.getElementById("resource-portal-status");
    const tableHead = document.getElementById("resource-dashboard-table-head");
    const alreadyLoading =
      status?.getAttribute("aria-busy") === "true" &&
      status.textContent.trim() === "Loading";
    const hasRenderedReviewerTable =
      !clearRows &&
      reviewerDashboardLoadedForEmail?.toLowerCase() ===
        reviewerAuthorizedEmail.toLowerCase() &&
      Array.isArray(resourceDashboardData?.REVIEWERS?.columns) &&
      Array.isArray(resourceDashboardData?.REVIEWERS?.rows) &&
      Boolean(tableHead?.firstElementChild);
    if (hasRenderedReviewerTable && !force) {
      setReviewerDashboardFiltersDisabled(false);
      renderResourceDashboardTab();
      return;
    }
    if (filters) filters.hidden = false;
    if (categoryFilter) categoryFilter.hidden = false;
    const addLoadingOptions = (control, values, selectedValue) => {
      if (!control || control.querySelector("button")) return;
      control.replaceChildren(
        ...values.map((value) => {
          const button = createResourceDashboardElement(
            "button",
            value === selectedValue ? "is-active" : "",
            value === "all" ? "All" : value,
          );
          button.type = "button";
          button.dataset.filterValue = value;
          button.disabled = true;
          button.setAttribute("aria-disabled", "true");
          button.setAttribute("aria-pressed", String(value === selectedValue));
          return button;
        }),
      );
    };
    addLoadingOptions(
      yearControl,
      ["1", "2", "3", "all"],
      resourceDashboardSelectedYear,
    );
    addLoadingOptions(
      semesterControl,
      ["1", "2", "all"],
      resourceDashboardSelectedSemester,
    );
    setReviewerDashboardFiltersDisabled(true);
    setResourceDashboardTableVisible("REVIEWERS", false);
    if (!alreadyLoading) setResourceDashboardStatus("Loading", true, true);
  }

  function isReviewerBackendAvailable() {
    return (
      syncConnected && typeof globalScope.AppNetwork?.callBackend === "function"
    );
  }

  function renderReviewerLockedPanel(syncPending = false, syncFailed = false) {
    const lockedPanel = document.getElementById(
      "resource-reviewers-locked-panel",
    );
    if (!lockedPanel) return;
    const heading = document.getElementById(
      "resource-reviewers-locked-heading",
    );
    const message = document.getElementById(
      "resource-reviewers-locked-message",
    );
    const icon = document.getElementById("resource-reviewers-locked-icon");
    const action = document.getElementById("resource-reviewers-locked-action");
    const listing = lockedPanel.nextElementSibling;
    if (syncPending) {
      if (heading) heading.textContent = syncFailed ? "Sync failed" : "Loading";
      if (message) {
        message.textContent =
          "The website couldn't sync with the backend. It will retry automatically.";
        message.hidden = !syncFailed;
      }
      if (icon)
        icon.className = syncFailed
          ? "fa-solid fa-triangle-exclamation resource-reviewers-locked-icon"
          : "fa-solid fa-spinner fa-spin resource-reviewers-locked-icon";
      if (action) action.hidden = true;
      lockedPanel.setAttribute("aria-busy", "true");
      lockedPanel.classList.add("is-sync-loading");
      lockedPanel.classList.toggle("has-sync-failed", syncFailed);
    } else {
      if (heading) heading.textContent = "Sign in required";
      if (message)
        message.textContent =
          "Sign in with Google to request access.";
      if (message) message.hidden = false;
      if (icon)
        icon.className = "fa-solid fa-lock resource-reviewers-locked-icon";
      if (action) {
        action.textContent = "Sign In";
        action.hidden = false;
      }
      lockedPanel.removeAttribute("aria-busy");
      lockedPanel.classList.remove("is-sync-loading");
      lockedPanel.classList.remove("has-sync-failed");
    }
    lockedPanel.hidden = false;
    if (listing) listing.hidden = true;
  }

  function refreshReviewerSyncGate() {
    setReviewerAccessEnabled(reviewerAccountStatus === "TRUE");
    if (!isReviewerBackendAvailable()) {
      if (
        (reviewerAccountStatus === "TRUE" ||
          (!hasExplicitReviewerSignOut() &&
            Boolean(reviewerSessionId || getStoredReviewerSessionId()))) &&
        resourceDashboardActiveTab === "REVIEWERS"
      ) {
        const lockedPanel = document.getElementById(
          "resource-reviewers-locked-panel",
        );
        if (reviewerSessionId || getStoredReviewerSessionId()) {
          if (lockedPanel) lockedPanel.hidden = true;
          if (hasCachedAuthorizedReviewerDashboard())
            renderResourceDashboardTab();
          else showReviewerDashboardLoading(true);
        } else {
          renderReviewerLockedPanel(true, reviewerSyncFailed);
        }
      }
      return;
    }
    if (
      !reviewerSessionId &&
      !hasExplicitReviewerSignOut() &&
      getStoredReviewerSessionId()
    )
      void restoreReviewerSession();
    if (reviewerAccountStatus !== "TRUE") return;
    const lockedPanel = document.getElementById(
      "resource-reviewers-locked-panel",
    );
    const wasLocked = Boolean(lockedPanel && !lockedPanel.hidden);
    if (lockedPanel) lockedPanel.hidden = true;
    if (lockedPanel?.nextElementSibling)
      lockedPanel.nextElementSibling.hidden = false;
    if (wasLocked) {
      prefetchReviewerPdfViewerAssets();
      if (reviewerAccountStatus === "TRUE" && reviewerSessionId) {
        void warmReviewerPdfViewer().catch((error) => {
          console.warn("Unable to warm Reviewer PDF viewer.", error);
        });
      }
      if (reviewerSessionId && !reviewerDashboardRequestPromise)
        void loadReviewerDashboard({ showLoading: resourceDashboardActiveTab === "REVIEWERS" });
    } else if (
      resourceDashboardActiveTab === "REVIEWERS" &&
      reviewerSessionId &&
      !reviewerDashboardRequestPromise
    ) {
      void loadReviewerDashboard();
    }
  }

  function initializeLibraryAccessLogging() {
    const libraryLink = document.getElementById(
      "resource-dashboard-library-link",
    );
    if (!libraryLink || libraryLink.dataset.accessLoggingInitialized) return;
    libraryLink.addEventListener("click", () => {
      void logResourceDashboardAction("LIBRARY", "TAB_OPEN");
    });
    libraryLink.dataset.accessLoggingInitialized = "true";
  }

  function openResourceDashboardTab(tabName = "DEFAULT") {
    const portalMode = getResourceDashboardPortalMode();
    if (tabName === "PROFILE" && portalMode !== "profile") {
      return globalScope.navigate?.("profile") || false;
    }
    if (portalMode === "profile") tabName = "PROFILE";
    if (tabName === "DEFAULT") {
      const hasReviewerSession =
        !hasExplicitReviewerSignOut() &&
        Boolean(reviewerSessionId || getStoredReviewerSessionId());
      tabName = hasReviewerSession
        ? getLastResourceDashboardSection()
        : "REVIEWERS";
      if (hasReviewerSession) {
        const cachedProfile = getStoredReviewerProfile();
        if (cachedProfile) {
          populateReviewerProfile(cachedProfile);
          prefillReviewerNameFromGoogle(cachedProfile);
          reviewerAccountStatus = cachedProfile.accountStatus;
          if (reviewerAccountStatus)
            setReviewerAccessEnabled(reviewerAccountStatus === "TRUE");
          if (reviewerAccountStatus === "TRUE")
            restoreStoredReviewerDashboard(cachedProfile.email);
          const signInButton = document.getElementById(
            "resource-reviewer-signin-button",
          );
          const authStatus = document.getElementById(
            "resource-reviewer-auth-status",
          );
          if (signInButton) signInButton.hidden = true;
          if (authStatus) authStatus.textContent = "";
        }
      }
    }
    const cachedReviewerProfile =
      tabName === "REVIEWERS" ? getStoredReviewerProfile() : null;
    if (
      tabName === "REVIEWERS" &&
      (reviewerAccountStatus === "RESTRICTED" ||
        cachedReviewerProfile?.accountStatus === "RESTRICTED")
    ) {
      reviewerAccountStatus = "RESTRICTED";
      setReviewerAccessEnabled(false);
      tabName = "PROFILE";
    }
    const reviewerSessionAvailable =
      !hasExplicitReviewerSignOut() &&
      Boolean(reviewerSessionId || getStoredReviewerSessionId());
    if (tabName === "REVIEWERS" && reviewerSessionAvailable) {
      const cachedProfile = getStoredReviewerProfile();
      if (cachedProfile?.accountStatus === "TRUE") {
        reviewerAccountStatus = cachedProfile.accountStatus;
        reviewerAuthorizedEmail = cachedProfile.email;
        restoreStoredReviewerDashboard(cachedProfile.email);
      }
    }
    if (
      ![
        "DOCUMENTS",
        "SUBJECTS",
        "MODULES",
        "REVIEWERS",
        "SYLLABUS",
        "PROFILE",
      ].includes(tabName)
    )
      return false;
    saveResourceDashboardFilters();
    saveResourceDashboardSection(tabName);
    if (resourceDashboardActiveTab !== tabName) {
      const searchInput = document.getElementById(
        "resource-dashboard-search-input",
      );
      const searchPanel = document.getElementById(
        "resource-dashboard-search-panel",
      );
      const searchToggle = document.getElementById(
        "resource-dashboard-search-toggle",
      );
      if (searchInput) searchInput.value = "";
      if (searchPanel) searchPanel.hidden = true;
      if (searchToggle) searchToggle.setAttribute("aria-expanded", "false");
    }
    if (tabName !== "REVIEWERS")
      closeReviewerPdfPreview("dashboard-section-change");
    resourceDashboardActiveTab = tabName;
    activateResourceDashboardFilters(tabName);
    if (["SUBJECTS", "SYLLABUS", "MODULES", "REVIEWERS"].includes(tabName)) {
      const hasActiveTabData =
        tabName === "SUBJECTS"
          ? Boolean(resourceDashboardData?.MODULES)
          : Boolean(resourceDashboardData?.[tabName]);
      const reviewerAuthorized =
        tabName !== "REVIEWERS" ||
        (reviewerAccountStatus === "TRUE" && Boolean(reviewerSessionId));
      if (!hasActiveTabData || !reviewerAuthorized)
        setResourceDashboardTableVisible(tabName, false);
    }
    if (tabName === "REVIEWERS" && isReviewerBackendAvailable()) {
      prefetchReviewerPdfViewerAssets();
      if (reviewerAccountStatus === "TRUE" && reviewerSessionId) {
        console.log("Warming Reviewer PDF viewer on tab entry");
        void warmReviewerPdfViewer().catch((error) => {
          console.warn("Unable to warm Reviewer PDF viewer.", error);
        });
      }
    } else {
      cancelReviewerPdfPreviewGeneration();
    }
    if (tabName !== "REVIEWERS") {
      const status = document.getElementById("resource-portal-status");
      if (
        status?.getAttribute("aria-busy") === "true" &&
        status.textContent.trim() === "Loading"
      )
        setResourceDashboardStatus("");
    }
    const modulesNav = document.getElementById(
      "resource-dashboard-modules-nav",
    );
    const reviewersNav = document.getElementById(
      "resource-dashboard-reviewers-nav",
    );
    const syllabusNav = document.getElementById(
      "resource-dashboard-syllabus-nav",
    );
    const subjectsNav = document.getElementById(
      "resource-dashboard-subjects-nav",
    );
    const documentsNav = document.getElementById(
      "resource-dashboard-library-link",
    );
    const profileNav = document.getElementById(
      "resource-dashboard-profile-nav",
    );
    [
      [documentsNav, tabName === "DOCUMENTS"],
      [subjectsNav, tabName === "SUBJECTS"],
      [modulesNav, tabName === "MODULES"],
      [reviewersNav, tabName === "REVIEWERS"],
      [syllabusNav, tabName === "SYLLABUS"],
      [profileNav, tabName === "PROFILE"],
    ].forEach(([button, isActive]) => {
      if (!button) return;
      button.classList.toggle("is-active", isActive);
      if (isActive) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
      if (
        isActive &&
        ["DOCUMENTS", "SUBJECTS", "SYLLABUS", "MODULES", "REVIEWERS"].includes(
          tabName,
        )
      )
        button.scrollIntoView?.({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
    });

    const dashboardContent = document.getElementById(
      "resource-dashboard-content",
    );
    const subjectsContent = document.getElementById(
      "resource-dashboard-subjects-content",
    );
    const documentsContent = document.getElementById(
      "resource-dashboard-documents-content",
    );
    const profileScreen = document.getElementById("resource-dashboard-profile");
    const lockedPanel = document.getElementById(
      "resource-reviewers-locked-panel",
    );
    const updateNote = document.querySelector(
      ".resource-dashboard-update-note",
    );
    const previewWarning = document.getElementById(
      "resource-reviewer-preview-warning",
    );
    if (dashboardContent)
      dashboardContent.hidden = ["PROFILE", "SUBJECTS", "DOCUMENTS"].includes(
        tabName,
      );
    if (subjectsContent) subjectsContent.hidden = tabName !== "SUBJECTS";
    if (documentsContent) documentsContent.hidden = tabName !== "DOCUMENTS";
    if (profileScreen) profileScreen.hidden = tabName !== "PROFILE";
    if (lockedPanel) lockedPanel.hidden = tabName !== "REVIEWERS";
    if (lockedPanel?.nextElementSibling)
      lockedPanel.nextElementSibling.hidden = false;
    if (updateNote)
      updateNote.hidden = tabName === "PROFILE" || tabName === "SUBJECTS";
    if (previewWarning) previewWarning.hidden = tabName !== "REVIEWERS";
    if (tabName === "PROFILE") {
      const cachedProfile = getStoredReviewerProfile();
      if (cachedProfile) {
        reviewerAccountStatus = cachedProfile.accountStatus;
        reviewerAuthorizedEmail = cachedProfile.email;
        populateReviewerProfile(cachedProfile);
        if (cachedProfile.accountStatus)
          setReviewerAccessEnabled(cachedProfile.accountStatus === "TRUE");
      }
      void logResourceDashboardAction("PROFILE", "TAB_OPEN");
      void initializeReviewerAuth();
      return true;
    }
    if (
      tabName !== "REVIEWERS" ||
      (reviewerSessionId && isReviewerBackendAvailable())
    )
      void logResourceDashboardAction(
        tabName === "DOCUMENTS" ? "LIBRARY" : tabName,
        "TAB_OPEN",
      );
    if (tabName === "DOCUMENTS") {
      const folderId = documentsNav?.dataset.folderId || "";
      if (!/^[A-Za-z0-9_-]{10,200}$/.test(folderId)) {
        const status = document.getElementById("resource-documents-status");
        if (status) {
          status.textContent = "Documents are unavailable.";
          status.hidden = false;
        }
        return false;
      }
      return loadResourcePortalFolder(folderId, { openExternal: true });
    }
    if (tabName === "SUBJECTS") {
      if (resourceDashboardData?.MODULES) {
        renderResourceDashboardSubjects();
        return true;
      }
      showResourceDashboardTableLoading("SUBJECTS");
      return loadResourceDashboard();
    }
    if (tabName === "REVIEWERS") {
      if (
        !isReviewerBackendAvailable() &&
        (reviewerAccountStatus === "TRUE" || reviewerSessionAvailable)
      ) {
        if (reviewerSessionAvailable) {
          if (lockedPanel) lockedPanel.hidden = true;
          if (hasCachedAuthorizedReviewerDashboard())
            renderResourceDashboardTab();
          else showReviewerDashboardLoading(true);
        } else {
          renderReviewerLockedPanel(true, reviewerSyncFailed);
        }
        return true;
      }
      if (!reviewerSessionId) {
        if (!hasExplicitReviewerSignOut()) {
          const cachedProfile = getStoredReviewerProfile();
          if (cachedProfile?.accountStatus === "TRUE") {
            reviewerAccountStatus = cachedProfile.accountStatus;
            reviewerAuthorizedEmail = cachedProfile.email;
            restoreStoredReviewerDashboard(cachedProfile.email);
          }
        }
        if (
          reviewerSessionRestorePending ||
          (!hasExplicitReviewerSignOut() && getStoredReviewerSessionId())
        ) {
          if (lockedPanel) lockedPanel.hidden = true;
          if (
            reviewerDashboardLoadedForEmail?.toLowerCase() ===
              reviewerAuthorizedEmail.toLowerCase() &&
            resourceDashboardData?.REVIEWERS
          )
            renderResourceDashboardTab();
          else showReviewerDashboardLoading(true);
          void restoreReviewerSession();
          return true;
        }
        if (lockedPanel) lockedPanel.hidden = false;
        renderReviewerLockedPanel(false);
        setResourceDashboardTableVisible("REVIEWERS", false);
        const filters = document
          .getElementById("resource-dashboard-filter-year")
          ?.closest(".resource-dashboard-filters");
        if (filters) filters.hidden = true;
        setReviewerNavigationBusy(false);
        setResourceDashboardStatus("");
        return true;
      }
      if (lockedPanel) lockedPanel.hidden = true;
      if (
        reviewerDashboardLoadedForEmail?.toLowerCase() ===
          reviewerAuthorizedEmail.toLowerCase() &&
        resourceDashboardData?.REVIEWERS
      ) {
        setReviewerNavigationBusy(false);
        renderResourceDashboardTab();
        void loadReviewerDashboard({
          refresh: true,
          showLoading: resourceDashboardActiveTab === "REVIEWERS",
        });
        return true;
      }
      if (reviewerDashboardRequestPromise) {
        showReviewerDashboardLoading();
        return true;
      }
      return loadReviewerDashboard();
    }

    if (resourceDashboardData?.[resourceDashboardActiveTab]) {
      renderResourceDashboardTab();
      return true;
    }
    showResourceDashboardTableLoading(resourceDashboardActiveTab);
    return loadResourceDashboard();
  }

  function isResourceDashboardLink(value) {
    return resourceCatalogCore.isResourceDashboardLink(value);
  }

  function getResourceDashboardColumnHeading(
    column,
    useCourseNames = typeof resourceDashboardCourseNamesEnabled !== "undefined"
      ? resourceDashboardCourseNamesEnabled
      : false,
  ) {
    return resourceCatalogCore.getResourceDashboardColumnHeading(
      column,
      useCourseNames,
    );
  }

  function getResourceDashboardFileId(value) {
    return resourceCatalogCore.getResourceDashboardFileId(value);
  }

  let resourceDashboardTypeLabelResizeInstalled = false;

  function updateResourceDashboardTypeLabelCompaction() {
    const tableBody = document.getElementById("resource-dashboard-table-body");
    const tableScroll = tableBody?.closest(".resource-dashboard-table-scroll");
    if (!tableScroll) return;

    const shouldCheckOverflow =
      getResourceDashboardPortalMode() === "student" &&
      ["MODULES", "SYLLABUS"].includes(resourceDashboardActiveTab);
    if (!shouldCheckOverflow) {
      tableScroll.removeAttribute("data-compact-resource-type-labels");
      return;
    }

    tableScroll.removeAttribute("data-compact-resource-type-labels");
    if (tableScroll.scrollWidth > tableScroll.clientWidth)
      tableScroll.setAttribute("data-compact-resource-type-labels", "true");

    if (!resourceDashboardTypeLabelResizeInstalled) {
      globalScope.addEventListener(
        "resize",
        updateResourceDashboardTypeLabelCompaction,
      );
      resourceDashboardTypeLabelResizeInstalled = true;
    }
  }

  function renderResourceDashboardTab() {
    if (resourceDashboardActiveTab === "SUBJECTS")
      return renderResourceDashboardSubjects();
    const searchWidget = document.getElementById(
      "resource-dashboard-search-widget",
    );
    if (searchWidget)
      searchWidget.hidden =
        !["SYLLABUS", "MODULES", "REVIEWERS"].includes(
          resourceDashboardActiveTab,
        ) ||
        (resourceDashboardActiveTab === "REVIEWERS" && !reviewerSessionId);
    const tab = resourceDashboardData?.[resourceDashboardActiveTab];
    const status = document.getElementById("resource-portal-status");
    const tableHead = document.getElementById("resource-dashboard-table-head");
    const tableBody = document.getElementById("resource-dashboard-table-body");
    if (!status || !tableHead || !tableBody) return false;
    const previewWarning = document.getElementById(
      "resource-reviewer-preview-warning",
    );
    if (previewWarning)
      previewWarning.hidden = resourceDashboardActiveTab !== "REVIEWERS";
    const lockedPanel = document.getElementById(
      "resource-reviewers-locked-panel",
    );
    const updateNote = document.querySelector(
      ".resource-dashboard-update-note",
    );
    const savedReviewerSessionAvailable =
      !hasExplicitReviewerSignOut() && Boolean(getStoredReviewerSessionId());
    const hasAuthorizedReviewerCache =
      resourceDashboardActiveTab === "REVIEWERS" &&
      hasCachedAuthorizedReviewerDashboard();
    if (
      resourceDashboardActiveTab === "REVIEWERS" &&
      !reviewerSessionId &&
      savedReviewerSessionAvailable &&
      !reviewerSessionRestorePending
    ) {
      if (!isReviewerBackendAvailable()) {
        if (!hasAuthorizedReviewerCache) {
          if (lockedPanel) lockedPanel.hidden = true;
          showReviewerDashboardLoading(true);
          return true;
        }
      } else {
        if (lockedPanel) lockedPanel.hidden = true;
        if (!hasAuthorizedReviewerCache) showReviewerDashboardLoading(true);
        void restoreReviewerSession();
        if (!hasAuthorizedReviewerCache) return true;
      }
    }
    if (
      resourceDashboardActiveTab === "REVIEWERS" &&
      reviewerAccountStatus === "TRUE" &&
      !isReviewerBackendAvailable()
    ) {
      if (
        (reviewerSessionId || savedReviewerSessionAvailable) &&
        !hasAuthorizedReviewerCache
      ) {
        if (lockedPanel) lockedPanel.hidden = true;
        showReviewerDashboardLoading(true);
        return true;
      } else if (!hasAuthorizedReviewerCache) {
        renderReviewerLockedPanel(true, reviewerSyncFailed);
        return true;
      }
    }
    if (resourceDashboardActiveTab === "REVIEWERS" && !reviewerSessionId) {
      if (reviewerSessionRestorePending && !hasAuthorizedReviewerCache) {
        if (lockedPanel) lockedPanel.hidden = true;
        showReviewerDashboardLoading(true);
        return true;
      }
      if (!hasAuthorizedReviewerCache) {
        if (lockedPanel) lockedPanel.hidden = false;
        renderReviewerLockedPanel(false);
        const filters = document
          .getElementById("resource-dashboard-filter-year")
          ?.closest(".resource-dashboard-filters");
        if (filters) filters.hidden = true;
        setResourceDashboardTableVisible("REVIEWERS", false);
        setResourceDashboardStatus("");
        return true;
      }
    }
    if (
      resourceDashboardActiveTab === "REVIEWERS" &&
      reviewerSessionId &&
      reviewerDashboardLoadedForEmail?.toLowerCase() !==
        reviewerAuthorizedEmail.toLowerCase()
    ) {
      if (lockedPanel) lockedPanel.hidden = true;
      showReviewerDashboardLoading(true);
      return true;
    }
    if (!tab) return false;
    const searchInput = document.getElementById(
      "resource-dashboard-search-input",
    );
    const searchLabel = document.querySelector(
      'label[for="resource-dashboard-search-input"]',
    );
    const searchPanel = document.getElementById(
      "resource-dashboard-search-panel",
    );
    const searchToggle = document.getElementById(
      "resource-dashboard-search-toggle",
    );
    const clearSearchButton = document.getElementById(
      "resource-dashboard-search-clear",
    );
    const sectionSearchLabel = {
      SYLLABUS: "Search Syllabus",
      MODULES: "Search Modules",
      REVIEWERS: "Search Reviewers",
    }[resourceDashboardActiveTab];
    if (sectionSearchLabel) {
      if (searchInput) searchInput.placeholder = sectionSearchLabel;
      if (searchLabel) searchLabel.textContent = sectionSearchLabel;
      if (searchToggle) {
        searchToggle.setAttribute("aria-label", sectionSearchLabel);
        searchToggle.title = sectionSearchLabel;
      }
    }
    if (searchInput && !searchInput.dataset.initialized) {
      searchInput.addEventListener("input", () => renderResourceDashboardTab());
      searchInput.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !searchPanel || !searchToggle) return;
        searchPanel.hidden = true;
        searchToggle.setAttribute("aria-expanded", "false");
        searchToggle.focus();
      });
      searchInput.dataset.initialized = "true";
    }
    if (searchToggle && !searchToggle.dataset.initialized) {
      searchToggle.addEventListener("click", () => {
        if (!searchPanel) return;
        searchPanel.hidden = !searchPanel.hidden;
        searchToggle.setAttribute("aria-expanded", String(!searchPanel.hidden));
        if (!searchPanel.hidden) searchInput?.focus();
      });
      searchToggle.dataset.initialized = "true";
    }
    if (clearSearchButton && !clearSearchButton.dataset.initialized) {
      clearSearchButton.addEventListener("click", () => {
        if (!searchInput) return;
        searchInput.value = "";
        renderResourceDashboardTab();
      });
      clearSearchButton.dataset.initialized = "true";
    }
    setReviewerDashboardFiltersDisabled(false);
    if (lockedPanel) lockedPanel.hidden = true;
    if (updateNote)
      updateNote.hidden =
        resourceDashboardActiveTab === "PROFILE" ||
        resourceDashboardActiveTab === "SUBJECTS";

    const yearFilterControl = document.getElementById(
      "resource-dashboard-filter-year",
    );
    const semesterFilterControl = document.getElementById(
      "resource-dashboard-filter-semester",
    );
    const categoryFilterContainer = document.getElementById(
      "resource-dashboard-category-filter",
    );
    const categoryFilterControl = document.getElementById(
      "resource-dashboard-filter-category",
    );
    const filterContainer = yearFilterControl?.closest(
      ".resource-dashboard-filters",
    );
    const yearColumnIndex = tab.columns.findIndex(
      (column) => String(column).trim().toLocaleLowerCase() === "year",
    );
    const semesterColumnIndex = tab.columns.findIndex(
      (column) => String(column).trim().toLocaleLowerCase() === "semester",
    );
    const phaseColumnIndexes = tab.columns.reduce((indexes, column, index) => {
      const phase = String(column).trim().toUpperCase();
      if (["PRELIMS", "MIDTERMS", "FINALS"].includes(phase))
        indexes[phase] = index;
      return indexes;
    }, {});
    const resourceColumnIndices =
      Object.keys(phaseColumnIndexes).length > 0
        ? Object.values(phaseColumnIndexes)
        : tab.columns
            .map((column, index) => ({
              index,
              name: String(column).trim().toLocaleLowerCase(),
            }))
            .filter(
              ({ name }) => !["year", "semester", "course"].includes(name),
            )
            .map(({ index }) => index);
    const hasCellValue = (values, rowIndex, columnIndex) => {
      const displayValue = String(values[columnIndex] ?? "").trim();
      const linkUrl = String(
        tab.links?.[rowIndex]?.[columnIndex] || displayValue,
      );
      return displayValue !== "" || isResourceDashboardLink(linkUrl);
    };
    const dashboardCourseColumnIndex = tab.columns.findIndex(
      (column) => String(column).trim().toLocaleLowerCase() === "course",
    );
    const nonEmptyRows = tab.rows
      .map((values, rowIndex) => ({ values, rowIndex }))
      .filter(
        ({ values, rowIndex }) =>
          (dashboardCourseColumnIndex < 0 ||
            String(values[dashboardCourseColumnIndex] || "")
              .trim()
              .toLocaleUpperCase() !== "TOTAL") &&
          resourceColumnIndices.some((columnIndex) =>
            hasCellValue(values, rowIndex, columnIndex),
          ),
      );
    const hasCategoryFilter = ["MODULES", "REVIEWERS"].includes(
      resourceDashboardActiveTab,
    );
    const showCategoryFilter =
      hasCategoryFilter || resourceDashboardActiveTab === "SYLLABUS";
    if (categoryFilterContainer)
      categoryFilterContainer.hidden = !showCategoryFilter;
    const termValues = new Set();
    if (yearColumnIndex >= 0) {
      nonEmptyRows.forEach(({ values }) => {
        const yearValue = String(values[yearColumnIndex] || "").trim();
        const combinedTerm = /^(\d+)\s*[./-]\s*(\d+)$/.exec(yearValue);
        const year = combinedTerm ? combinedTerm[1] : yearValue;
        const semester = combinedTerm
          ? combinedTerm[2]
          : semesterColumnIndex >= 0
            ? String(values[semesterColumnIndex] || "").trim()
            : "";
        if (year && semester) termValues.add(`${year}.${semester}`);
      });
    }
    const hasTermFilter = yearColumnIndex >= 0;
    const yearFilterContainer = yearFilterControl?.closest(
      ".resource-dashboard-control",
    );
    const semesterFilterContainer = semesterFilterControl?.closest(
      ".resource-dashboard-control",
    );
    if (yearFilterContainer)
      yearFilterContainer.hidden = !hasTermFilter && !showCategoryFilter;
    if (semesterFilterContainer)
      semesterFilterContainer.hidden = !hasTermFilter && !showCategoryFilter;
    if (filterContainer)
      filterContainer.hidden = !showCategoryFilter && !hasTermFilter;
    const populateTermOptions = (
      control,
      values,
      selectedValue,
      fallbackValue,
      includeAll = false,
      disabled = false,
      fixedValues = [],
    ) => {
      if (!control) return selectedValue;
      const sortedValues = [...new Set([...fixedValues, ...values])].sort(
        (left, right) =>
          left.localeCompare(right, undefined, { numeric: true }),
      );
      const validSelection =
        selectedValue === "all" && includeAll
          ? selectedValue
          : values.has(selectedValue)
            ? selectedValue
            : values.has(fallbackValue)
              ? fallbackValue
              : includeAll
                ? "all"
                : [...values][0] || "";
      const options = sortedValues.map((value) => ({
        value,
        label: value,
      }));
      if (includeAll) options.push({ value: "all", label: "All" });
      const buttons = options.map(({ value, label }) => {
        const button = createResourceDashboardElement(
          "button",
          value === validSelection ? "is-active" : "",
          label,
        );
        button.type = "button";
        button.dataset.filterValue = value;
        button.setAttribute("aria-pressed", String(value === validSelection));
        button.disabled = disabled || (value !== "all" && !values.has(value));
        return button;
      });
      control.replaceChildren(...buttons);
      return validSelection;
    };
    const years = new Set([...termValues].map((term) => term.split(".")[0]));
    const orderedTerms = [...termValues].sort((left, right) => {
      const [leftYear, leftSemester] = left.split(".").map(Number);
      const [rightYear, rightSemester] = right.split(".").map(Number);
      return leftYear - rightYear || leftSemester - rightSemester;
    });
    const preferredTerm = "3.2";
    const [preferredYear, preferredSemester] = preferredTerm
      .split(".")
      .map(Number);
    const availablePreviousTerms = orderedTerms.filter((term) => {
      const [year, semester] = term.split(".").map(Number);
      return (
        year < preferredYear ||
        (year === preferredYear && semester <= preferredSemester)
      );
    });
    const nextAvailableTerm = orderedTerms.find((term) => {
      const [year, semester] = term.split(".").map(Number);
      return (
        year > preferredYear ||
        (year === preferredYear && semester > preferredSemester)
      );
    });
    const defaultTerm =
      (termValues.has(preferredTerm) ? preferredTerm : "") ||
      nextAvailableTerm ||
      availablePreviousTerms[availablePreviousTerms.length - 1] ||
      orderedTerms[0] ||
      "";
    const defaultYear = defaultTerm.split(".")[0] || "3";
    if (
      !termValues.has(preferredTerm) &&
      resourceDashboardSelectedYear === preferredYear.toString() &&
      resourceDashboardSelectedSemester === preferredSemester.toString() &&
      defaultTerm
    ) {
      resourceDashboardSelectedYear = defaultYear;
      resourceDashboardSelectedSemester = defaultTerm.split(".")[1];
    }
    resourceDashboardSelectedYear = populateTermOptions(
      yearFilterControl,
      years,
      resourceDashboardSelectedYear,
      defaultYear,
      true,
      false,
      ["1", "2", "3"],
    );
    const allYearLevelsSelected = resourceDashboardSelectedYear === "all";
    const semesters = new Set(
      [...termValues]
        .filter(
          (term) =>
            allYearLevelsSelected ||
            term.split(".")[0] === resourceDashboardSelectedYear,
        )
        .map((term) => term.split(".")[1]),
    );
    const orderedSemesters = [...semesters].sort(
      (left, right) => Number(left) - Number(right),
    );
    const previousSemesters = orderedSemesters.filter(
      (semester) => Number(semester) <= preferredSemester,
    );
    const fallbackSemester =
      previousSemesters[previousSemesters.length - 1] ||
      orderedSemesters[0] ||
      "all";
    resourceDashboardSelectedSemester = populateTermOptions(
      semesterFilterControl,
      semesters,
      resourceDashboardSelectedSemester,
      fallbackSemester,
      true,
      false,
      ["1", "2"],
    );

    const matchesSelectedTerm = (values) => {
      if (!hasTermFilter) return true;
      const yearValue = String(values[yearColumnIndex] || "").trim();
      const combinedTerm = /^(\d+)\s*[./-]\s*(\d+)$/.exec(yearValue);
      const year = combinedTerm ? combinedTerm[1] : yearValue;
      const semester = combinedTerm
        ? combinedTerm[2]
        : semesterColumnIndex >= 0
          ? String(values[semesterColumnIndex] || "").trim()
          : "";
      return (
        (resourceDashboardSelectedYear === "all" ||
          year === resourceDashboardSelectedYear) &&
        (resourceDashboardSelectedSemester === "all" ||
          semester === resourceDashboardSelectedSemester)
      );
    };
    const termFilteredRows = nonEmptyRows.filter(({ values }) =>
      matchesSelectedTerm(values),
    );
    const availableCategories = new Set(
      Object.entries(phaseColumnIndexes)
        .filter(([, columnIndex]) =>
          termFilteredRows.some(({ values, rowIndex }) =>
            hasCellValue(values, rowIndex, columnIndex),
          ),
        )
        .map(([category]) => category),
    );
    let selectedCategory = getSelectedResourceCategory();
    if (
      selectedCategory !== "all" &&
      !availableCategories.has(selectedCategory)
    ) {
      selectedCategory = "all";
      resourceDashboardSelectedCategories[resourceDashboardActiveTab] =
        selectedCategory;
    }
    saveResourceDashboardFilters();
    if (categoryFilterControl)
      categoryFilterControl
        .querySelectorAll("[data-category]")
        .forEach((button) => {
          const categoryAvailable =
            button.dataset.category === "all" ||
            availableCategories.has(button.dataset.category);
          button.disabled = !hasCategoryFilter || !categoryAvailable;
          if (button.dataset.reviewerLoadingDisabled !== undefined)
            button.dataset.reviewerLoadingDisabled = String(button.disabled);
          button.setAttribute("aria-disabled", String(button.disabled));
          const selected = button.dataset.category === selectedCategory;
          button.setAttribute("aria-pressed", String(selected));
          button.classList.toggle("is-active", selected);
        });
    const selectedPhaseColumnIndex =
      !hasCategoryFilter || selectedCategory === "all"
        ? -1
        : phaseColumnIndexes[selectedCategory];
    const isHandbookRow = ({ values, rowIndex }) => {
      const courseValue = String(
        dashboardCourseColumnIndex >= 0
          ? values[dashboardCourseColumnIndex] || ""
          : "",
      ).trim().toLocaleUpperCase();
      return courseValue === "HANDBOOK";
    };

    const selectedRows = nonEmptyRows.filter(({ values, rowIndex }) => {
      if (isHandbookRow({ values, rowIndex })) return true;
      if (!matchesSelectedTerm(values)) return false;
      if (hasCategoryFilter && selectedCategory !== "all") {
        if (selectedPhaseColumnIndex === undefined) return false;
        const phaseValue = String(
          values[selectedPhaseColumnIndex] ?? "",
        ).trim();
        const phaseLink = String(
          tab.links?.[rowIndex]?.[selectedPhaseColumnIndex] || phaseValue,
        );
        if (!phaseValue && !isResourceDashboardLink(phaseLink)) return false;
      }
      return true;
    });
    const searchQuery = String(searchInput?.value || "")
      .trim()
      .toLocaleUpperCase();
    let visibleRows = resourceCatalogView.filterRows(
      selectedRows,
      searchQuery,
      ({ values, rowIndex }) => {
        const course = String(
          dashboardCourseColumnIndex >= 0
            ? values[dashboardCourseColumnIndex] || ""
            : "",
        );
        return [
          ...values,
          ...(tab.linkTitles?.[rowIndex] || []),
          getCourseTitle(course),
        ].join(" ");
      },
    );
    if (searchQuery) {
      const handbookIndex = visibleRows.findIndex((row) => isHandbookRow(row));
      if (handbookIndex >= 0) {
        const handbookRow = visibleRows[handbookIndex];
        const handbookSearchText = [
          ...handbookRow.values,
          ...(tab.linkTitles?.[handbookRow.rowIndex] || []),
          getCourseTitle(
            String(
              dashboardCourseColumnIndex >= 0
                ? handbookRow.values[dashboardCourseColumnIndex] || ""
                : "",
            ),
          ),
        ]
          .join(" ")
          .toLocaleUpperCase();
        if (!handbookSearchText.includes(searchQuery)) {
          visibleRows.splice(handbookIndex, 1);
        }
      }
    }
    const hasSearchResults = visibleRows.length > 0;
    const getRowOrderName = ({ values, rowIndex }) => {
      const orderColumnIndex =
        selectedPhaseColumnIndex >= 0
          ? selectedPhaseColumnIndex
          : resourceColumnIndices.find((columnIndex) =>
              hasCellValue(values, rowIndex, columnIndex),
            );
      return String(
        tab.linkTitles?.[rowIndex]?.[orderColumnIndex] ||
          values[orderColumnIndex] ||
          "",
      );
    };
    visibleRows = resourceCatalogView.sortRows(visibleRows, (left, right) => {
      const leftIsHandbook = isHandbookRow(left);
      const rightIsHandbook = isHandbookRow(right);
      if (leftIsHandbook && !rightIsHandbook) return -1;
      if (!leftIsHandbook && rightIsHandbook) return 1;
      const termParts = (values) => {
        const year = String(
          yearColumnIndex >= 0 ? values[yearColumnIndex] || "" : "",
        ).trim();
        const combinedTerm = /^(\d+)\s*[./-]\s*(\d+)$/.exec(year);
        return {
          year: Number(combinedTerm?.[1] || year) || Number.MAX_SAFE_INTEGER,
          semester:
            Number(
              combinedTerm?.[2] ||
                (semesterColumnIndex >= 0 ? values[semesterColumnIndex] : ""),
            ) || Number.MAX_SAFE_INTEGER,
        };
      };
      const leftTerm = termParts(left.values);
      const rightTerm = termParts(right.values);
      return (
        leftTerm.year - rightTerm.year ||
        leftTerm.semester - rightTerm.semester ||
        compareResourceOrder(getRowOrderName(left), getRowOrderName(right)) ||
        compareResourceOrder(
          left.values[dashboardCourseColumnIndex],
          right.values[dashboardCourseColumnIndex],
        ) ||
        left.rowIndex - right.rowIndex
      );
    });
    const populatedColumnIndices = tab.columns
      .map((_, columnIndex) => columnIndex)
      .filter((columnIndex) =>
        selectedRows.some(({ values, rowIndex }) =>
          hasCellValue(values, rowIndex, columnIndex),
        ),
      );
    const categoryColumnIndices =
      hasCategoryFilter && selectedCategory !== "all"
        ? populatedColumnIndices.filter(
            (columnIndex) =>
              !Object.values(phaseColumnIndexes).includes(columnIndex) ||
              columnIndex === selectedPhaseColumnIndex,
          )
        : populatedColumnIndices;
    const visibleColumnIndices = categoryColumnIndices.filter(
      (columnIndex) => columnIndex !== yearColumnIndex,
    );

    const headerRow = document.createElement("tr");
    visibleColumnIndices.forEach((columnIndex) => {
      const column = tab.columns[columnIndex];
      const header = document.createElement("th");
      const columnName = String(column).trim().toLowerCase();
      if (columnName === "course" || columnName === "year") {
        header.classList.add(`resource-dashboard-column-${columnName}`);
      }
      header.dataset.dashboardColumnKey = String(columnIndex);
      header.textContent = getResourceDashboardColumnHeading(column);
      headerRow.appendChild(header);
    });

    const courseColumnIndex = tab.columns.findIndex(
      (column) => String(column).trim().toLocaleLowerCase() === "course",
    );
    const rowIdentityColumns = [
      yearColumnIndex,
      semesterColumnIndex,
      courseColumnIndex,
    ].filter((columnIndex) => columnIndex >= 0);
    const rowIdentityOccurrences = new Map();
    const renderedRows = visibleRows.map(({ values, rowIndex }) => {
      const row = document.createElement("tr");
      const rowIdentity = rowIdentityColumns.length
        ? rowIdentityColumns.map((columnIndex) =>
            String(values[columnIndex] ?? "").trim(),
          )
        : [rowIndex];
      const rowIdentityKey = JSON.stringify(rowIdentity);
      const occurrence = rowIdentityOccurrences.get(rowIdentityKey) || 0;
      rowIdentityOccurrences.set(rowIdentityKey, occurrence + 1);
      row.dataset.dashboardRowKey = JSON.stringify([
        resourceDashboardActiveTab,
        rowIdentity,
        occurrence,
      ]);
      visibleColumnIndices.forEach((index) => {
        const column = tab.columns[index];
        const cell = document.createElement("td");
        const columnName = String(column).trim().toLowerCase();
        cell.dataset.dashboardColumnKey = String(index);
        if (columnName === "course" || columnName === "year") {
          cell.classList.add(`resource-dashboard-column-${columnName}`);
        }
        const value = String(values[index] || "");
        const linkUrl = String(tab.links?.[rowIndex]?.[index] || value);
        const reviewerPdfMatch =
          resourceDashboardActiveTab === "REVIEWERS"
            ? /^mrh-reviewer-pdf:([A-Za-z0-9_-]{10,200})$/.exec(linkUrl)
            : null;
        if (isResourceDashboardLink(linkUrl) || reviewerPdfMatch) {
          cell.classList.add("resource-dashboard-link-cell");
          const dashboardUpdateKey = JSON.stringify([
            row.dataset.dashboardRowKey,
            columnName,
          ]);
          const updateMarker = tab.recentlyUpdatedCells?.[dashboardUpdateKey];
          const updatedAt =
            typeof updateMarker === "object" && updateMarker !== null
              ? Number(updateMarker.updatedAt)
              : Number(updateMarker || 0);
          const changeType =
            typeof updateMarker === "object" &&
            ["NEW", "UPDATED"].includes(updateMarker.type)
              ? updateMarker.type
              : "UPDATED";
          const recentlyUpdated =
            Number.isFinite(updatedAt) &&
            updatedAt > 0 &&
            updatedAt <= Date.now() &&
            Date.now() - updatedAt <= RESOURCE_DASHBOARD_UPDATED_TTL_MS;
          const showResourceChangeBadge =
            recentlyUpdated &&
            !hasSeenResourceChangeBadge(
              dashboardUpdateKey,
              updatedAt,
              changeType,
            );
          const fileTitle = String(
            tab.linkTitles?.[rowIndex]?.[index] || "",
          ).trim();
          const titleInParentheses = /\(([^()]*)\)/.exec(fileTitle);
          const rawResourceTitle = String(
            titleInParentheses ? titleInParentheses[1] : fileTitle,
          ).trim();
          const resourceTitle = reviewerPdfMatch
            ? cleanResourceDisplayName(
                getReviewerPdfDisplayName(fileTitle || value),
              )
            : cleanResourceDisplayName(rawResourceTitle);
          const mimeType = String(tab.linkTypes?.[rowIndex]?.[index] || "");
          const hasFilenameExtension = /\.(?:pdf|docx?|pptx?)$/i.test(
            fileTitle,
          );
          const isModuleFolderFallback =
            resourceDashboardActiveTab === "MODULES" &&
            (mimeType === "application/vnd.google-apps.folder" ||
              (!mimeType && !hasFilenameExtension && !titleInParentheses));
          const isSyllabus = columnName.includes("syllabus");
          const isPdfResource =
            Boolean(reviewerPdfMatch) ||
            isSyllabus ||
            mimeType === "application/pdf" ||
            /\.pdf\b/i.test(fileTitle);
          const linkLabel = isSyllabus
            ? "PDF"
            : isModuleFolderFallback
              ? "Folder"
              : cleanResourceDisplayName(resourceTitle).replace(
                  /\.pdf$/i,
                  "",
                ) || "Open resource";
          const icon = createResourceDashboardElement(
            "i",
            `fa-solid ${
              isPdfResource ? "fa-file-pdf" : "fa-folder"
            } resource-dashboard-link-icon`,
          );
          icon.setAttribute("aria-hidden", "true");
          const isReviewerResource = resourceDashboardActiveTab === "REVIEWERS";
          const courseName =
            courseColumnIndex < 0
              ? ""
              : String(values[courseColumnIndex] || "").trim();
          const link = createResourceDashboardElement(
            "a",
            "resource-dashboard-link-button",
          );
          const label = createResourceDashboardElement(
            "span",
            "resource-dashboard-link-label",
          );
          if (
            ["REVIEWERS", "MODULES", "SYLLABUS"].includes(
              resourceDashboardActiveTab,
            )
          )
            label.classList.add("resource-dashboard-link-label-centered");
          const reviewerLessonTitle = isReviewerResource
            ? getReviewerPdfLessonTitle(resourceTitle, courseName)
            : null;
          if (reviewerLessonTitle) {
            label.classList.add("resource-dashboard-link-label-stacked");
            label.append(
              createResourceDashboardElement(
                "span",
                "resource-dashboard-link-primary",
                reviewerLessonTitle.lesson,
              ),
              createResourceDashboardElement(
                "span",
                "resource-dashboard-link-secondary",
                reviewerLessonTitle.details,
              ),
            );
          } else {
            label.textContent = linkLabel;
          }
          if (
            (resourceDashboardActiveTab === "MODULES" &&
              isModuleFolderFallback) ||
            (resourceDashboardActiveTab === "SYLLABUS" && isSyllabus)
          ) {
            label.classList.add("resource-dashboard-link-type-label");
            link.setAttribute("aria-label", linkLabel);
          }
          const isInSiteDashboardResource =
            resourceDashboardActiveTab === "MODULES" ||
            resourceDashboardActiveTab === "SYLLABUS";
          const useLegacyInSiteDashboardPreview = false;
          const isFolderResource =
            isModuleFolderFallback ||
            mimeType === "application/vnd.google-apps.folder";
          link.href =
            reviewerPdfMatch ||
            (isInSiteDashboardResource && useLegacyInSiteDashboardPreview)
              ? "#resource-portal-preview"
              : linkUrl;
          if (isInSiteDashboardResource && !useLegacyInSiteDashboardPreview) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
          }
          link.draggable = false;
          if (reviewerPdfMatch) {
            link.dataset.reviewerPdfChip = "true";
            setReviewerPdfChipDisabled(
              link,
              Date.now() < reviewerPdfCooldownUntil,
            );
          }
          ["auxclick", "copy", "contextmenu", "dragstart"].forEach(
            (eventName) => {
              link.addEventListener(eventName, (event) => {
                event.preventDefault();
              });
            },
          );
          link.append(icon, label);
          if (showResourceChangeBadge) {
            const changeLabel = changeType === "NEW" ? "New" : "Updated";
            link.setAttribute(
              "aria-label",
              `${changeLabel} resource: ${linkLabel}`,
            );
          }
          if (resourceTitle && isReviewerResource) {
            link.title = resourceTitle;
          } else if (resourceTitle) {
            link.title = recentlyUpdated
              ? `${changeType === "NEW" ? "New" : "Recently updated"}: ${resourceTitle}`
              : isSyllabus
                ? "PDF"
                : resourceTitle;
          }
          const resourceArea =
            resourceDashboardActiveTab === "MODULES"
              ? "MODULES"
              : resourceDashboardActiveTab;
          const fileId = reviewerPdfMatch
            ? reviewerPdfMatch[1]
            : getResourceDashboardFileId(linkUrl);
          const fileName =
            fileTitle ||
            resourceTitle ||
            (isResourceDashboardLink(value) ? "" : value) ||
            linkLabel;
          if (isInSiteDashboardResource && useLegacyInSiteDashboardPreview) {
            link.addEventListener("click", (event) => {
              event.preventDefault();
              if (!fileId) {
                setResourceDashboardStatus(
                  "This resource cannot be opened in the Student Portal.",
                );
                return;
              }
              const mimeType = String(tab.linkTypes?.[rowIndex]?.[index] || "");
              if (mimeType === "application/vnd.google-apps.folder") {
                void logResourceDashboardAction(
                  resourceArea,
                  "FOLDER_OPEN",
                  fileName,
                  fileName,
                );
                void previewResourceFile(fileId, fileName, {
                  folderId: fileId,
                });
              } else
                void previewResourceFile(fileId, fileName, {
                  course:
                    resourceDashboardActiveTab === "MODULES" ? courseName : "",
                  mimeType,
                });
            });
          }
          if (fileId) {
            const rowValue = (name) => {
              const columnIndex = tab.columns.findIndex(
                (candidate) =>
                  String(candidate).trim().toLocaleLowerCase() === name,
              );
              return columnIndex < 0
                ? ""
                : String(values[columnIndex] || "").trim();
            };
            const resourceCategory =
              Object.entries(phaseColumnIndexes).find(
                ([, columnIndex]) => columnIndex === index,
              )?.[0] ||
              (resourceDashboardActiveTab === "SYLLABUS"
                ? "SYLLABUS"
                : selectedCategory);
            link.dataset.logResourceArea = resourceArea;
            link.dataset.logFileName = fileName;
            link.dataset.logFileId = fileId;
            link.dataset.logCourse = courseName || rowValue("course");
            const rawYear = rowValue("year") || resourceDashboardSelectedYear;
            const combinedYear = /^(\d+)\s*[./-]\s*(\d+)$/.exec(rawYear);
            link.dataset.logYear = combinedYear ? combinedYear[1] : rawYear;
            link.dataset.logSemester =
              rowValue("semester") ||
              (combinedYear ? combinedYear[2] : "") ||
              resourceDashboardSelectedSemester;
            link.dataset.logCategory = resourceCategory;
            link.addEventListener("click", (event) => {
              const clickedLink = event.currentTarget;
              if (reviewerPdfMatch) {
                event.preventDefault();
                if (Date.now() < reviewerPdfCooldownUntil) {
                  setReviewerPdfSelectionRateLimit(
                    reviewerSessionId || getStoredReviewerSessionId(),
                    fileId,
                  );
                  return;
                }
                void previewResourceFile(fileId, fileName, {
                  reviewer: true,
                  course: courseName,
                  year: clickedLink.dataset.logYear,
                  semester: clickedLink.dataset.logSemester,
                  category: clickedLink.dataset.logCategory,
                });
              }
              if (!isFolderResource)
                void logResourceFileClick(
                  clickedLink.dataset.logResourceArea,
                  clickedLink.dataset.logFileName,
                  clickedLink.dataset.logFileId,
                  {
                    course: clickedLink.dataset.logCourse,
                    year: clickedLink.dataset.logYear,
                    semester: clickedLink.dataset.logSemester,
                    category: clickedLink.dataset.logCategory,
                  },
                );
            });
          }
          if (showResourceChangeBadge) {
            const badge = createResourceDashboardElement(
              "span",
              `resource-dashboard-change-badge is-${changeType.toLowerCase()}`,
              changeType,
            );
            badge.setAttribute("aria-hidden", "true");
            link.addEventListener(
              "click",
              () => {
                hasSeenResourceChangeBadge(
                  dashboardUpdateKey,
                  updatedAt,
                  changeType,
                  true,
                );
                badge.remove();
                link.removeAttribute("aria-label");
              },
              { once: true, capture: true },
            );
            const linkWrap = createResourceDashboardElement(
              "span",
              "resource-dashboard-change-link-wrap",
            );
            linkWrap.append(badge, link);
            cell.appendChild(linkWrap);
          } else {
            cell.appendChild(link);
          }
        } else {
          if (columnName === "course") {
            cell.appendChild(
              document.createTextNode(
                getCourseHeading(value).toLocaleUpperCase(),
              ),
            );
          } else {
            cell.textContent = cleanResourceDisplayName(value);
          }
          if (
            columnName === "course" &&
            [
              "GENERAL KNOWLEDGE",
              "BSMT COMPETENCIES",
              "REVIEW NOTES FOR DECK OFFICERS (BOOK)",
            ].includes(value.trim().toLocaleUpperCase())
          ) {
            const popularIcon = createResourceDashboardElement(
              "i",
              "fa-solid fa-fire resource-dashboard-popular-icon",
            );
            popularIcon.title = "Popular";
            popularIcon.setAttribute("role", "img");
            popularIcon.setAttribute("aria-label", "Popular");
            cell.append(" ", popularIcon);
          }
        }
        if (columnName === "course" && yearColumnIndex >= 0) {
          const courseValue = String(
            dashboardCourseColumnIndex >= 0
              ? values[dashboardCourseColumnIndex] || ""
              : "",
          ).trim().toLocaleUpperCase();
          if (courseValue === "HANDBOOK") {
            const courseLabel = document.createElement("div");
            courseLabel.className = "resource-dashboard-course-label";
            while (cell.firstChild) courseLabel.appendChild(cell.firstChild);
            const termLabel = createResourceDashboardElement(
              "span",
              "resource-dashboard-course-term",
              "2025",
            );
            cell.append(courseLabel, termLabel);
          } else {
            const yearValue = String(values[yearColumnIndex] || "").trim();
            const combinedTerm = /^(\d+)\s*[./-]\s*(\d+)$/.exec(yearValue);
            const year = combinedTerm ? combinedTerm[1] : yearValue;
            const semester = combinedTerm
              ? combinedTerm[2]
              : semesterColumnIndex >= 0
                ? String(values[semesterColumnIndex] || "").trim()
                : "";
            if (/^\d+$/.test(year) && /^\d+$/.test(semester)) {
              const courseLabel = document.createElement("div");
              courseLabel.className = "resource-dashboard-course-label";
              while (cell.firstChild) courseLabel.appendChild(cell.firstChild);
              const termLabel = createResourceDashboardElement(
                "span",
                "resource-dashboard-course-term",
                `BSMT ${year}.${semester}`,
              );
              cell.append(courseLabel, termLabel);
            }
          }
        }
        row.appendChild(cell);
      });
      return row;
    });
    const hasActiveResourceFilter =
      resourceDashboardSelectedYear !== "all" ||
      resourceDashboardSelectedSemester !== "all" ||
      selectedCategory !== "all";
    const emptyTableMessage = hasActiveResourceFilter
      ? "No results found. Try expanding your filters."
      : "No entries are found.";
    const rowsToRender = hasSearchResults
      ? renderedRows
      : [
          (() => {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.className = "resource-dashboard-no-entries";
            cell.colSpan = Math.max(visibleColumnIndices.length, 1);
            cell.textContent = emptyTableMessage;
            row.appendChild(cell);
            return row;
          })(),
        ];
    reconcileResourceDashboardTable(
      tableHead,
      tableBody,
      populatedColumnIndices.length ? headerRow : null,
      rowsToRender,
    );
    setResourceDashboardTableVisible(resourceDashboardActiveTab, true);
    updateResourceDashboardTypeLabelCompaction();

    status.hidden = false;
    status.classList?.add("resource-dashboard-entry-count");
    status.textContent = `Showing ${visibleRows.length} entries.`;
    status.removeAttribute("aria-busy");
    status.classList?.remove("resource-dashboard-status-stacked");
    updateResourceDashboardFilterIndicators();
    return true;
  }

  function reconcileResourceDashboardTable(
    tableHead,
    tableBody,
    desiredHeader,
    desiredRows,
  ) {
    resourceCatalogView.reconcileTable(
      tableHead,
      tableBody,
      desiredHeader,
      desiredRows,
    );
  }

  function createResourceDashboardElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function isResourceDashboardVisible() {
    const view = document.getElementById("view-resources");
    return (
      document.visibilityState !== "hidden" &&
      Boolean(view?.classList.contains("active"))
    );
  }

  function refreshResourceDashboardIfNeeded() {
    return resourceDashboardController.refreshIfNeeded();
  }

  function initializeResourceDashboardAutoRefresh() {
    resourceDashboardController.initialize();
  }

  function initializeResourceDashboardControls() {
    initializeResourceDashboardAutoRefresh();
    const courseNamesToggle = document.getElementById(
      "resource-dashboard-course-names-toggle",
    );
    if (courseNamesToggle && !courseNamesToggle.dataset.initialized) {
      try {
        resourceDashboardCourseNamesEnabled =
          globalScope.localStorage.getItem(
            RESOURCE_DASHBOARD_COURSE_NAMES_KEY,
          ) === "true";
      } catch (error) {
        (globalScope.DebugUtils || console).error(
          "Unable to load the Student Portal course display preference.",
          error,
        );
      }
      const updateToggle = () => {
        const selected = resourceDashboardCourseNamesEnabled;
        courseNamesToggle.textContent = selected ? "COURSE NAME" : "COURSE";
        courseNamesToggle.setAttribute("aria-pressed", String(selected));
        courseNamesToggle.setAttribute(
          "aria-label",
          `Display ${selected ? "course names" : "course codes"}. Toggle display.`,
        );
        courseNamesToggle.title = `Showing ${selected ? "course names" : "course codes"}`;
      };
      courseNamesToggle.addEventListener("click", () => {
        resourceDashboardCourseNamesEnabled =
          !resourceDashboardCourseNamesEnabled;
        try {
          globalScope.localStorage.setItem(
            RESOURCE_DASHBOARD_COURSE_NAMES_KEY,
            String(resourceDashboardCourseNamesEnabled),
          );
        } catch (error) {
          (globalScope.DebugUtils || console).error(
            "Unable to save the Student Portal course display preference.",
            error,
          );
        }
        updateToggle();
        if (
          resourceDashboardData &&
          ["SYLLABUS", "MODULES", "REVIEWERS"].includes(
            resourceDashboardActiveTab,
          )
        ) {
          renderResourceDashboardTab();
          const preview = document.getElementById("resource-portal-preview");
          const previewTitle = document.getElementById(
            "resource-portal-preview-title",
          );
          const previewCourseHeading = previewTitle?.querySelector("span");
          if (
            preview &&
            !preview.hidden &&
            previewCourseHeading &&
            resourcePortalPreviewCourse
          )
            previewCourseHeading.textContent = getCourseHeading(
              resourcePortalPreviewCourse,
            );
        }
      });
      updateToggle();
      courseNamesToggle.dataset.initialized = "true";
    }
    if (!resourceDashboardFilterIndicatorResizeInstalled) {
      globalScope.addEventListener(
        "resize",
        updateResourceDashboardFilterIndicators,
      );
      resourceDashboardFilterIndicatorResizeInstalled = true;
    }
    const yearFilterControl = document.getElementById(
      "resource-dashboard-filter-year",
    );
    const semesterFilterControl = document.getElementById(
      "resource-dashboard-filter-semester",
    );
    const categoryFilterControl = document.getElementById(
      "resource-dashboard-filter-category",
    );
    if (yearFilterControl && !yearFilterControl.dataset.initialized) {
      yearFilterControl.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-filter-value]");
        if (!button || button.disabled || !yearFilterControl.contains(button))
          return;
        resourceDashboardSelectedYear = button.dataset.filterValue;
        if (resourceDashboardSelectedYear === "all")
          resourceDashboardSelectedSemester = "all";
        saveResourceDashboardFilters();
        void logResourceDashboardAction(
          resourceDashboardActiveTab,
          "FILTER_YEAR",
          resourceDashboardSelectedYear,
        );
        if (resourceDashboardData) renderResourceDashboardTab();
      });
      yearFilterControl.dataset.initialized = "true";
    }
    if (semesterFilterControl && !semesterFilterControl.dataset.initialized) {
      semesterFilterControl.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-filter-value]");
        if (
          !button ||
          button.disabled ||
          !semesterFilterControl.contains(button)
        )
          return;
        resourceDashboardSelectedSemester = button.dataset.filterValue;
        saveResourceDashboardFilters();
        void logResourceDashboardAction(
          resourceDashboardActiveTab,
          "FILTER_SEMESTER",
          resourceDashboardSelectedSemester,
        );
        if (resourceDashboardData) renderResourceDashboardTab();
      });
      semesterFilterControl.dataset.initialized = "true";
    }
    if (categoryFilterControl && !categoryFilterControl.dataset.initialized) {
      categoryFilterControl
        .querySelectorAll("[data-category]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            resourceDashboardSelectedCategories[resourceDashboardActiveTab] =
              button.dataset.category;
            resourceDashboardCategorySelectionMade[resourceDashboardActiveTab] =
              true;
            saveResourceDashboardFilters();
            void logResourceDashboardAction(
              resourceDashboardActiveTab,
              "FILTER_CATEGORY",
              getSelectedResourceCategory(),
            );
            if (resourceDashboardData) renderResourceDashboardTab();
          });
        });
      categoryFilterControl.dataset.initialized = "true";
    }
    const signoutButton = document.getElementById("resource-reviewer-signout");
    if (signoutButton && !signoutButton.dataset.initialized) {
      signoutButton.addEventListener("click", async () => {
        if (signoutButton.dataset.confirming === "true") return;
        signoutButton.dataset.confirming = "true";
        try {
          const confirmed = await requestConfirmation(
            "Are you sure you want to sign out of your account?",
            "Sign Out",
          );
          if (confirmed) signOutReviewer(true);
        } finally {
          delete signoutButton.dataset.confirming;
        }
      });
      signoutButton.dataset.initialized = "true";
    }
    const cancelEditButton = document.getElementById(
      "resource-reviewer-cancel-edit",
    );
    if (cancelEditButton && !cancelEditButton.dataset.initialized) {
      cancelEditButton.addEventListener("click", closeReviewerProfileEditor);
      cancelEditButton.dataset.initialized = "true";
    }
  }

  function capitalizeReviewerName(value) {
    return reviewerProfileUICore.capitalizeReviewerName(value);
  }

  function normalizeReviewerMiddleInitialInput(input, event) {
    reviewerProfileUICore.normalizeMiddleInitialInput(input, event);
  }

  function initializeReviewerEnrollmentInputs() {
    reviewerProfileUICore.initializeEnrollmentInputs();
  }

  function updateReviewerEmailNameWarning() {
    reviewerProfileUICore.updateReviewerEmailNameWarning();
  }

  function openReviewerProfileEditor() {
    reviewerProfileUICore.openProfileEditor();
  }

  function closeReviewerProfileEditor() {
    reviewerProfileUICore.closeProfileEditor();
  }

  function initializeReviewerStatusChannel() {
    reviewerSessionCoordinator.initializeStatusChannel();
  }

  async function broadcastReviewerAccountStatus(response, sessionId) {
    await reviewerSessionCoordinator.broadcastAccountStatus(response, sessionId);
  }

  async function broadcastReviewerDashboardSnapshot(tab) {
    await reviewerSessionCoordinator.broadcastDashboardSnapshot(tab);
  }

  async function initializeReviewerAuth() {
    initializeReviewerEnrollmentInputs();
    initializeReviewerStatusChannel();
    if (reviewerAuthConfigPromise) return reviewerAuthConfigPromise;
    installReviewerSignOutStorageListener();
    if (
      !reviewerSessionId &&
      !reviewerSessionRestorePending &&
      !hasExplicitReviewerSignOut() &&
      getStoredReviewerSessionId()
    )
      void restoreReviewerSession();
    reviewerAuthCheckPending = false;
    reviewerAuthConfigPromise = (async () => {
      const authStatus = document.getElementById(
        "resource-reviewer-auth-status",
      );
      const signInButton = document.getElementById(
        "resource-reviewer-signin-button",
      );
      const retryButton = document.getElementById(
        "resource-reviewer-retry-verification",
      );
      if (retryButton && !retryButton.dataset.initialized) {
        retryButton.addEventListener("click", () => {
          if (reviewerPendingRevocation) {
            void completeReviewerSessionRevocation(reviewerPendingRevocation);
            return;
          }
          if (reviewerVerificationInFlightToken) return;
          if (reviewerVerificationRetryToken) {
            void completeReviewerSignIn(reviewerVerificationRetryToken);
            return;
          }
          void restoreReviewerSession();
        });
        retryButton.dataset.initialized = "true";
      }
      const enrollmentForm = document.getElementById(
        "resource-reviewer-enrollment-form",
      );
      if (enrollmentForm && !enrollmentForm.dataset.initialized) {
        enrollmentForm.addEventListener("submit", requestReviewerEnrollment);
        enrollmentForm.dataset.initialized = "true";
      }
      const reviewersNav = document.getElementById(
        "resource-dashboard-reviewers-nav",
      );
      try {
        const authConfigRequest = reviewerAuthCore.getAuthConfig();
        const googleIdentityClientRequest = reviewerAuthCore
          .loadIdentityProvider()
          .catch((error) => error);
        const response = await authConfigRequest;
        if (
          response?.status !== "success" ||
          typeof response.enabled !== "boolean" ||
          typeof response.clientId !== "string"
        ) {
          throw new Error("Google sign-in returned invalid configuration.");
        }
        reviewerAuthConfig = response;
        if (!reviewerAuthConfig.enabled) {
          reviewerAuthCheckPending = false;
          setReviewerNavigationBusy(false);
          if (authStatus)
            authStatus.textContent =
              "Google sign-in for review materials is not configured. Contact the site administrator.";
          authStatus?.removeAttribute("aria-busy");
          if (resourceDashboardActiveTab === "REVIEWERS")
            setResourceDashboardStatus(
              "Google sign-in for review materials is not configured. Contact the site administrator.",
            );
          return false;
        }
        if (!reviewerAuthConfig.clientId) {
          throw new Error("The Google sign-in client ID is missing.");
        }

        const googleIdentityClientError = await googleIdentityClientRequest;
        if (googleIdentityClientError) throw googleIdentityClientError;
        reviewerAuthCore.initializeIdentityProvider(
          reviewerAuthConfig.clientId,
          signInButton,
          (credential) => {
            reviewerAuthCheckPending = false;
            setReviewerNavigationBusy(false);
            if (!credential) {
              void completeReviewerSignIn("");
              return;
            }
            try {
              setExplicitReviewerSignOut(false);
            } catch (error) {
              (globalScope.DebugUtils || console).error(
                "Unable to clear the explicit reviewer sign-out preference.",
              );
            }
            void completeReviewerSignIn(credential);
          },
        );
        if (
          !reviewerSessionRestorePending &&
          !reviewerSessionId &&
          !reviewerPendingEnrollmentSessionId
        ) {
          setReviewerAuthStatus("Use Google to sign in and request access.");
        }
        reviewerAuthCheckPending = false;
        setReviewerNavigationBusy(
          Boolean(reviewerSessionRestorePending || reviewerSessionId),
        );
        if (!reviewerSessionRestorePending)
          authStatus?.removeAttribute("aria-busy");
        return true;
      } catch (error) {
        reviewerAuthCheckPending = false;
        setReviewerNavigationBusy(false);
        reviewerAuthConfigPromise = null;
        authStatus?.removeAttribute("aria-busy");
        if (authStatus)
          authStatus.textContent = `Google sign-in is unavailable: ${String(
            error?.message || error,
          )}`;
        (globalScope.DebugUtils || console).error(
          "Unable to initialize Google sign-in.",
        );
        if (resourceDashboardActiveTab === "REVIEWERS")
          renderResourceDashboardTab();
        return false;
      }
    })();
    return reviewerAuthConfigPromise;
  }

  function stopReviewerStatusPolling() {
    reviewerSessionCoordinator.stopStatusPolling();
  }

  function resetReviewerStatusPollBackoff() {
    reviewerStatusPollWindowStartedAt = Date.now();
    reviewerStatusPollUnchangedCount = 0;
  }

  function getReviewerStatusPollDelay(
    windowStartedAt,
    unchangedPollCount,
    now = Date.now(),
  ) {
    return reviewerSessionCoordinator.getStatusPollDelay(
      windowStartedAt,
      unchangedPollCount,
      now,
    );
  }

  function stopReviewerSessionRestoreRetry() {
    reviewerSessionCoordinator.stopSessionRestoreRetry();
  }

  function logReviewerRequestDiagnostic(request, outcome, startedAt) {
    const logger = globalScope.DebugUtils || console;
    if (typeof logger.info !== "function") return;
    logger.info("Reviewer request diagnostic.", {
      request,
      outcome,
      durationMs:
        typeof startedAt === "number" ? Date.now() - startedAt : undefined,
    });
  }

  function coalesceReviewerRequest(requestMap, key, request, diagnosticName) {
    return reviewerSessionCoordinator.coalesceRequest(
      requestMap,
      key,
      request,
      diagnosticName,
    );
  }

  function getReviewerAccountStatus(sessionId) {
    return coalesceReviewerRequest(
      reviewerAccountStatusPromises,
      sessionId,
      () => reviewerAuthCore.getAccountStatus(sessionId),
      "account-status",
    );
  }

  function scheduleReviewerSessionRestoreRetry(sessionId) {
    return reviewerSessionCoordinator.scheduleSessionRestoreRetry(
      () =>
        Boolean(
          sessionId &&
            !hasExplicitReviewerSignOut() &&
            !reviewerSessionId &&
            sessionId === getStoredReviewerSessionId(),
        ),
      () => void restoreReviewerSession(sessionId),
      REVIEWER_SESSION_RESTORE_RETRY_BASE_MS,
      REVIEWER_SESSION_RESTORE_RETRY_MAX_MS,
    );
  }

  function refreshReviewerStatusOnReturn() {
    if (document.hidden === true || document.visibilityState === "hidden") {
      stopReviewerStatusPolling();
      return;
    }
    if (reviewerSessionId) {
      scheduleReviewerStatusPolling(reviewerSessionId, 0);
      return;
    }
    const storedSessionId = getStoredReviewerSessionId();
    if (!storedSessionId || hasExplicitReviewerSignOut()) return;
    stopReviewerSessionRestoreRetry();
    reviewerSessionCoordinator.resetSessionRestoreRetryBackoff();
    void restoreReviewerSession(storedSessionId);
  }

  async function restoreReviewerSession(requestedSessionId = "") {
    if (hasExplicitReviewerSignOut()) return false;
    const sessionId = requestedSessionId || getStoredReviewerSessionId();
    if (!sessionId) return false;
    if (typeof globalScope.AppNetwork?.callBackend !== "function") return false;
    if (reviewerSessionId === sessionId) return true;
    if (reviewerSessionRestorePromises.has(sessionId)) {
      logReviewerRequestDiagnostic("session-restore", "coalesced");
      return reviewerSessionRestorePromises.get(sessionId);
    }

    installReviewerSignOutStorageListener();
    const cachedProfile = getStoredReviewerProfile();
    if (
      !hasExplicitReviewerSignOut() &&
      cachedProfile?.accountStatus === "TRUE"
    ) {
      reviewerAccountStatus = cachedProfile.accountStatus;
      reviewerAuthorizedEmail = cachedProfile.email;
      setReviewerAccessEnabled(true);
      restoreStoredReviewerDashboard(cachedProfile.email);
    }
    const authGeneration = reviewerAuthGeneration;
    reviewerSessionRestoreTarget = sessionId;
    reviewerSessionRestorePending = true;
    reviewerAuthCheckPending = false;
    setStudentPortalWelcomeAccessSyncing(true);
    setReviewerNavigationBusy(true);
    const signInButton = document.getElementById(
      "resource-reviewer-signin-button",
    );
    if (signInButton) signInButton.hidden = true;
    const authStatus = document.getElementById("resource-reviewer-auth-status");
    authStatus?.removeAttribute("aria-busy");
    if (
      resourceDashboardActiveTab === "REVIEWERS" &&
      !hasCachedAuthorizedReviewerDashboard()
    )
      showReviewerDashboardLoading(true);

    const restorePromise = coalesceReviewerRequest(
      reviewerSessionRestorePromises,
      sessionId,
      async () => {
        try {
          const response = await reviewerAuthCore.restoreSession(sessionId);
          const storedSessionId = getStoredReviewerSessionId();
          if (
            authGeneration !== reviewerAuthGeneration ||
            reviewerSessionRestoreTarget !== sessionId ||
            (storedSessionId && storedSessionId !== sessionId)
          )
            return false;
          stopReviewerSessionRestoreRetry();
          reviewerSessionCoordinator.resetSessionRestoreRetryBackoff();
          applyReviewerAccountStatus(response, sessionId);
          scheduleReviewerStatusPolling(sessionId);
          if (
            response.accountStatus === "TRUE" &&
            isReviewerBackendAvailable()
          )
            void loadReviewerDashboard({
              refresh: true,
              showLoading: resourceDashboardActiveTab === "REVIEWERS",
            });
          return true;
        } catch (error) {
          const storedSessionId = getStoredReviewerSessionId();
          if (
            authGeneration !== reviewerAuthGeneration ||
            reviewerSessionRestoreTarget !== sessionId ||
            (storedSessionId && storedSessionId !== sessionId)
          )
            return false;
          logReviewerRequestDiagnostic("session-restore", "failure");
          if (isDefinitivelyInvalidReviewerCredential(error)) {
            signOutReviewer(false);
            if (authStatus)
              authStatus.textContent =
                "Your saved access session expired or was revoked. Sign in with Google again.";
          } else {
            const signInButton = document.getElementById(
              "resource-reviewer-signin-button",
            );
            if (signInButton) signInButton.hidden = false;
            if (authStatus)
              authStatus.textContent =
                "Unable to verify your saved access session right now. It has been kept; retry when online.";
            const retryButton = document.getElementById(
              "resource-reviewer-retry-verification",
            );
            if (retryButton) retryButton.hidden = false;
            if (resourceDashboardActiveTab === "REVIEWERS")
              setReviewerDashboardFiltersDisabled(false);
            (globalScope.DebugUtils || console).error(
              "Unable to restore the saved access session.",
            );
            scheduleReviewerSessionRestoreRetry(sessionId);
          }
          return false;
        } finally {
          if (
            authGeneration === reviewerAuthGeneration &&
            reviewerSessionRestoreTarget === sessionId
          ) {
            reviewerSessionRestorePending = false;
            setStudentPortalWelcomeAccessSyncing(
              isStudentPortalWelcomeAccessSyncing(),
            );
            revealStudentPortalWelcome();
            setReviewerNavigationBusy(
              Boolean(reviewerSessionId || reviewerPendingEnrollmentSessionId),
            );
            authStatus?.removeAttribute("aria-busy");
            if (
              !reviewerSessionId &&
              resourceDashboardActiveTab === "REVIEWERS"
            )
              renderResourceDashboardTab();
          }
        }
      },
      "session-restore",
    );
    return restorePromise;
  }

  function setReviewerAccessEnabled(enabled) {
    const reviewersNav = document.getElementById(
      "resource-dashboard-reviewers-nav",
    );
    if (reviewersNav) {
      const backendUnavailable = enabled && !isReviewerBackendAvailable();
      reviewersNav.disabled = false;
      reviewersNav.removeAttribute("aria-disabled");
      reviewersNav.classList.remove("is-locked");
      const reviewersIcon = reviewersNav.querySelector("i");
      if (reviewersIcon) reviewersIcon.className = "fa-solid fa-clipboard-list";
      reviewersNav.title = backendUnavailable
        ? "Reviewer services are temporarily unavailable"
        : enabled
          ? "Open Reviewers"
          : reviewerAccountStatus === "RESTRICTED"
            ? "Reviewer access restricted"
            : reviewerAccountStatus === "DENIED"
              ? "Reviewer access denied"
              : reviewerAccountStatus === "FALSE"
                ? "Reviewer access pending"
                : "Reviewer access not granted";
    }
  }

  function clearReviewerResourceRows() {
    reviewerDashboardRequestGeneration += 1;
    reviewerDashboardRequestPromise = null;
    reviewerDashboardLoadedForEmail = "";
    clearStoredReviewerDashboard();
    setReviewerNavigationBusy(false);
    if (resourceDashboardData) {
      resourceDashboardData.REVIEWERS = {
        columns: [],
        rows: [],
        links: [],
        linkTitles: [],
        linkTypes: [],
        truncated: false,
      };
    }
    if (resourceDashboardActiveTab === "REVIEWERS") {
      setResourceDashboardTableVisible("REVIEWERS", false);
      document
        .getElementById("resource-dashboard-table-head")
        ?.replaceChildren();
      document
        .getElementById("resource-dashboard-table-body")
        ?.replaceChildren();
      setResourceDashboardStatus("");
    }
  }

  function setStudentPortalWelcomeHidden(hidden, persist = false) {
    const welcome = document.getElementById("student-portal-welcome");
    const toggle = document.getElementById("student-portal-welcome-toggle");
    if (!welcome || !toggle) return;
    if (persist) studentPortalWelcomeHiddenPreference = hidden;
    updateStudentPortalWelcomeLayout();
    if (!persist) return;
    try {
      if (hidden)
        globalScope.localStorage.setItem(
          STUDENT_PORTAL_WELCOME_HIDDEN_KEY,
          "true",
        );
      else
        globalScope.localStorage.removeItem(STUDENT_PORTAL_WELCOME_HIDDEN_KEY);
    } catch (error) {
      (globalScope.DebugUtils || console).error(
        "Unable to save the Student Portal welcome visibility preference.",
        error,
      );
    }
  }

  function updateStudentPortalWelcomeName() {
    const heading = document.getElementById("student-portal-welcome-name");
    if (!heading) return;
    const container = document.querySelector(
      ".student-portal-welcome-container",
    );
    const fullName = heading.dataset.fullName || "Guest";
    const lastName = heading.dataset.lastName || fullName;
    const fullText = `Welcome, ${fullName}.`;
    heading.setAttribute("aria-label", fullText);
    if (container?.classList.contains("is-stacked")) {
      heading.textContent = `Welcome, ${lastName}.`;
      return;
    }
    heading.textContent = fullText;
    if (heading.scrollWidth > heading.clientWidth && lastName !== fullName)
      heading.textContent = `Welcome, ${lastName}.`;
  }

  function updateStudentPortalWelcomeLayout() {
    const welcome = document.getElementById("student-portal-welcome");
    const toggle = document.getElementById("student-portal-welcome-toggle");
    const container = document.querySelector(
      ".student-portal-welcome-container",
    );
    const portal = document.querySelector(".student-portal-deck");
    if (!welcome || !toggle || !container || !portal) return;
    const containerRect = container.getBoundingClientRect();
    const portalRect = portal.getBoundingClientRect();
    const isSideBySide =
      containerRect.width > 0 &&
      portalRect.width > 0 &&
      (containerRect.right <= portalRect.left ||
        portalRect.right <= containerRect.left);
    container.classList.toggle("is-stacked", !isSideBySide);
    if (!studentPortalWelcomeInitialized) return;
    welcome.hidden = !isSideBySide && studentPortalWelcomeHiddenPreference;
    toggle.hidden = isSideBySide;
    toggle.setAttribute("aria-expanded", String(!welcome.hidden));
    toggle.innerHTML = welcome.hidden
      ? '<i class="fa-solid fa-eye" aria-hidden="true"></i><span>Show Profile</span>'
      : '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i><span>Hide Profile</span>';
  }

  function updateStudentPortalDeckTitles() {
    document
      .querySelectorAll(".student-portal-deck-title[data-compact-title]")
      .forEach((title) => {
        const fullTitle = title.dataset.fullTitle || title.textContent.trim();
        const compactTitle = title.dataset.compactTitle;
        if (!title.clientWidth || !compactTitle) return;
        title.textContent = fullTitle;
        title.dataset.titleMode = "full";
        if (title.scrollWidth > title.clientWidth) {
          title.textContent = compactTitle;
          title.dataset.titleMode = "compact";
        }
      });
  }

  function initializeStudentPortalWelcome() {
    const toggle = document.getElementById("student-portal-welcome-toggle");
    if (!toggle || toggle.dataset.initialized) return;
    studentPortalWelcomeHiddenPreference = false;
    try {
      studentPortalWelcomeHiddenPreference =
        globalScope.localStorage.getItem(STUDENT_PORTAL_WELCOME_HIDDEN_KEY) ===
        "true";
    } catch (error) {
      (globalScope.DebugUtils || console).error(
        "Unable to read the Student Portal welcome visibility preference.",
        error,
      );
    }
    const cachedProfile = getStoredReviewerProfile();
    if (cachedProfile) {
      const displayName = [
        cachedProfile.firstName,
        cachedProfile.middleInitial,
        cachedProfile.lastName,
      ]
        .filter(Boolean)
        .join(" ");
      renderStudentPortalWelcome(
        cachedProfile.accountStatus === "NOT_FOUND" ? "" : displayName,
        cachedProfile.email,
        cachedProfile.picture,
        cachedProfile.lastName,
        cachedProfile.accountStatus,
      );
      if (!hasExplicitReviewerSignOut() && getStoredReviewerSessionId())
        renderStudentPortalWelcomeAccessIcon(
          cachedProfile.email,
          cachedProfile.accountStatus,
          true,
        );
    }
    if (
      cachedProfile ||
      hasExplicitReviewerSignOut() ||
      !getStoredReviewerSessionId()
    )
      revealStudentPortalWelcome();
    toggle.addEventListener("click", () => {
      setStudentPortalWelcomeHidden(
        !document.getElementById("student-portal-welcome")?.hidden,
        true,
      );
    });
    document
      .getElementById("student-portal-welcome-email-toggle")
      ?.addEventListener("click", toggleStudentPortalWelcomeEmail);
    toggle.dataset.initialized = "true";
    const welcome = document.getElementById("student-portal-welcome");
    const container = document.querySelector(
      ".student-portal-welcome-container",
    );
    const portal = document.querySelector(".student-portal-deck");
    if (
      welcome &&
      container &&
      portal &&
      typeof globalScope.ResizeObserver === "function"
    ) {
      studentPortalWelcomeNameObserver?.disconnect();
      studentPortalWelcomeNameObserver = new globalScope.ResizeObserver(
        updateStudentPortalWelcome,
      );
      [
        welcome,
        container,
        ...document.querySelectorAll(".student-portal-deck"),
      ].forEach((element) => studentPortalWelcomeNameObserver.observe(element));
    } else if (!studentPortalWelcomeNameResizeHandler) {
      studentPortalWelcomeNameResizeHandler = () => {
        updateStudentPortalWelcomeLayout();
        updateStudentPortalWelcomeName();
        updateStudentPortalDeckTitles();
      };
      globalScope.addEventListener(
        "resize",
        studentPortalWelcomeNameResizeHandler,
      );
    }
    const welcomeName = document.getElementById("student-portal-welcome-name");
    if (welcomeName) {
      studentPortalWelcomeNameObserver?.observe(welcomeName);
    }
    updateStudentPortalWelcome();
    updateStudentPortalDeckTitles();
    document.fonts?.ready?.then(updateStudentPortalDeckTitles);
  }

  function revealStudentPortalWelcome() {
    if (studentPortalWelcomeInitialized) return;
    studentPortalWelcomeInitialized = true;
    setStudentPortalWelcomeHidden(studentPortalWelcomeHiddenPreference);
  }

  function updateStudentPortalWelcome() {
    updateStudentPortalWelcomeLayout();
    updateStudentPortalWelcomeName();
    updateStudentPortalDeckTitles();
  }

  function updateStudentPortalWelcomeEmail() {
    const welcomeEmail = document.getElementById(
      "student-portal-welcome-email",
    );
    const emailToggle = document.getElementById(
      "student-portal-welcome-email-toggle",
    );
    if (!welcomeEmail || !emailToggle) return;
    const separatorIndex = studentPortalWelcomeEmailAddress.lastIndexOf("@");
    const maskedEmail =
      separatorIndex > 0
        ? `•••••••${studentPortalWelcomeEmailAddress.slice(separatorIndex)}`
        : "•••••••";
    welcomeEmail.textContent = studentPortalWelcomeEmailVisible
      ? studentPortalWelcomeEmailAddress
      : maskedEmail;
    emailToggle.setAttribute(
      "aria-label",
      studentPortalWelcomeEmailVisible
        ? "Hide email address"
        : "Show email address",
    );
    emailToggle.setAttribute(
      "aria-pressed",
      String(studentPortalWelcomeEmailVisible),
    );
    const icon = emailToggle.querySelector("i");
    if (icon)
      icon.className = studentPortalWelcomeEmailVisible
        ? "fa-solid fa-eye"
        : "fa-solid fa-eye-slash";
  }

  function toggleStudentPortalWelcomeEmail() {
    if (!studentPortalWelcomeEmailAddress) return false;
    studentPortalWelcomeEmailVisible = !studentPortalWelcomeEmailVisible;
    updateStudentPortalWelcomeEmail();
    return true;
  }

  function renderStudentPortalWelcome(
    name,
    email,
    pictureUrl = "",
    lastName = "",
    accountStatus = "",
  ) {
    const welcomeName = document.getElementById("student-portal-welcome-name");
    const welcomeEmail = document.getElementById(
      "student-portal-welcome-email",
    );
    const welcomeAccessIcon = document.getElementById(
      "student-portal-welcome-access-icon",
    );
    const welcomeVerification = document.getElementById(
      "student-portal-welcome-verification",
    );
    const welcomeViewProfile = document.getElementById(
      "student-portal-welcome-view-profile",
    );
    const welcomeSignIn = document.getElementById(
      "student-portal-welcome-signin",
    );
    const welcomeSignInHint = document.getElementById(
      "student-portal-welcome-signin-hint",
    );
    const welcomePicture = document.getElementById(
      "student-portal-welcome-picture",
    );
    const welcomeIcon = document.getElementById("student-portal-welcome-icon");
    if (welcomeName) {
      welcomeName.dataset.fullName = name || "Guest";
      welcomeName.dataset.lastName = lastName || name || "Guest";
      updateStudentPortalWelcomeName();
    }
    const isSignedIn = Boolean(email);
    studentPortalWelcomeEmailAddress = isSignedIn ? String(email) : "";
    if (!isSignedIn) studentPortalWelcomeEmailVisible = false;
    if (welcomeEmail) {
      updateStudentPortalWelcomeEmail();
      welcomeEmail.hidden = !isSignedIn;
    }
    const welcomeEmailToggle = document.getElementById(
      "student-portal-welcome-email-toggle",
    );
    if (welcomeEmailToggle) welcomeEmailToggle.hidden = !isSignedIn;
    renderStudentPortalWelcomeAccessIcon(
      email,
      accountStatus,
      false,
      welcomeAccessIcon,
    );
    const isUnverified = isSignedIn && accountStatus === "NOT_FOUND";
    if (welcomeVerification) welcomeVerification.hidden = !isUnverified;
    if (welcomeViewProfile) welcomeViewProfile.hidden = !isSignedIn;
    if (welcomeSignIn) welcomeSignIn.hidden = isSignedIn;
    if (welcomeSignInHint) welcomeSignInHint.hidden = isSignedIn;
    if (welcomePicture) {
      welcomePicture.onerror = () => {
        welcomePicture.hidden = true;
        welcomePicture.removeAttribute("src");
        if (welcomeIcon) welcomeIcon.hidden = false;
      };
      welcomePicture.hidden = !pictureUrl;
      if (pictureUrl) welcomePicture.src = pictureUrl;
      else welcomePicture.removeAttribute("src");
    }
    revealStudentPortalWelcome();
    if (welcomeIcon) welcomeIcon.hidden = Boolean(pictureUrl);
  }

  function renderStudentPortalWelcomeAccessIcon(
    email,
    accountStatus,
    syncing = false,
    iconElement = document.getElementById("student-portal-welcome-access-icon"),
  ) {
    if (!iconElement) return;
    const showSyncingIndicator =
      syncing && !studentPortalWelcomeAccessSpinnerShown;
    if (showSyncingIndicator) studentPortalWelcomeAccessSpinnerShown = true;
    const accessIcon = showSyncingIndicator
      ? ["fa-spinner fa-spin", "is-syncing", "Syncing access status"]
      : {
          TRUE: ["fa-check", "is-granted", "Access granted"],
          FALSE: ["fa-triangle-exclamation", "is-pending", "Access pending"],
          DENIED: ["fa-xmark", "is-denied", "Access denied"],
          RESTRICTED: ["fa-ban", "is-restricted", "Access restricted"],
        }[accountStatus];
    iconElement.className = [
      "student-portal-welcome-access-icon",
      accessIcon?.[1] || "",
      accessIcon ? `fa-solid ${accessIcon[0]}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    iconElement.title = accessIcon?.[2] || "";
    iconElement.setAttribute("aria-label", accessIcon?.[2] || "");
    iconElement.hidden = !email || !accessIcon;
  }

  function setStudentPortalWelcomeAccessSyncing(syncing) {
    renderStudentPortalWelcomeAccessIcon(
      reviewerAuthorizedEmail,
      reviewerAccountStatus,
      syncing,
    );
  }

  function isStudentPortalWelcomeAccessSyncing() {
    return Boolean(
      reviewerSessionRestorePending ||
      reviewerStatusPollInFlight ||
      reviewerSessionCoordinator.isSessionRestoreRetryScheduled(),
    );
  }

  function populateReviewerProfile(response) {
    reviewerProfileUICore.populateProfile(response);
  }

  function prefillReviewerNameFromGoogle(profile) {
    return reviewerProfileUICore.prefillNameFromGoogle(profile);
  }

  function renderReviewerProfileAccessStatus(accountStatus) {
    reviewerProfileUICore.renderAccessStatus(accountStatus);
  }

  function applyReviewerAccountStatus(
    response,
    sessionId,
    preserveProfileEditor = false,
    suppressDashboardLoad = false,
  ) {
    if (
      response?.status !== "success" ||
      typeof response.email !== "string" ||
      !response.email.trim() ||
      !["TRUE", "FALSE", "DENIED", "RESTRICTED", "NOT_FOUND"].includes(
        response.accountStatus,
      )
    ) {
      throw new Error("The account approval service returned invalid status.");
    }
    const accountStatus = response.accountStatus;
    const accessStatusChanged = reviewerAccountStatus !== accountStatus;
    if (accountStatus !== "TRUE")
      closeReviewerPdfPreview("account-status-changed");
    reviewerAccountStatus = accountStatus;
    cacheReviewerProfile(response);
    const authStatus = document.getElementById("resource-reviewer-auth-status");
    authStatus?.removeAttribute("aria-busy");
    const form = document.getElementById("resource-reviewer-enrollment-form");
    const profileDetails = document.getElementById(
      "resource-profile-account-details",
    );
    const formButton = form?.querySelector('button[type="submit"]');
    const cancelEditButton = document.getElementById(
      "resource-reviewer-cancel-edit",
    );
    const signInButton = document.getElementById(
      "resource-reviewer-signin-button",
    );
    const retryButton = document.getElementById(
      "resource-reviewer-retry-verification",
    );
    const signoutButton = document.getElementById("resource-reviewer-signout");
    const inputs = {
      lastName: document.getElementById("resource-reviewer-last-name"),
      firstName: document.getElementById("resource-reviewer-first-name"),
      middleInitial: document.getElementById(
        "resource-reviewer-middle-initial",
      ),
    };
    const keepProfileEditorOpen =
      preserveProfileEditor && reviewerProfileEditing;
    const preserveEnrollmentDraft =
      keepProfileEditorOpen ||
      (form &&
        !form.hidden &&
        Object.values(inputs).some(
          (input) =>
            input &&
            input.dataset.savedValue !== undefined &&
            input.value !== input.dataset.savedValue,
        ));
    reviewerAuthorizedEmail = response.email;
    if (!reviewerVerificationRetryToken)
      reviewerVerificationRetryAvailable = false;
    reviewerReauthenticationPromptAttempted = false;
    if (retryButton && !reviewerVerificationRetryToken)
      retryButton.hidden = true;
    reviewerProfilePictureUrl = getReviewerProfilePictureUrl(response.picture);
    if (accountStatus === "TRUE") {
      if (
        reviewerPdfSourceCache &&
        reviewerPdfSourceCache.sessionId !== sessionId
      )
        clearReviewerPdfSourceCache();
      if (reviewerSessionId && reviewerSessionId !== sessionId)
        reviewerPdfSourceReuseSupported = true;
      reviewerSessionId = sessionId;
      reviewerPendingEnrollmentSessionId = "";
    } else {
      clearReviewerPdfSourceCache();
      reviewerPdfSourceReuseSupported = true;
      reviewerSessionId = "";
      reviewerPendingEnrollmentSessionId = sessionId;
      if (
        accessStatusChanged ||
        reviewerDashboardLoadedForEmail ||
        resourceDashboardData?.REVIEWERS?.rows?.length
      )
        clearReviewerResourceRows();
    }
    populateReviewerProfile(response);
    setReviewerAccessEnabled(accountStatus === "TRUE");
    if (signInButton) signInButton.hidden = true;
    if (signoutButton) signoutButton.hidden = false;
    if (keepProfileEditorOpen) {
      if (form) form.hidden = false;
      if (profileDetails) profileDetails.hidden = true;
      if (cancelEditButton) cancelEditButton.hidden = false;
      if (formButton) formButton.textContent = "Save changes for approval";
    } else {
      reviewerProfileEditing = false;
      if (profileDetails) profileDetails.hidden = accountStatus === "NOT_FOUND";
      if (form)
        form.hidden = !(
          accountStatus === "NOT_FOUND" || accountStatus === "DENIED"
        );
      if (cancelEditButton) cancelEditButton.hidden = true;
      if (formButton)
        formButton.textContent =
          accountStatus === "NOT_FOUND"
            ? "Verify"
            : accountStatus === "DENIED"
              ? "Resubmit"
              : response.profileUpdated
                ? "Save changes for approval"
                : "Submit";
      if (!preserveEnrollmentDraft) {
        if (accountStatus === "NOT_FOUND") {
          Object.values(inputs).forEach((input) => {
            if (input) input.value = "";
          });
        } else {
          if (inputs.lastName) inputs.lastName.value = response.lastName || "";
          if (inputs.firstName)
            inputs.firstName.value = response.firstName || "";
          if (inputs.middleInitial)
            inputs.middleInitial.value = response.middleInitial || "";
        }
        Object.values(inputs).forEach((input) => {
          if (input) input.dataset.savedValue = input.value;
        });
      }
    }
    prefillReviewerNameFromGoogle({
      accountStatus,
      suggestedFirstName: response.suggestedFirstName,
      suggestedLastName: response.suggestedLastName,
    });
    updateReviewerEmailNameWarning();
    if (authStatus) authStatus.textContent = "";
    if (accountStatus === "TRUE") {
      void warmReviewerPdfViewer().catch((error) => {
        (globalScope.DebugUtils || console).warn(
          "Unable to warm Reviewer PDF workers before use.",
          error,
        );
      });
      if (
        isReviewerBackendAvailable() &&
        !reviewerDashboardRequestPromise &&
        (!suppressDashboardLoad || accessStatusChanged)
      )
        void loadReviewerDashboard({
          refresh: accessStatusChanged,
          showLoading: resourceDashboardActiveTab === "REVIEWERS",
        });
      if (!resourceDashboardData) void loadResourceDashboard({ silent: true });
    }
    if (accountStatus !== "TRUE" && resourceDashboardActiveTab === "REVIEWERS")
      openResourceDashboardTab("PROFILE");
    return accountStatus === "TRUE";
  }

  function scheduleReviewerStatusPolling(
    sessionId,
    delay = REVIEWER_STATUS_POLL_INTERVAL_MS,
    resetBackoff = true,
  ) {
    stopReviewerStatusPolling();
    if (resetBackoff) resetReviewerStatusPollBackoff();
    if (!sessionId) {
      reviewerStatusPollRetryAttempt = 0;
      return;
    }
    if (document.hidden === true || document.visibilityState === "hidden")
      return;
    const authGeneration = reviewerAuthGeneration;
    const normalizedDelay = Math.max(0, Number(delay) || 0);
    const pollDelay = normalizedDelay;
    reviewerSessionCoordinator.scheduleStatusPoll(async () => {
      if (document.hidden === true || document.visibilityState === "hidden")
        return;
      if (
        authGeneration !== reviewerAuthGeneration ||
        (sessionId !== reviewerPendingEnrollmentSessionId &&
          sessionId !== reviewerSessionId)
      )
        return;
      if (reviewerStatusPollInFlight) {
        scheduleReviewerStatusPolling(
          sessionId,
          REVIEWER_STATUS_POLL_INTERVAL_MS,
          false,
        );
        return;
      }
      reviewerStatusPollInFlight = true;
      let nextPollDelay = getReviewerStatusPollDelay(
        reviewerStatusPollWindowStartedAt,
        reviewerStatusPollUnchangedCount,
      );
      setStudentPortalWelcomeAccessSyncing(true);
      try {
        const pollResult = await withReviewerCrossTabRequest(
          "status",
          reviewerAuthorizedEmail,
          () => getReviewerAccountStatus(sessionId),
          sessionId,
        );
        if (!pollResult.acquired) return;
        const response = pollResult.value;
        if (
          authGeneration !== reviewerAuthGeneration ||
          (sessionId !== reviewerPendingEnrollmentSessionId &&
            sessionId !== reviewerSessionId)
        )
          return;
        const previousAccountStatus = reviewerAccountStatus;
        applyReviewerAccountStatus(response, sessionId, true);
        if (response.accountStatus !== previousAccountStatus) {
          resetReviewerStatusPollBackoff();
        } else {
          reviewerStatusPollUnchangedCount += 1;
        }
        nextPollDelay = getReviewerStatusPollDelay(
          reviewerStatusPollWindowStartedAt,
          reviewerStatusPollUnchangedCount,
        );
        void broadcastReviewerAccountStatus(response, sessionId);
        reviewerStatusPollRetryAttempt = 0;
      } catch (error) {
        if (authGeneration !== reviewerAuthGeneration) return;
        const authStatus = document.getElementById(
          "resource-reviewer-auth-status",
        );
        if (isDefinitivelyInvalidReviewerCredential(error)) {
          const retryCredential = reviewerVerificationRetryToken
            ? reviewerVerificationRetryToken
            : "";
          signOutReviewer(false);
          if (authStatus)
            authStatus.textContent = retryCredential
              ? "Your saved access session expired. Retry verification of your new Google sign-in."
              : "Your access session expired. Sign in with Google again to check access.";
          if (retryCredential) {
            reviewerVerificationRetryToken = retryCredential;
            reviewerVerificationRetryAvailable = true;
            const retryButton = document.getElementById(
              "resource-reviewer-retry-verification",
            );
            if (retryButton) retryButton.hidden = false;
          } else {
            promptReviewerReauthentication();
          }
          return;
        }
        nextPollDelay = Math.min(
          REVIEWER_STATUS_POLL_INTERVAL_MS *
            2 ** Math.min(reviewerStatusPollRetryAttempt + 1, 5),
          REVIEWER_STATUS_POLL_RETRY_MAX_MS,
        );
        reviewerStatusPollRetryAttempt = Math.min(
          reviewerStatusPollRetryAttempt + 1,
          5,
        );
        (globalScope.DebugUtils || console).error(
          "Unable to refresh reviewer account approval status.",
        );
      } finally {
        reviewerStatusPollInFlight = false;
        setStudentPortalWelcomeAccessSyncing(
          isStudentPortalWelcomeAccessSyncing(),
        );
        if (
          authGeneration === reviewerAuthGeneration &&
          (sessionId === reviewerPendingEnrollmentSessionId ||
            sessionId === reviewerSessionId)
        ) {
          scheduleReviewerStatusPolling(sessionId, nextPollDelay, false);
        }
      }
    }, pollDelay);
  }

  async function withReviewerCrossTabRequest(
    kind,
    email,
    request,
    sessionId = "",
  ) {
    return reviewerSessionCoordinator.withCrossTabRequest(
      kind,
      email,
      request,
      sessionId,
    );
  }

  async function completeReviewerSignIn(idToken) {
    const authStatus = document.getElementById("resource-reviewer-auth-status");
    if (!idToken) {
      setReviewerNavigationBusy(false);
      setReviewerAuthStatus("Use Google to sign in and request access.");
      return false;
    }
    if (reviewerVerificationInFlightToken === idToken) return false;
    const previousSessionId =
      reviewerSessionId || reviewerPendingEnrollmentSessionId;
    const authGeneration = ++reviewerAuthGeneration;
    reviewerSessionRestoreTarget = "";
    reviewerSessionRestorePromises.clear();
    reviewerAccountStatusPromises.clear();
    reviewerAuthCheckPending = false;
    stopReviewerStatusPolling();
    reviewerVerificationRetryAvailable = false;
    reviewerVerificationRetryToken = idToken;
    reviewerVerificationInFlightToken = idToken;
    setReviewerNavigationBusy(true);
    setReviewerAuthStatus("Signing in...", true);
    const retryButton = document.getElementById(
      "resource-reviewer-retry-verification",
    );
    if (retryButton) {
      retryButton.hidden = true;
      retryButton.disabled = true;
    }
    try {
      const signInEventId = createResourceEventId();
      const reviewerSessionKeys =
        await globalScope.AppNetwork.createReviewerSessionKeyPair();
      const signInRequestStartedAt = Date.now();
      const response = await reviewerAuthCore.verifyAccess(
        idToken,
        signInEventId,
        reviewerSessionKeys.publicKey,
      );
      (globalScope.DebugUtils || console).info(
        "Reviewer sign-in verification timing.",
        {
          backendRoundTripMs: Date.now() - signInRequestStartedAt,
          accountStatus: String(response?.accountStatus || "unknown"),
        },
      );
      if (
        authGeneration !== reviewerAuthGeneration ||
        reviewerVerificationInFlightToken !== idToken
      )
        return false;
      reviewerVerificationInFlightToken = "";
      if (retryButton) retryButton.disabled = false;
      const sessionId = String(response?.sessionId || "");
      if (!/^[a-f0-9]{96}$/.test(sessionId))
        throw new Error(
          "Google sign-in did not return a valid application session.",
        );
      try {
        await globalScope.AppNetwork.storeReviewerSessionKeyPair(
          sessionId,
          reviewerSessionKeys.keyPair,
        );
        saveReviewerSessionId(sessionId);
      } catch (storageError) {
        try {
          await globalScope.AppNetwork.clearReviewerSessionKeyPair(sessionId);
        } catch (cleanupError) {
          (globalScope.DebugUtils || console).error(
            "Unable to clear an incomplete Reviewer session key.",
            cleanupError,
          );
        }
        throw storageError;
      }
      if (reviewerVerificationRetryToken === idToken)
        reviewerVerificationRetryToken = "";
      const approved = applyReviewerAccountStatus(response, sessionId);
      scheduleReviewerStatusPolling(sessionId);
      if (approved) {
        void loadReviewerDashboard({ showLoading: resourceDashboardActiveTab === "REVIEWERS" });
        if (resourceDashboardActiveTab !== "REVIEWERS")
          void openResourceDashboardTab(getLastResourceDashboardSection());
      }
      return approved;
    } catch (error) {
      if (authGeneration !== reviewerAuthGeneration) return false;
      if (isDefinitivelyInvalidReviewerCredential(error)) {
        reviewerVerificationInFlightToken = "";
        if (previousSessionId) {
          reviewerVerificationRetryToken = "";
          reviewerVerificationRetryAvailable = false;
          if (retryButton) retryButton.hidden = true;
          if (authStatus)
            authStatus.textContent =
              "The new Google sign-in could not be verified. Your existing sign-in remains active.";
          scheduleReviewerStatusPolling(previousSessionId);
        } else {
          signOutReviewer(false);
          setReviewerAuthStatus(
            "Google sign-in expired or is no longer valid. Sign in with Google again.",
          );
          promptReviewerReauthentication();
        }
      } else {
        reviewerVerificationInFlightToken = "";
        reviewerVerificationRetryToken = idToken;
        reviewerVerificationRetryAvailable = true;
        setReviewerNavigationBusy(false);
        if (retryButton) {
          retryButton.hidden = false;
          retryButton.disabled = false;
        }
        setReviewerAuthStatus(
          "Google sign-in could not be verified right now. " +
            (previousSessionId ? "Your existing sign-in is retained; " : "") +
            "retry verification or use Google sign-in again.",
        );
        if (previousSessionId) scheduleReviewerStatusPolling(previousSessionId);
      }
      if (authGeneration === reviewerAuthGeneration)
        authStatus?.removeAttribute("aria-busy");
      (globalScope.DebugUtils || console).error(
        "Unable to verify reviewer account approval.",
      );
      return false;
    } finally {
      if (
        authGeneration === reviewerAuthGeneration &&
        reviewerVerificationInFlightToken === idToken
      ) {
        reviewerVerificationInFlightToken = "";
        if (retryButton) retryButton.disabled = false;
      }
      if (authGeneration === reviewerAuthGeneration)
        authStatus?.removeAttribute("aria-busy");
    }
  }

  async function requestReviewerEnrollment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const authStatus = document.getElementById("resource-reviewer-auth-status");
    const submitButton = form.querySelector('button[type="submit"]');
    let submissionSucceeded = false;
    let enrollmentOutcomeMessage = "";
    const enrollmentSessionId =
      reviewerPendingEnrollmentSessionId || reviewerSessionId;
    if (!enrollmentSessionId) {
      if (authStatus)
        authStatus.textContent =
          "Sign in with Google before submitting your profile.";
      return false;
    }
    const lastNameInput = document.getElementById(
      "resource-reviewer-last-name",
    );
    const firstNameInput = document.getElementById(
      "resource-reviewer-first-name",
    );
    const middleInitialInput = document.getElementById(
      "resource-reviewer-middle-initial",
    );
    if (lastNameInput)
      lastNameInput.value = capitalizeReviewerName(lastNameInput.value).trim();
    if (firstNameInput)
      firstNameInput.value = capitalizeReviewerName(
        firstNameInput.value,
      ).trim();
    if (middleInitialInput) {
      normalizeReviewerMiddleInitialInput(middleInitialInput);
    }
    const lastName = String(lastNameInput?.value || "").trim();
    const firstName = String(firstNameInput?.value || "").trim();
    const middleInitial = String(middleInitialInput?.value || "").trim();
    updateReviewerEmailNameWarning();
    if (
      !lastName ||
      !firstName ||
      (middleInitial && !/^[A-Z]\.$/.test(middleInitial))
    ) {
      if (authStatus)
        authStatus.textContent =
          !lastName || !firstName
            ? "Enter your last name and first name."
            : "Middle Initial must be one letter followed by a period.";
      if (!lastName) lastNameInput?.focus();
      else if (!firstName) firstNameInput?.focus();
      else middleInitialInput?.focus();
      return false;
    }
    const confirmed = await requestConfirmation(
      "False information will strictly not be entertained and will be ignored and deleted. Confirm that the name entered here is accurate and belongs to you before submitting.",
      "Confirm Your Name",
    );
    if (!confirmed) return false;
    const authGeneration = ++reviewerAuthGeneration;
    stopReviewerStatusPolling();
    if (submitButton) submitButton.disabled = true;
    if (authStatus) authStatus.textContent = "";
    setReviewerEnrollmentStatus(
      "Submitting your profile for administrator review...",
      true,
    );
    try {
      const response = await reviewerAuthCore.requestEnrollment(
        enrollmentSessionId,
        createResourceEventId(),
        { lastName, firstName, middleInitial },
      );
      if (
        authGeneration !== reviewerAuthGeneration ||
        (enrollmentSessionId !== reviewerPendingEnrollmentSessionId &&
          enrollmentSessionId !== reviewerSessionId)
      )
        return false;
      if (
        response?.status !== "success" ||
        !["FALSE", "TRUE"].includes(response.accountStatus)
      )
        throw new Error(
          response?.message || "The profile request was not saved as pending.",
        );
      submissionSucceeded = true;
      enrollmentOutcomeMessage =
        response.auditStatus === "pending"
          ? String(
              response.message ||
                "Your profile is saved, but its audit record is still pending. Retry this submission.",
            )
          : "";
      applyReviewerAccountStatus(
        {
          ...response,
          picture: reviewerProfilePictureUrl,
          profileUpdated:
            reviewerProfileEditing && response.accountStatus === "FALSE",
        },
        enrollmentSessionId,
      );
      setReviewerEnrollmentStatus(enrollmentOutcomeMessage);
      scheduleReviewerStatusPolling(enrollmentSessionId);
      return true;
    } catch (error) {
      if (authGeneration !== reviewerAuthGeneration) return false;
      if (isDefinitivelyInvalidReviewerCredential(error)) {
        signOutReviewer(false);
        if (authStatus)
          authStatus.textContent =
            "Your access session expired or was revoked. Sign in with Google again.";
        return false;
      }
      setReviewerEnrollmentStatus(
        "Unable to submit account details: " + String(error?.message || error),
      );
      (globalScope.DebugUtils || console).error(
        "Unable to submit reviewer account details.",
      );
      return false;
    } finally {
      if (submitButton) submitButton.disabled = false;
      const enrollmentStatus = document.getElementById(
        "resource-reviewer-enrollment-status",
      );
      enrollmentStatus?.removeAttribute("aria-busy");
      if (submissionSucceeded)
        setReviewerEnrollmentStatus(enrollmentOutcomeMessage);
      if (
        authGeneration === reviewerAuthGeneration &&
        (enrollmentSessionId === reviewerPendingEnrollmentSessionId ||
          enrollmentSessionId === reviewerSessionId)
      )
        scheduleReviewerStatusPolling(enrollmentSessionId);
    }
  }

  async function completeReviewerSessionRevocation(revocation) {
    const retryButton = document.getElementById(
      "resource-reviewer-retry-verification",
    );
    if (retryButton) retryButton.disabled = true;
    try {
      const response = await reviewerAuthCore.revokeSession(
        revocation.sessionId,
        revocation.eventId,
      );
      if (
        response?.status !== "success" ||
        (Object.prototype.hasOwnProperty.call(response, "revoked") &&
          response.revoked !== true)
      )
        throw new Error("The server did not confirm session revocation.");
      if (reviewerPendingRevocation !== revocation) return;
      if (response.auditLogged === false) {
        setReviewerAuthStatus(
          "The server confirmed sign-out, but its audit log is still pending. Reconnect and select Retry to record it; retry details are held only in this page.",
        );
        if (retryButton) retryButton.hidden = false;
      } else {
        reviewerPendingRevocation = null;
        if (retryButton) retryButton.hidden = true;
        setReviewerAuthStatus(
          "The server confirmed that your access session was revoked.",
        );
      }
    } catch (error) {
      if (reviewerPendingRevocation !== revocation) return;
      setReviewerAuthStatus(
        "The server did not confirm session revocation. Your saved credentials were cleared from this device. Reconnect and select Retry to try again; the retry credential is held only in this page.",
      );
      if (retryButton) retryButton.hidden = false;
      (globalScope.DebugUtils || console).error(
        "Unable to confirm access-session revocation.",
      );
    } finally {
      if (retryButton) retryButton.disabled = false;
      if (!reviewerSessionId) {
        try {
          await globalScope.AppNetwork.clearReviewerSessionKeyPair(
            revocation.sessionId,
          );
        } catch (error) {
          (globalScope.DebugUtils || console).error(
            "Unable to clear the saved Reviewer session key.",
            error,
          );
        }
      }
    }
  }

  function signOutReviewer(explicit = true, preserveStoredSession = false) {
    const sessionId =
      reviewerSessionId ||
      reviewerPendingEnrollmentSessionId ||
      getStoredReviewerSessionId();
    if (explicit && sessionId) {
      reviewerPendingRevocation = {
        sessionId,
        eventId: createResourceEventId(),
      };
      void completeReviewerSessionRevocation(reviewerPendingRevocation);
    }
    reviewerAuthGeneration += 1;
    stopReviewerSessionRestoreRetry();
    reviewerSessionCoordinator.resetSessionRestoreRetryBackoff();
    reviewerAuthCheckPending = false;
    reviewerSessionRestorePending = false;
    reviewerSessionRestoreTarget = "";
    reviewerSessionRestorePromises.clear();
    reviewerAccountStatusPromises.clear();
    reviewerVerificationInFlightToken = "";
    reviewerVerificationRetryToken = "";
    reviewerVerificationRetryAvailable = false;
    if (explicit) reviewerReauthenticationPromptAttempted = false;
    setReviewerEnrollmentStatus("");
    if (explicit) {
      try {
        setExplicitReviewerSignOut(true);
      } catch (error) {
        (globalScope.DebugUtils || console).error(
          "Unable to save the explicit reviewer sign-out preference.",
        );
      }
    }
    clearReviewerPdfSourceCache();
    reviewerPdfSourceReuseSupported = true;
    reviewerSessionId = "";
    reviewerPendingEnrollmentSessionId = "";
    if (!preserveStoredSession) clearStoredReviewerSession();
    if (!explicit && !preserveStoredSession && sessionId) {
      void globalScope.AppNetwork.clearReviewerSessionKeyPair(sessionId).catch(
        (error) =>
          (globalScope.DebugUtils || console).error(
            "Unable to clear the saved Reviewer session key.",
            error,
          ),
      );
    }
    closeReviewerPdfPreview("reviewer-signed-out");
    reviewerAuthorizedEmail = "";
    reviewerAccountStatus = "";
    reviewerDashboardLoadedForEmail = "";
    reviewerProfilePictureUrl = "";
    clearStoredReviewerProfile();
    clearStoredReviewerDashboard();
    setReviewerNavigationBusy(false);
    stopReviewerStatusPolling();
    reviewerDashboardRequestGeneration += 1;
    if (resourceDashboardData) {
      resourceDashboardData.REVIEWERS = {
        columns: [],
        rows: [],
        links: [],
        linkTitles: [],
        linkTypes: [],
        truncated: false,
      };
    }
    setReviewerAccessEnabled(false);
    const signInButton = document.getElementById(
      "resource-reviewer-signin-button",
    );
    const signoutButton = document.getElementById("resource-reviewer-signout");
    const retryButton = document.getElementById(
      "resource-reviewer-retry-verification",
    );
    if (signInButton) signInButton.hidden = false;
    if (signoutButton) signoutButton.hidden = true;
    if (retryButton) {
      retryButton.hidden = true;
      retryButton.disabled = false;
    }
    const enrollmentForm = document.getElementById(
      "resource-reviewer-enrollment-form",
    );
    if (enrollmentForm) enrollmentForm.hidden = true;
    const profileDetails = document.getElementById(
      "resource-profile-account-details",
    );
    if (profileDetails) {
      profileDetails.hidden = true;
      delete profileDetails.dataset.profileSignature;
    }
    const profilePicture = document.getElementById("resource-profile-picture");
    const profilePictureFallback = document.getElementById(
      "resource-profile-avatar-fallback",
    );
    if (profilePicture) {
      profilePicture.hidden = true;
      profilePicture.removeAttribute("src");
    }
    if (profilePictureFallback) profilePictureFallback.hidden = false;
    const headerProfilePicture = document.getElementById(
      "resource-dashboard-profile-picture",
    );
    const headerProfileIcon = document.querySelector(
      "#resource-dashboard-profile-nav > i",
    );
    if (headerProfilePicture) {
      headerProfilePicture.hidden = true;
      headerProfilePicture.removeAttribute("src");
    }
    if (headerProfileIcon) headerProfileIcon.hidden = false;
    renderStudentPortalWelcome("", "", "", "", "");
    setReviewerAuthStatus("Use Google to sign in and request access.");
    document
      .getElementById("resource-portal-status")
      ?.removeAttribute("aria-busy");
    document
      .getElementById("resource-portal-status")
      ?.classList?.remove("resource-dashboard-status-stacked");
    if (resourceDashboardActiveTab === "REVIEWERS")
      renderResourceDashboardTab();
    if (explicit) reviewerAuthCore.disableAutoSelect();
    return true;
  }

  async function loadReviewerDashboard(options = {}) {
    const {
      refresh = false,
      sessionRecheckAttempted = false,
      showLoading = false,
    } = options;
    if (!reviewerSessionId) {
      if (
        reviewerPendingEnrollmentSessionId ||
        reviewerVerificationInFlightToken ||
        reviewerAuthCheckPending ||
        reviewerSessionRestorePending
      ) {
        showReviewerDashboardLoading();
        return true;
      }
      return false;
    }
    let restoredDashboardCache = false;
    if (
      !refresh &&
      reviewerAccountStatus === "TRUE" &&
      reviewerDashboardLoadedForEmail?.toLowerCase() !==
        reviewerAuthorizedEmail.toLowerCase()
    ) {
      const cachedReviewerTab = getStoredReviewerDashboard(
        reviewerAuthorizedEmail,
      );
      if (cachedReviewerTab) {
        resourceDashboardData = {
          ...(resourceDashboardData || {}),
          REVIEWERS: cachedReviewerTab,
        };
        reviewerDashboardLoadedForEmail = reviewerAuthorizedEmail;
        restoredDashboardCache = true;
        renderResourceDashboardTab();
        void warmReviewerPdfViewer().catch((error) => {
          console.warn("Unable to warm Reviewer PDF viewer.", error);
        });
      }
    }
    if (
      !refresh &&
      !restoredDashboardCache &&
      reviewerDashboardLoadedForEmail?.toLowerCase() ===
        reviewerAuthorizedEmail.toLowerCase() &&
      resourceDashboardData?.REVIEWERS
    ) {
      setReviewerNavigationBusy(false);
      renderResourceDashboardTab();
      void warmReviewerPdfViewer().catch((error) => {
        console.warn("Unable to warm Reviewer PDF viewer.", error);
      });
      return true;
    }
    if (reviewerDashboardRequestPromise) return true;
    const requestGeneration = ++reviewerDashboardRequestGeneration;
    const requestSessionId = reviewerSessionId;
    const hasExistingReviewerRows = hasCachedAuthorizedReviewerDashboard();
    const preserveRenderedDashboard = refresh && hasExistingReviewerRows;
    const shouldShowLoading = showLoading && !preserveRenderedDashboard;
    const shouldSetNavigationBusy =
      (shouldShowLoading || resourceDashboardActiveTab === "REVIEWERS") &&
      !preserveRenderedDashboard;
    if (shouldSetNavigationBusy)
      setReviewerNavigationBusy(true);
    const status = document.getElementById("resource-portal-status");
    const tableHead = document.getElementById("resource-dashboard-table-head");
    const tableBody = document.getElementById("resource-dashboard-table-body");
    if (!status || !tableHead || !tableBody) {
      if (shouldSetNavigationBusy)
        setReviewerNavigationBusy(false);
      return false;
    }
    const silentRefresh = refresh && hasExistingReviewerRows;
    if (resourceDashboardActiveTab === "REVIEWERS") {
      if (!silentRefresh || shouldShowLoading)
        showReviewerDashboardLoading(
          !hasExistingReviewerRows,
          shouldShowLoading,
        );
    }
    let backendRequest = null;
    try {
      const requestReviewerDashboard = () =>
        globalScope.AppNetwork.callBackend(
          {
            type: "get_reviewer_dashboard",
            sessionId: requestSessionId,
            eventId: createResourceEventId(),
          },
          {
            timeoutMs: 15000,
            maxRetries: 3,
            baseRetryDelayMs: 500,
            maxRetryDelayMs: 4000,
          },
        );
      backendRequest =
        refresh && hasExistingReviewerRows
          ? withReviewerCrossTabRequest(
              "dashboard",
              reviewerAuthorizedEmail,
              requestReviewerDashboard,
              requestSessionId,
            )
          : requestReviewerDashboard().then((value) => ({
              acquired: true,
              value,
            }));
      reviewerDashboardRequestPromise = backendRequest;
      const dashboardRequestResult = await backendRequest;
      if (
        requestGeneration !== reviewerDashboardRequestGeneration ||
        requestSessionId !== reviewerSessionId
      )
        return false;
      if (!dashboardRequestResult.acquired) {
        if (resourceDashboardActiveTab === "REVIEWERS")
          renderResourceDashboardTab();
        return true;
      }
      const response = dashboardRequestResult.value;
      if (
        response?.status !== "success" ||
        typeof response.email !== "string" ||
        response.email.toLowerCase() !==
          reviewerAuthorizedEmail.toLowerCase() ||
        !Array.isArray(response.tab?.columns) ||
        !Array.isArray(response.tab?.rows) ||
        !response.tab.rows.every(Array.isArray)
      ) {
        throw new Error(
          response?.message ||
            "The reviewer dashboard returned invalid or unauthorized data.",
        );
      }
      const reviewerDashboardTab = mergeResourceDashboardUpdates(
        "REVIEWERS",
        resourceDashboardData?.REVIEWERS ||
          getStoredReviewerDashboard(reviewerAuthorizedEmail),
        normalizeReviewerDashboardTab(response.tab),
      );
      resourceDashboardData = {
        ...(resourceDashboardData || {}),
        REVIEWERS: reviewerDashboardTab,
      };
      reviewerDashboardLoadedForEmail = reviewerAuthorizedEmail;
      cacheReviewerDashboard(reviewerAuthorizedEmail, reviewerDashboardTab);
      if (refresh && hasExistingReviewerRows)
        broadcastReviewerDashboardSnapshot(reviewerDashboardTab);
      if (resourceDashboardActiveTab === "REVIEWERS" || showLoading)
        renderResourceDashboardTab();
      if (shouldSetNavigationBusy)
        setReviewerNavigationBusy(false);
      void warmReviewerPdfViewer().catch((error) => {
        console.warn("Unable to warm Reviewer PDF viewer.", error);
      });
      return true;
    } catch (error) {
      if (
        requestGeneration !== reviewerDashboardRequestGeneration ||
        requestSessionId !== reviewerSessionId
      )
        return false;
      if (shouldSetNavigationBusy)
        setReviewerNavigationBusy(false);
      if (
        [
          "UNAUTHORIZED",
          "FORBIDDEN",
          "SESSION_EXPIRED",
          "SESSION_INVALID",
          "SESSION_REVOKED",
        ].includes(error?.code)
      ) {
        if (!sessionRecheckAttempted) {
          try {
            const recheck = await reviewerAuthCore.restoreSession(
              requestSessionId,
              { timeoutMs: 10000, maxRetries: 1 },
            );
            if (
              requestGeneration !== reviewerDashboardRequestGeneration ||
              requestSessionId !== reviewerSessionId
            )
              return false;
            const matchingSessionAccount =
              recheck?.status === "success" &&
              typeof recheck.email === "string" &&
              recheck.email.toLowerCase() ===
                reviewerAuthorizedEmail.toLowerCase() &&
              ["TRUE", "FALSE", "DENIED", "RESTRICTED", "NOT_FOUND"].includes(
                recheck.accountStatus,
              );
            if (matchingSessionAccount && recheck.accountStatus === "TRUE") {
              reviewerDashboardRequestPromise = null;
              return loadReviewerDashboard({
                refresh: true,
                sessionRecheckAttempted: true,
              });
            }
            if (matchingSessionAccount) {
              applyReviewerAccountStatus(
                recheck,
                requestSessionId,
                false,
                true,
              );
              return false;
            }
            throw new Error(
              "The reviewer session recheck returned invalid account status.",
            );
          } catch (recheckError) {
            if (
              requestGeneration !== reviewerDashboardRequestGeneration ||
              requestSessionId !== reviewerSessionId
            )
              return false;
            (globalScope.DebugUtils || console).error(
              "Unable to recheck the Reviewer access session after a dashboard authorization failure.",
              {
                code: String(recheckError?.code || "REQUEST_FAILED")
                  .replace(/[^A-Za-z0-9_]/g, "")
                  .slice(0, 40),
                status: Number(recheckError?.status) || 0,
              },
            );
            if (isDefinitivelyInvalidReviewerCredential(recheckError)) {
              signOutReviewer(false);
              setResourceDashboardStatus(
                "Your access session expired or was revoked. Sign in with Google again to view review materials.",
              );
            } else {
              setResourceDashboardStatus(
                "Unable to verify your access session right now. Your session has been kept; retry loading review materials when online.",
              );
            }
            return false;
          }
        }
        setResourceDashboardStatus(
          "Your access session was verified, but the dashboard request is still being rejected. Retry loading review materials later.",
        );
      } else {
        if (!hasExistingReviewerRows) {
          reviewerDashboardLoadedForEmail = "";
        }
        if (
          resourceDashboardActiveTab === "REVIEWERS" &&
          !hasExistingReviewerRows
        ) {
          setResourceDashboardTableVisible("REVIEWERS", false);
          const correlationId =
            typeof error?.correlationId === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              error.correlationId,
            )
              ? error.correlationId
              : "";
          const errorMessage =
            error?.code === "SERVER_ERROR"
              ? "The server could not complete the request."
              : error?.code === "NON_JSON_RESPONSE"
                ? "The server returned an unexpected response."
                : String(error?.message || "Request failed.").slice(0, 180);
          setResourceDashboardStatus(
            `Unable to load review materials: ${errorMessage}${
              correlationId ? ` Reference: ${correlationId}.` : ""
            }`,
          );
        } else if (
          resourceDashboardActiveTab === "REVIEWERS" &&
          status.getAttribute("aria-busy") === "true" &&
          status.textContent.trim() === "Loading"
        ) {
          setResourceDashboardStatus(
            "Unable to refresh review materials. Showing saved results.",
          );
        }
      }
      (globalScope.DebugUtils || console).error(
        "Unable to load review materials.",
        {
          code: String(error?.code || "REQUEST_FAILED")
            .replace(/[^A-Za-z0-9_]/g, "")
            .slice(0, 40),
          status: Number(error?.status) || 0,
          correlationId: error?.correlationId || "",
        },
      );
      return false;
    } finally {
      if (reviewerDashboardRequestPromise === backendRequest)
        reviewerDashboardRequestPromise = null;
      if (
        requestGeneration === reviewerDashboardRequestGeneration &&
        (showLoading || resourceDashboardActiveTab === "REVIEWERS")
      ) {
        setReviewerNavigationBusy(false);
        if (resourceDashboardActiveTab === "REVIEWERS") {
          setReviewerDashboardFiltersDisabled(false);
          status.removeAttribute("aria-busy");
          status.classList?.remove("resource-dashboard-status-stacked");
        }
      }
    }
  }

  function getResourceDashboardRowKeys(tab, tabName) {
    return resourceCatalogCore.getResourceDashboardRowKeys(tab, tabName);
  }

  function mergeResourceDashboardUpdates(tabName, previousTab, nextTab) {
    return resourceCatalogCore.mergeResourceDashboardUpdates(
      tabName,
      previousTab,
      nextTab,
      RESOURCE_DASHBOARD_UPDATED_TTL_MS,
    );
  }

  function normalizeResourceDashboardIndex(tabName, index) {
    return resourceCatalogCore.normalizeResourceDashboardIndex(tabName, index);
  }

  function normalizeReviewerDashboardTab(tab) {
    return resourceCatalogCore.normalizeReviewerDashboardTab(tab);
  }

  function normalizeResourceDashboardTabs(tabs) {
    return resourceCatalogCore.normalizeResourceDashboardTabs(tabs);
  }

  function retainAuthorizedReviewerDashboardTab(tabs) {
    const reviewerTab = resourceDashboardData?.REVIEWERS;
    const hasValidReviewerTab =
      Array.isArray(reviewerTab?.columns) &&
      Array.isArray(reviewerTab?.rows) &&
      reviewerTab.rows.every(Array.isArray);
    const isCurrentAuthorizedReviewerTab =
      (reviewerSessionId ||
        (reviewerSessionRestorePending &&
          !hasExplicitReviewerSignOut() &&
          Boolean(getStoredReviewerSessionId()) &&
          reviewerAccountStatus === "TRUE")) &&
      reviewerDashboardLoadedForEmail &&
      reviewerAuthorizedEmail &&
      reviewerDashboardLoadedForEmail.toLowerCase() ===
        reviewerAuthorizedEmail.toLowerCase() &&
      hasValidReviewerTab;
    if (isCurrentAuthorizedReviewerTab)
      return { ...tabs, REVIEWERS: reviewerTab };
    if (reviewerDashboardLoadedForEmail) reviewerDashboardLoadedForEmail = "";
    return tabs;
  }

  function renderResourceDashboardSubjects() {
    const tab = resourceDashboardData?.MODULES;
    const panel = document.getElementById(
      "resource-dashboard-subjects-content",
    );
    const status = document.getElementById(
      "resource-dashboard-subjects-status",
    );
    const search = document.getElementById(
      "resource-dashboard-subjects-search",
    );
    const tableBody = document.getElementById(
      "resource-dashboard-subjects-body",
    );
    const tableHead = document.getElementById(
      "resource-dashboard-subjects-head",
    );
    if (!panel || !status || !tableBody || !tableHead) return false;
    panel.hidden = false;
    if (!tab) {
      showResourceDashboardTableLoading("SUBJECTS");
      return false;
    }
    const yearColumnIndex = tab.columns.findIndex(
      (column) => String(column).trim().toLowerCase() === "year",
    );
    const semesterColumnIndex = tab.columns.findIndex(
      (column) => String(column).trim().toLowerCase() === "semester",
    );
    const courseColumnIndex = tab.columns.findIndex(
      (column) => String(column).trim().toLowerCase() === "course",
    );
    const categoryColumns = tab.columns
      .map((column, index) => ({
        category: String(column).trim().toUpperCase(),
        index,
      }))
      .filter(({ category }) =>
        ["PRELIMS", "MIDTERMS", "FINALS"].includes(category),
      );
    const getTerm = (values) => {
      const yearValue = String(
        yearColumnIndex >= 0 ? values[yearColumnIndex] || "" : "",
      ).trim();
      const combinedTerm = /^(\d+)\s*[./-]\s*(\d+)$/.exec(yearValue);
      return {
        year: combinedTerm ? combinedTerm[1] : yearValue,
        semester: combinedTerm
          ? combinedTerm[2]
          : semesterColumnIndex >= 0
            ? String(values[semesterColumnIndex] || "").trim()
            : "",
      };
    };
    const sourceRows = tab.rows
      .map((values, rowIndex) => ({ values, rowIndex }))
      .filter(
        ({ values }) =>
          Array.isArray(values) &&
          String(courseColumnIndex >= 0 ? values[courseColumnIndex] || "" : "")
            .trim()
            .toLocaleUpperCase() !== "TOTAL",
      );
    const entries = resourceCatalogCore.getSubjectCatalogSeedEntries();
    sourceRows.forEach(({ values, rowIndex }) => {
      const { year, semester } = getTerm(values);
      const course = String(
        courseColumnIndex >= 0 ? values[courseColumnIndex] || "" : "",
      ).trim();
      if (!course) return;
      const categories = categoryColumns
        .filter(({ index }) => {
          const value = String(values[index] || "").trim();
          const link = String(tab.links?.[rowIndex]?.[index] || value);
          return value || isResourceDashboardLink(link);
        })
        .map(({ category, index }) => ({
          category,
          sourceName: String(
            tab.linkTitles?.[rowIndex]?.[index] || values[index] || course,
          ).trim(),
        }));
      if (!categories.length) return;
      entries.push({
        course,
        year,
        semester,
        categories,
        rowIndex,
      });
    });
    const years = new Set([
      ...entries.map((entry) => entry.year).filter(Boolean),
      "1",
      "2",
      "3",
    ]);
    const selectedYear = years.has(resourceDashboardSelectedYears.SUBJECTS)
      ? resourceDashboardSelectedYears.SUBJECTS
      : "all";
    resourceDashboardSelectedYears.SUBJECTS = selectedYear;
    const semesters = new Set([
      "1",
      "2",
      ...entries
        .filter(
          (entry) => selectedYear === "all" || entry.year === selectedYear,
        )
        .map((entry) => entry.semester)
        .filter(Boolean),
    ]);
    let selectedSemester =
      resourceDashboardSelectedSemesters.SUBJECTS === "all" ||
      semesters.has(resourceDashboardSelectedSemesters.SUBJECTS)
        ? resourceDashboardSelectedSemesters.SUBJECTS
        : "all";
    resourceDashboardSelectedSemesters.SUBJECTS = selectedSemester;
    const query = String(search?.value || "")
      .trim()
      .toLocaleLowerCase();
    const searchActive = Boolean(query);

    const renderFilterButtons = (id, values, selected, label, onSelect) => {
      const control = document.getElementById(id);
      if (!control) return;
      const fixedChoices =
        label === "year"
          ? ["1", "2", "3"]
          : label === "semester"
            ? ["1", "2"]
            : [];
      const choices = [...new Set([...fixedChoices, ...values])].sort(
        (left, right) =>
          left.localeCompare(right, undefined, { numeric: true }),
      );
      choices.push("all");
      control.replaceChildren(
        ...choices.map((value) => {
          const button = createResourceDashboardElement(
            "button",
            value === selected ? "is-active" : "",
            value === "all" ? "All" : value,
          );
          button.type = "button";
          button.dataset.filterValue = value;
          button.setAttribute("aria-pressed", String(value === selected));
          button.disabled =
            searchActive || (value !== "all" && !values.has(value));
          button.setAttribute("aria-disabled", String(button.disabled));
          button.addEventListener("click", () => {
            onSelect(value);
            saveResourceDashboardFilters();
            renderResourceDashboardSubjects();
          });
          return button;
        }),
      );
    };
    renderFilterButtons(
      "resource-dashboard-subjects-filter-year",
      years,
      selectedYear,
      "year",
      (value) => {
        resourceDashboardSelectedYears.SUBJECTS = value;
        void logResourceDashboardAction("SUBJECTS", "FILTER_YEAR", value);
      },
    );
    renderFilterButtons(
      "resource-dashboard-subjects-filter-semester",
      semesters,
      selectedSemester,
      "semester",
      (value) => {
        resourceDashboardSelectedSemesters.SUBJECTS = value;
        void logResourceDashboardAction("SUBJECTS", "FILTER_SEMESTER", value);
      },
    );
    const termNumber = (value) => {
      const number = Number(value);
      return Number.isFinite(number) && number > 0
        ? number
        : Number.MAX_SAFE_INTEGER;
    };
    const visibleEntries = entries
      .filter(
        (entry) =>
          Boolean(query) ||
          ((selectedYear === "all" || entry.year === selectedYear) &&
            (selectedSemester === "all" ||
              entry.semester === selectedSemester)),
      )
      .filter((entry) => {
        const searchText = [entry.course, getCourseTitle(entry.course)]
          .join(" ")
          .toLocaleLowerCase();
        return !query || searchText.includes(query);
      })
      .sort((left, right) => {
        const termOrder =
          termNumber(left.year) - termNumber(right.year) ||
          termNumber(left.semester) - termNumber(right.semester);
        if (termOrder) return termOrder;
        const courseSequenceOrder = compareResourceOrder(
          left.course,
          right.course,
        );
        if (courseSequenceOrder) return courseSequenceOrder;
        const resourceSequenceOrder = compareResourceOrder(
          left.categories[0]?.sourceName || "",
          right.categories[0]?.sourceName || "",
        );
        if (resourceSequenceOrder) return resourceSequenceOrder;
        return left.rowIndex - right.rowIndex;
      });
    const uniqueEntries = buildCourseCatalogEntries(visibleEntries);
    const subjectsTable = tableBody.closest("table");
    subjectsTable?.classList.toggle("is-search-active", searchActive);
    const headerRow = document.createElement("tr");
    ["Year", "Course", "Course Name"].forEach((label, index) => {
      const header = document.createElement("th");
      header.scope = "col";
      header.dataset.dashboardColumnKey = String(index);
      if (label === "Year")
        header.classList.add("resource-dashboard-column-year");
      if (label === "Course")
        header.classList.add("resource-dashboard-column-course");
      header.textContent = label;
      headerRow.appendChild(header);
    });
    const rowsToRender = uniqueEntries.length
      ? uniqueEntries.map((entry) => {
          const row = document.createElement("tr");
          row.dataset.dashboardRowKey = JSON.stringify([
            entry.year,
            entry.course,
            entry.subject,
          ]);
          row.dataset.search = `${entry.course} ${getCourseTitle(
            entry.course,
          )}`.toLocaleLowerCase();
          const courseCell = document.createElement("td");
          courseCell.classList.add("resource-dashboard-column-course");
          courseCell.dataset.dashboardColumnKey = "1";
          courseCell.textContent = entry.course.toLocaleUpperCase();
          const yearCell = document.createElement("td");
          yearCell.classList.add("resource-dashboard-column-year");
          yearCell.dataset.dashboardColumnKey = "0";
          yearCell.textContent = entry.year;
          const subjectsCell = document.createElement("td");
          subjectsCell.classList.add("resource-dashboard-column-subjects");
          subjectsCell.dataset.dashboardColumnKey = "2";
          subjectsCell.textContent = entry.subject;
          row.append(yearCell, courseCell, subjectsCell);
          return row;
        })
        : [
            (() => {
              const row = document.createElement("tr");
              row.dataset.dashboardRowKey = "empty";
              const cell = document.createElement("td");
              cell.className = "resource-dashboard-no-entries";
              cell.colSpan = 3;
              cell.textContent = "No entries are found.";
              row.appendChild(cell);
              return row;
            })(),
          ];
    reconcileResourceDashboardTable(
      tableHead,
      tableBody,
      headerRow,
      rowsToRender,
    );
    setResourceDashboardTableVisible("SUBJECTS", true);
    status.textContent = `Showing ${uniqueEntries.length} entries.`;
    status.classList?.add("resource-dashboard-entry-count");
    status.hidden = false;
    status.removeAttribute("aria-busy");
    if (search && !search.dataset.initialized) {
      search.addEventListener("input", () => {
        if (!search.isComposing) {
          const start = search.selectionStart;
          const end = search.selectionEnd;
          const uppercaseValue = search.value.toLocaleUpperCase();
          if (search.value !== uppercaseValue) {
            search.value = uppercaseValue;
            search.setSelectionRange(start, end);
          }
        }
        renderResourceDashboardSubjects();
      });
      search.addEventListener("compositionend", () => {
        search.value = search.value.toLocaleUpperCase();
        renderResourceDashboardSubjects();
      });
      search.addEventListener("change", () => {
        void logResourceDashboardAction(
          "SUBJECTS",
          "SUBJECTS_SEARCH",
          String(search.value || "").trim() ? "FILTERED" : "CLEARED",
        );
      });
      search.dataset.initialized = "true";
    }
    const focusSearchButton = document.getElementById(
      "resource-dashboard-subjects-search-focus",
    );
    if (focusSearchButton && !focusSearchButton.dataset.initialized) {
      focusSearchButton.addEventListener("click", () => search?.focus());
      focusSearchButton.dataset.initialized = "true";
    }
    const clearSearchButton = document.getElementById(
      "resource-dashboard-subjects-search-clear",
    );
    if (clearSearchButton && !clearSearchButton.dataset.initialized) {
      clearSearchButton.addEventListener("click", () => {
        if (!search) return;
        search.value = "";
        void logResourceDashboardAction(
          "SUBJECTS",
          "SUBJECTS_SEARCH",
          "CLEARED",
        );
        renderResourceDashboardSubjects();
      });
      clearSearchButton.dataset.initialized = "true";
    }
    if (clearSearchButton)
      clearSearchButton.disabled = !String(search?.value || "").length;
    updateResourceDashboardFilterIndicators();
    return true;
  }

  async function loadResourceDashboard({ silent = false } = {}) {
    const status = document.getElementById("resource-portal-status");
    const tableHead = document.getElementById("resource-dashboard-table-head");
    const tableBody = document.getElementById("resource-dashboard-table-body");
    if (!status || !tableHead || !tableBody) return false;
    if (resourceDashboardLoadingPromise) return resourceDashboardLoadingPromise;
    resourceDashboardController.markRefreshed();

    initializeResourceDashboardControls();
    void initializeReviewerAuth();
    const storage = globalScope.StorageUtils;
    const appVersion = String(globalScope.__MRH_APP__?.version || "").trim();
    const keepReviewerStatus = resourceDashboardActiveTab === "REVIEWERS";
    if (
      keepReviewerStatus &&
      (reviewerSessionId ||
        reviewerSessionRestorePending ||
        (!hasExplicitReviewerSignOut() && getStoredReviewerSessionId()))
    ) {
      showReviewerDashboardLoading();
    }
    let cachedDashboard = null;
    if (typeof storage?.getStoredJSON === "function") {
      const stored = storage.getStoredJSON(RESOURCE_DASHBOARD_CACHE_KEY, null);
      const hasValidCachedTab = (tab) =>
        Array.isArray(tab?.columns) &&
        Array.isArray(tab?.rows) &&
        tab.rows.every(Array.isArray);
      if (
        hasValidCachedTab(stored?.tabs?.MODULES) &&
        (hasValidCachedTab(stored?.tabs?.SYLLABUS) ||
          hasValidCachedTab(stored?.tabs?.REVIEWERS))
      ) {
        const sanitizedTabs = normalizeResourceDashboardTabs(stored.tabs);
        if (JSON.stringify(stored.tabs) !== JSON.stringify(sanitizedTabs)) {
          const saved =
            typeof storage.setStoredJSON === "function" &&
            storage.setStoredJSON(RESOURCE_DASHBOARD_CACHE_KEY, {
              ...stored,
              tabs: sanitizedTabs,
            });
          if (!saved) {
            const removed =
              typeof storage.removeStoredItem === "function" &&
              storage.removeStoredItem(RESOURCE_DASHBOARD_CACHE_KEY);
            if (!removed) {
              (globalScope.DebugUtils || console).error(
                "Unable to remove reviewer data from the cached dashboard.",
                new Error(
                  "The browser dashboard cache could not be sanitized.",
                ),
              );
            }
          }
        }
        if (
          stored.appVersion === appVersion &&
          typeof stored.version === "string"
        ) {
          cachedDashboard = { ...stored, tabs: sanitizedTabs };
          resourceDashboardData =
            retainAuthorizedReviewerDashboardTab(sanitizedTabs);
          renderResourceDashboardTab();
        }
      }
    }
    const activeTabs = cachedDashboard?.tabs || resourceDashboardData;
    const hasCachedActiveTab =
      resourceDashboardActiveTab === "SUBJECTS"
        ? Boolean(activeTabs?.MODULES)
        : Boolean(activeTabs?.[resourceDashboardActiveTab]);
    if (
      !silent &&
      !keepReviewerStatus &&
      (!cachedDashboard || !hasCachedActiveTab)
    ) {
      showResourceDashboardTableLoading(resourceDashboardActiveTab);
    }
    resourceDashboardLoadingPromise = (async () => {
      try {
        let response = await globalScope.AppNetwork.callBackend(
          {
            type: "get_resource_dashboard",
            eventId: createResourceEventId(),
            ...(reviewerSessionId ? { sessionId: reviewerSessionId } : {}),
            ...(cachedDashboard ? { version: cachedDashboard.version } : {}),
          },
          { timeoutMs: 30000, maxRetries: 0 },
        );
        if (response?.notModified === true && cachedDashboard) {
          if (response.version !== cachedDashboard.version) {
            throw new Error(
              "The dashboard cache version did not match the backend.",
            );
          }
          renderResourceDashboardTab();
          if (reviewerSessionId)
            void loadReviewerDashboard({
              refresh: true,
              showLoading: resourceDashboardActiveTab === "REVIEWERS",
            });
          return true;
        }
        if (response?.notModified === true) {
          response = await globalScope.AppNetwork.callBackend(
            {
              type: "get_resource_dashboard",
              eventId: createResourceEventId(),
              ...(reviewerSessionId ? { sessionId: reviewerSessionId } : {}),
            },
            { timeoutMs: 30000, maxRetries: 0 },
          );
        }
        if (response?.status !== "success") {
          throw new Error(
            response?.message || "The dashboard service returned invalid data.",
          );
        }
        const normalizedTabs = normalizeResourceDashboardTabs(response.tabs);
        const previousTabs = cachedDashboard?.tabs || resourceDashboardData;
        normalizedTabs.MODULES = mergeResourceDashboardUpdates(
          "MODULES",
          previousTabs?.MODULES,
          normalizedTabs.MODULES,
        );
        normalizedTabs.SYLLABUS = mergeResourceDashboardUpdates(
          "SYLLABUS",
          previousTabs?.SYLLABUS,
          normalizedTabs.SYLLABUS,
        );
        resourceDashboardData =
          retainAuthorizedReviewerDashboardTab(normalizedTabs);
        if (typeof storage?.setStoredJSON === "function" && appVersion) {
          const saved = storage.setStoredJSON(RESOURCE_DASHBOARD_CACHE_KEY, {
            appVersion: appVersion,
            version:
              typeof response.version === "string" ? response.version : "",
            tabs: normalizedTabs,
          });
          if (!saved) {
            (globalScope.DebugUtils || console).warn(
              "Resource Dashboard data could not be saved to browser storage.",
            );
          }
        }
        renderResourceDashboardTab();
        if (reviewerSessionId)
          void loadReviewerDashboard({
            refresh: true,
            showLoading: resourceDashboardActiveTab === "REVIEWERS",
          });
        return true;
      } catch (error) {
        if (
          !silent &&
          !keepReviewerStatus &&
          resourceDashboardActiveTab !== "REVIEWERS"
        ) {
          const errorMessage = `Unable to load dashboard: ${String(
            error?.message || error,
          )}`;
          status.classList?.remove("resource-dashboard-entry-count");
          status.textContent = errorMessage;
          if (resourceDashboardActiveTab === "SUBJECTS") {
            const subjectsStatus = document.getElementById(
              "resource-dashboard-subjects-status",
            );
            if (subjectsStatus) {
              subjectsStatus.classList?.remove(
                "resource-dashboard-entry-count",
              );
              subjectsStatus.textContent = errorMessage;
              subjectsStatus.setAttribute("aria-busy", "false");
            }
          }
        }
        (globalScope.DebugUtils || console).error(
          "Unable to load the Resource Dashboard.",
          error,
        );
        return false;
      } finally {
        if (
          !silent &&
          !keepReviewerStatus &&
          resourceDashboardActiveTab !== "REVIEWERS"
        )
          status.removeAttribute("aria-busy");
        resourceDashboardLoadingPromise = null;
      }
    })();
    return resourceDashboardLoadingPromise;
  }

  function removeCachedResourcePortalListings() {
    resourcePortalBrowser.removeCachedListings();
  }

  function isValidCachedResourcePortalListing(cache, folderId) {
    return resourcePortalBrowser.isValidCachedListing(cache, folderId);
  }

  function getCachedResourcePortalListing(folderId) {
    return resourcePortalBrowser.getCachedListing(folderId);
  }

  function cacheResourcePortalListing(folderId, listing) {
    return resourcePortalBrowser.cacheListing(folderId, listing);
  }

  function clearResourcePortalDocumentsListing() {
    resourcePortalBrowser.clearDocumentsListing();
  }

  function renderResourcePortalListing(response, options = {}) {
    const nextFolderId = String(response.folder?.id || "");
    const nextItems = Array.isArray(response.items) ? response.items : [];
    const openExternal = options.openExternal === true;
    const folderChanged =
      nextFolderId !== resourcePortalCurrentFolderId ||
      openExternal !== resourcePortalOpenExternal;
    const nextItemsSignature = getResourcePortalItemsSignature(nextItems);
    const itemsChanged =
      nextItemsSignature !== resourcePortalLastItemsSignature;
    const listingChanged = folderChanged || itemsChanged;
    const previousItemCount = resourcePortalItemCount;
    const previousStatusMessage = resourcePortalStatusMessage;
    renderResourcePortalBreadcrumbs(response.breadcrumbs);
    resourcePortalOpenExternal = openExternal;
    if (listingChanged) renderResourcePortalItems(nextItems, options);
    resourcePortalLastItems = nextItems;
    resourcePortalLastItemsSignature = nextItemsSignature;
    resourcePortalCurrentFolderId = nextFolderId;
    resourcePortalHasLoadedListing = true;
    if (openExternal) resourcePortalHasLoadedDocuments = true;
    resourcePortalItemCount = nextItems.length;
    resourcePortalStatusMessage = response.truncated
      ? `Showing the first ${nextItems.length} items. This folder has more items than can be displayed at once.`
      : nextItems.length === 0
        ? "This folder is empty."
        : `Showing ${nextItems.length} ${nextItems.length === 1 ? "item." : "items."}`;
    if (
      listingChanged ||
      previousItemCount !== resourcePortalItemCount ||
      previousStatusMessage !== resourcePortalStatusMessage
    ) {
      const search = document.getElementById("resource-portal-search");
      filterResourcePortalItems(search?.value || "");
    }
  }

  function getResourcePortalItemsSignature(items) {
    return JSON.stringify(
      [...items]
        .map((item, index) => ({ item, index }))
        .sort(
          (left, right) =>
            compareResourceOrder(left.item.name, right.item.name) ||
            left.index - right.index,
        )
        .map(({ item }) => [
          String(item.id || ""),
          String(item.name || ""),
          item.type,
          String(item.mimeType || ""),
          item.modifiedTime || "",
          getResourcePortalThumbnailUrl(item),
        ]),
    );
  }

  function filterResourcePortalItems(query) {
    const list = document.getElementById("resource-portal-items");
    const status = document.getElementById("resource-documents-status");
    if (!list || !status) return 0;

    const normalizedQuery = String(query || "")
      .trim()
      .toLocaleLowerCase();
    let visibleCount = 0;
    list.querySelectorAll(".resource-portal-row").forEach((row) => {
      const matches =
        !normalizedQuery || row.dataset.search.includes(normalizedQuery);
      if (row.hidden !== !matches) row.hidden = !matches;
      if (matches) visibleCount += 1;
    });

    const nextStatus = normalizedQuery
      ? visibleCount
        ? `Showing ${visibleCount} of ${resourcePortalItemCount} ${resourcePortalItemCount === 1 ? "item." : "items."}`
        : "No matching files or folders."
      : resourcePortalStatusMessage;
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
    return visibleCount;
  }

  function createResourcePortalElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function getResourcePortalThumbnailUrl(item) {
    try {
      const parsedUrl = new URL(String(item.thumbnailLink || ""));
      if (
        parsedUrl.protocol === "https:" &&
        (parsedUrl.hostname.endsWith(".googleusercontent.com") ||
          parsedUrl.hostname === "drive.google.com") &&
        !parsedUrl.username &&
        !parsedUrl.password
      )
        return parsedUrl.href;
    } catch (error) {
      return "";
    }
    return "";
  }

  function createResourcePortalThumbnailFallback(item) {
    const fallback = createResourcePortalElement(
      "span",
      "resource-portal-thumbnail-fallback",
    );
    const icon = createResourcePortalElement(
      "i",
      item.type === "folder" ? "fa-solid fa-folder" : "fa-solid fa-file-lines",
    );
    icon.setAttribute("aria-hidden", "true");
    fallback.appendChild(icon);
    return fallback;
  }

  function createResourcePortalThumbnailImage(
    item,
    thumbnailUrl,
    loadImmediately = false,
  ) {
    const image = createResourcePortalElement("img");
    image.src = thumbnailUrl;
    image.alt = "";
    image.loading = loadImmediately ? "eager" : "lazy";
    image.referrerPolicy = "no-referrer";
    image.dataset.thumbnailUrl = thumbnailUrl;
    image.addEventListener(
      "error",
      () => image.replaceWith(createResourcePortalThumbnailFallback(item)),
      { once: true },
    );
    return image;
  }

  function getResourcePortalItemDisplayName(item) {
    const name = String(item.name || "");
    if (item.type === "folder") return name;
    const lastDotIndex = name.lastIndexOf(".");
    if (lastDotIndex > 0) {
      return name.substring(0, lastDotIndex);
    }
    return name;
  }

  function getResourcePortalModifiedDate(item) {
    if (!item.modifiedTime) return { label: "—", dateTime: "" };
    const date = new Date(item.modifiedTime);
    if (Number.isNaN(date.getTime())) return { label: "—", dateTime: "" };
    return {
      label: new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Manila",
      }).format(date),
      dateTime: date.toISOString(),
    };
  }

  function updateResourcePortalRowThumbnail(
    row,
    item,
    thumbnailUrl = getResourcePortalThumbnailUrl(item),
    loadImmediately = false,
  ) {
    if (item.type !== "file") return;
    const thumbnail = row.querySelector(".resource-portal-thumbnail");
    if (!thumbnail) return;
    const image = thumbnail.querySelector("img");
    if (row.dataset.thumbnailUrl === thumbnailUrl) return;
    row.dataset.thumbnailUrl = thumbnailUrl;
    if (!thumbnailUrl) {
      if (image) image.replaceWith(createResourcePortalThumbnailFallback(item));
      return;
    }
    if (image?.dataset.thumbnailUrl === thumbnailUrl) return;
    if (image) {
      image.dataset.thumbnailUrl = thumbnailUrl;
      image.src = thumbnailUrl;
      return;
    }
    const nextImage = createResourcePortalThumbnailImage(
      item,
      thumbnailUrl,
      loadImmediately,
    );
    const fallback = thumbnail.querySelector(
      ".resource-portal-thumbnail-fallback",
    );
    if (fallback) fallback.replaceWith(nextImage);
    else thumbnail.appendChild(nextImage);
  }

  function updateResourcePortalItemRow(row, item, openExternal) {
    const originalName = String(item.name || "");
    if (row.dataset.originalName !== originalName) {
      const displayName = getResourcePortalItemDisplayName(item);
      const name = row.querySelector(".resource-portal-item-name");
      if (name && name.textContent !== displayName)
        name.textContent = displayName;
      const externalLink =
        row.querySelector(".resource-portal-card-link") ||
        row.querySelector("a.resource-portal-item-name");
      const ariaLabel = `${displayName}, opens in Google Drive`;
      if (
        openExternal &&
        externalLink &&
        externalLink.getAttribute("aria-label") !== ariaLabel
      )
        externalLink.setAttribute("aria-label", ariaLabel);
      row.dataset.search =
        `${originalName} ${displayName} ${cleanResourceDisplayName(
          originalName,
        )}`.toLocaleLowerCase();
      row.dataset.originalName = originalName;
    }

    const modifiedTime = item.modifiedTime || "";
    const modified = row.querySelector(".resource-portal-item-modified");
    if (modified && row.dataset.modifiedTime !== modifiedTime) {
      const modifiedDate = getResourcePortalModifiedDate(item);
      if (modified.textContent !== modifiedDate.label)
        modified.textContent = modifiedDate.label;
      if (modifiedDate.dateTime) {
        if (modified.dateTime !== modifiedDate.dateTime)
          modified.dateTime = modifiedDate.dateTime;
      } else if (modified.hasAttribute("datetime")) {
        modified.removeAttribute("datetime");
      }
      row.dataset.modifiedTime = modifiedTime;
    }
    const thumbnailUrl =
      item.type === "file" ? getResourcePortalThumbnailUrl(item) : "";
    if (row.dataset.thumbnailUrl !== thumbnailUrl)
      updateResourcePortalRowThumbnail(
        row,
        item,
        thumbnailUrl,
        openExternal,
      );
  }

  function createResourcePortalItemRow(item, openExternal) {
    const row = createResourcePortalElement("li", "resource-portal-row");
    const id = String(item.id || "");
    const originalName = String(item.name || "");
    const displayName = getResourcePortalItemDisplayName(item);
    const mimeType = String(item.mimeType || "");
    const cardLink = openExternal
      ? createResourcePortalElement("a", "resource-portal-card-link")
      : null;
    row.dataset.itemId = id;
    row.dataset.search =
      `${originalName} ${displayName} ${cleanResourceDisplayName(
        originalName,
      )}`.toLocaleLowerCase();
    row.dataset.originalName = originalName;
    row.dataset.thumbnailUrl =
      item.type === "file" ? getResourcePortalThumbnailUrl(item) : "";

    const nameCell = createResourcePortalElement(
      "div",
      "resource-portal-name-cell",
    );
    const thumbnail = createResourcePortalElement(
      "span",
      "resource-portal-thumbnail",
    );
    const thumbnailUrl =
      item.type === "file" ? getResourcePortalThumbnailUrl(item) : "";
    if (thumbnailUrl) {
      thumbnail.appendChild(
        createResourcePortalThumbnailImage(
          item,
          thumbnailUrl,
          openExternal,
        ),
      );
    } else {
      thumbnail.appendChild(createResourcePortalThumbnailFallback(item));
    }
    nameCell.appendChild(thumbnail);

    if (cardLink) {
      const title = createResourcePortalElement(
        "span",
        "resource-portal-item-name",
        displayName,
      );
      cardLink.href =
        item.type === "folder"
          ? `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`
          : `https://drive.google.com/open?id=${encodeURIComponent(id)}`;
      cardLink.target = "_blank";
      cardLink.rel = "noopener noreferrer";
      cardLink.setAttribute(
        "aria-label",
        `${displayName}, opens in Google Drive`,
      );
      nameCell.appendChild(title);
    } else if (item.type === "folder") {
      const button = createResourcePortalElement(
        "button",
        "resource-portal-item-name",
        displayName,
      );
      button.type = "button";
      button.addEventListener("click", () => {
        void loadResourcePortalFolder(id);
      });
      nameCell.appendChild(button);
    } else {
      const previewButton = createResourcePortalElement(
        "button",
        "resource-portal-item-name",
        displayName,
      );
      previewButton.type = "button";
      previewButton.addEventListener("click", () => {
        void previewResourceFile(id, originalName, { mimeType });
      });
      nameCell.appendChild(previewButton);
    }
    (cardLink || row).appendChild(nameCell);

    const fileType =
      item.type === "folder"
        ? "Folder"
        : mimeType === "application/pdf"
          ? "PDF"
          : mimeType === "application/vnd.google-apps.document"
            ? "Google Doc"
            : mimeType === "application/vnd.google-apps.spreadsheet"
              ? "Google Sheet"
              : mimeType === "application/vnd.google-apps.presentation"
                ? "Google Slides"
                : originalName.includes(".")
                  ? originalName.split(".").pop().slice(0, 8).toUpperCase()
                  : "File";
    (cardLink || row).appendChild(
      createResourcePortalElement(
        "span",
        "resource-portal-item-type",
        fileType,
      ),
    );

    const modifiedDate = getResourcePortalModifiedDate(item);
    const modified = createResourcePortalElement(
      "time",
      "resource-portal-item-modified",
      modifiedDate.label,
    );
    if (modifiedDate.dateTime) modified.dateTime = modifiedDate.dateTime;
    (cardLink || row).appendChild(modified);
    if (cardLink) row.appendChild(cardLink);
    row.dataset.renderSignature = JSON.stringify([
      id,
      item.type,
      mimeType,
      openExternal,
    ]);
    row.dataset.modifiedTime = item.modifiedTime || "";
    return row;
  }

  function renderResourcePortalBreadcrumbs(breadcrumbs) {
    const navigation = document.getElementById("resource-portal-breadcrumbs");
    if (!navigation) return;
    const signature = JSON.stringify(
      breadcrumbs.map((crumb) => [crumb.id, crumb.name]),
    );
    if (navigation.dataset.renderSignature === signature) return;

    navigation.replaceChildren();
    breadcrumbs.forEach((crumb, index) => {
      if (index > 0) {
        navigation.appendChild(
          createResourcePortalElement("span", "text-gray-400", "/"),
        );
      }

      const isCurrent = index === breadcrumbs.length - 1;
      if (isCurrent) {
        const current = createResourcePortalElement(
          "span",
          "truncate font-semibold text-gray-800 dark:text-gray-100",
        );
        current.appendChild(
          document.createTextNode(String(crumb.name || "")),
        );
        current.setAttribute("aria-current", "location");
        navigation.appendChild(current);
        return;
      }

      const button = createResourcePortalElement(
        "button",
        "truncate text-brand-700 hover:underline dark:text-brand-300",
      );
      button.append(document.createTextNode(String(crumb.name || "")));
      button.type = "button";
      button.addEventListener("click", () => {
        void loadResourcePortalFolder(crumb.id);
      });
      navigation.appendChild(button);
    });
    navigation.dataset.renderSignature = signature;
  }

  function renderResourcePortalItems(items, options = {}) {
    const list = document.getElementById("resource-portal-items");
    if (!list) return;
    const openExternal = options.openExternal === true;
    const existingRows = new Map(
      Array.from(list.children).map((row) => [row.dataset.itemId, row]),
    );
    const sortedItems = [...items]
      .map((item, index) => ({ item, index }))
      .sort(
        (left, right) =>
          compareResourceOrder(left.item.name, right.item.name) ||
          left.index - right.index,
      );
    const nextIds = new Set(
      sortedItems.map(({ item }) => String(item.id || "")),
    );
    existingRows.forEach((row, id) => {
      if (!nextIds.has(id)) {
        row.remove();
        existingRows.delete(id);
      }
    });
    sortedItems.forEach(({ item }, index) => {
      const id = String(item.id || "");
      const signature = JSON.stringify([
        id,
        item.type,
        String(item.mimeType || ""),
        String(item.name || ""),
        openExternal,
      ]);
      let row = existingRows.get(id);
      if (!row || row.dataset.renderSignature !== signature) {
        const updatedRow = createResourcePortalItemRow(item, openExternal);
        if (row) row.replaceWith(updatedRow);
        row = updatedRow;
      } else updateResourcePortalItemRow(row, item, openExternal);
      if (list.children[index] !== row) {
        list.insertBefore(row, list.children[index] || null);
      }
    });
  }

  function getReviewerPdfDisplayName(fileName) {
    return resourceCatalogCore.getReviewerPdfDisplayName(fileName);
  }

  const reviewerPdfViewerCore = globalScope.ReviewerPdfViewerCore.create({
    download: downloadReviewerPdf,
    getGeneration: () => resourcePreviewController.getGeneration(),
    getState: () => ({
      activePdf: resourcePortalReviewerPdf,
      isReviewer: resourcePortalPreviewIsReviewer,
      objectUrl: resourcePortalPreviewObjectUrl,
      pdfBytes: resourcePortalPreviewPdfBytes,
      ready: resourcePortalPreviewBlobViewerReady,
    }),
    getTimingNow: getReviewerPdfTimingNow,
    getWorker: getReviewerPdfWorker,
    setBlobViewerError: (message) => {
      resourcePortalPreviewBlobViewerError = message;
    },
    setBlobViewerStatus: (message) => {
      resourcePortalPreviewBlobViewerStatus = message;
    },
  });

  function releaseResourcePortalPreviewObjectUrl() {
    reviewerPdfViewerCore.releaseObjectUrls(
      () => ({
        objectUrl: resourcePortalPreviewObjectUrl,
        blobViewerUrl: resourcePortalPreviewBlobViewerUrl,
      }),
      () => {
        resourcePortalPreviewObjectUrl = "";
        resourcePortalPreviewBlobViewerUrl = "";
      },
      (opened) => {
        resourcePortalPreviewUrlOpened = opened;
      },
    );
  }

  const resourcePreviewController =
    rootScope.ResourcePreviewControllerCore.create({
      document,
      viewer: reviewerPdfViewerCore,
      getFolderPanel: (frame) => getResourceDashboardFolderPanel(frame),
      getReviewerContext: () => ({
        isReviewer: resourcePortalPreviewIsReviewer,
        accountStatus: reviewerAccountStatus,
        activeTab: resourceDashboardActiveTab,
      }),
      cancelPendingPreview: () => {
        cancelReviewerPdfPreviewGeneration();
        resourceDashboardFolderGeneration += 1;
        reviewerPdfPreviewInFlight = null;
      },
      resetPreviewState: () => {
        resourcePortalPreviewBlobViewerReady = false;
        resourcePortalPreviewBlobViewerError = "";
        resourcePortalPreviewBlobViewerStatus = "";
        resourceDashboardFolderListing = null;
        resourceDashboardFolderReturn = null;
        resourcePortalPreviewPdfBytes = null;
        resourcePortalPreviewIsReviewer = false;
        resourcePortalPreviewCourse = "";
        resourcePortalReviewerPdf = null;
      },
      releaseObjectUrls: releaseResourcePortalPreviewObjectUrl,
    });

  function clearReviewerPdfViewerWatchdog() {
    reviewerPdfViewerCore.clearWatchdog();
  }

  function failReviewerPdfCanvasViewer(message) {
    return reviewerPdfViewerCore.failCanvasViewer(message);
  }

  function isMobileReviewerPdfDevice() {
    return reviewerPdfViewerCore.isMobileDevice();
  }

  function prefetchReviewerPdfViewerAssets() {
    return reviewerPdfViewerCore.prefetchAssets();
  }

  function warmReviewerPdfViewer() {
    return reviewerPdfViewerCore.warmViewer();
  }

  function sendReviewerPdfBytesToBlobViewer() {
    return reviewerPdfViewerCore.sendBytesToBlobViewer();
  }

  function showReviewerPdfBlobViewerError(message, retryable = false) {
    return reviewerPdfViewerCore.showBlobViewerError(message, retryable);
  }

  function setReviewerPdfPreviewStatus(message) {
    return reviewerPdfViewerCore.setPreviewStatus(message);
  }

  function clearReviewerPdfPreviewStatus() {
    reviewerPdfViewerCore.clearPreviewStatus();
  }

  function setReviewerPdfChipDisabled(link, disabled) {
    if (!link) return;
    link.classList.toggle("is-rate-limited", disabled);
    if (disabled) {
      link.setAttribute("aria-disabled", "true");
      link.tabIndex = -1;
    } else {
      link.removeAttribute("aria-disabled");
      link.removeAttribute("tabindex");
    }
  }

  function setReviewerPdfChipsDisabled(disabled) {
    document
      .querySelectorAll(
        "#resource-dashboard-table-body [data-reviewer-pdf-chip]",
      )
      .forEach((link) => setReviewerPdfChipDisabled(link, disabled));
  }

  function startReviewerPdfCooldown(durationMs) {
    const cooldownMs = Math.min(
      5 * 60 * 1000,
      Math.max(0, Number(durationMs) || 0),
    );
    reviewerPdfCooldownUntil = Math.max(
      reviewerPdfCooldownUntil,
      Date.now() + cooldownMs,
    );
    setReviewerPdfChipsDisabled(true);
    if (reviewerPdfCooldownTimer)
      globalScope.clearTimeout(reviewerPdfCooldownTimer);
    const clearCooldown = () => {
      const remainingMs = reviewerPdfCooldownUntil - Date.now();
      if (remainingMs > 0) {
        reviewerPdfCooldownTimer = globalScope.setTimeout(
          clearCooldown,
          remainingMs,
        );
        return;
      }
      reviewerPdfCooldownTimer = 0;
      reviewerPdfCooldownUntil = 0;
      reviewerPdfRateLimitWarningShown = false;
      reviewerPdfRecentSelections = [];
      reviewerPdfLastSelectedFileId = "";
      setReviewerPdfChipsDisabled(false);
    };
    reviewerPdfCooldownTimer = globalScope.setTimeout(
      clearCooldown,
      Math.max(0, reviewerPdfCooldownUntil - Date.now()),
    );
  }

  function setReviewerPdfSelectionRateLimit(sessionId, fileId) {
    const session = String(sessionId || "");
    const selectedFileId = String(fileId || "");
    const now = Date.now();
    if (reviewerPdfRateLimitSessionId !== session) {
      reviewerPdfRateLimitSessionId = session;
      reviewerPdfRecentSelections = [];
      reviewerPdfLastSelectedFileId = "";
      reviewerPdfCooldownUntil = 0;
      reviewerPdfRateLimitWarningShown = false;
      if (reviewerPdfCooldownTimer) {
        globalScope.clearTimeout(reviewerPdfCooldownTimer);
        reviewerPdfCooldownTimer = 0;
      }
      setReviewerPdfChipsDisabled(false);
    }
    if (now < reviewerPdfCooldownUntil) {
      if (!reviewerPdfRateLimitWarningShown) {
        reviewerPdfRateLimitWarningShown = true;
        showToast(
          `You are being rate limited. Please wait ${Math.ceil(
            (reviewerPdfCooldownUntil - now) / 1000,
          )} seconds before opening another PDF.`,
          "warning",
          5000,
        );
      }
      return false;
    }
    if (reviewerPdfCooldownUntil) {
      reviewerPdfCooldownUntil = 0;
      reviewerPdfRateLimitWarningShown = false;
      reviewerPdfRecentSelections = [];
      reviewerPdfLastSelectedFileId = "";
    }
    reviewerPdfRecentSelections = reviewerPdfRecentSelections.filter(
      (selection) => now - selection.timestamp <= REVIEWER_PDF_CLICK_WINDOW_MS,
    );
    reviewerPdfRecentSelections.push({
      fileId: selectedFileId,
      timestamp: now,
    });
    reviewerPdfLastSelectedFileId = selectedFileId;
    if (reviewerPdfRecentSelections.length < REVIEWER_PDF_CLICK_LIMIT)
      return true;
    reviewerPdfCooldownUntil = now + REVIEWER_PDF_CLICK_COOLDOWN_MS;
    reviewerPdfRecentSelections = [];
    reviewerPdfRateLimitWarningShown = true;
    showToast(
      "You are being rate limited. Please wait 6 seconds before opening another PDF.",
      "warning",
      5000,
    );
    startReviewerPdfCooldown(REVIEWER_PDF_CLICK_COOLDOWN_MS);
    return false;
  }

  function openBlobResourceViewer(
    title,
    {
      downloadFileName,
      titleLines = null,
      viewerWatermark = null,
      preview,
      frame,
      status,
      returnLabel = "Return to Website",
      mobileOnly = false,
      pdfBytes = null,
      forcePdfJs = false,
      initialStatus = "Loading preview",
    } = {},
  ) {
    if (mobileOnly && !isMobileReviewerPdfDevice()) return false;
    if ((!resourcePortalPreviewObjectUrl && !forcePdfJs) || !preview || !frame)
      return false;

    const blobUrl = escapeHTML(resourcePortalPreviewObjectUrl || "");
    const baseUrl = new URL(
      globalScope.__MRH_APP_BASE_PATH || "./",
      globalScope.location.origin,
    );
    const returnUrl = escapeHTML(globalScope.location.href);
    const pdfModuleUrl = new URL("vendor/pdfjs/pdfjs-5.4.394.min.mjs", baseUrl)
      .href;
    const pdfWorkerUrl = new URL(
      "vendor/pdfjs/pdfjs-5.4.394.worker.min.mjs",
      baseUrl,
    ).href;
    const safeTitle = escapeHTML(title || "PDF Preview");
    const safeViewerWatermark = viewerWatermark
      ? {
          brand: escapeHTML(viewerWatermark.brand || "MRH"),
          fullName: escapeHTML(viewerWatermark.fullName || ""),
          email: escapeHTML(viewerWatermark.email || ""),
        }
      : null;
    const viewerWatermarkMarkup =
      forcePdfJs ||
      (safeViewerWatermark?.fullName && safeViewerWatermark?.email)
        ? `<aside id="viewer-watermark" role="note" aria-label="Maritime Review Hub viewing watermark">
            <span class="viewer-watermark-brand">${safeViewerWatermark?.brand || "MRH"}</span>
            <span>${safeViewerWatermark?.fullName || ""}</span>
            <span>${safeViewerWatermark?.email || ""}</span>
          </aside>`
        : "";
    const initialTheme =
      globalScope.document?.documentElement?.classList.contains("dark")
        ? "dark"
        : "light";
    const safeTitleBlock = titleLines
      ? `<div class="viewer-heading">
        <svg class="viewer-title-icon" aria-hidden="true" viewBox="0 0 24 28">
          <path fill="currentColor" d="M4 1h10l6 6v19H4z"></path>
          <path fill="#fecaca" d="M14 1v6h6z"></path>
          <text x="5.5" y="19" fill="#fff" font-size="6" font-weight="700">PDF</text>
        </svg>
        <div class="viewer-title">
          <div class="viewer-title-term">${escapeHTML(titleLines.term)}</div>
          <div class="viewer-title-course">${escapeHTML(titleLines.course)}</div>
          <div class="viewer-title-file">${escapeHTML(titleLines.file)}</div>
        </div>
      </div>`
      : `<h1>${safeTitle}</h1>`;
    const safeInitialStatus = escapeHTML(
      forcePdfJs ? "Verifying" : initialStatus,
    );
    const downloadName = escapeHTML(downloadFileName || "download");
    const safeReturnLabel = escapeHTML(returnLabel);
    const returnMessageType =
      returnLabel === "Return to Website"
        ? "MRH_RESOURCE_PREVIEW_RETURN_REQUEST"
        : "MRH_RESOURCE_PREVIEW_RETURN";
    const usePdfJs =
      forcePdfJs ||
      (pdfBytes instanceof Uint8Array && isMobileReviewerPdfDevice());
    const preparedPdfDownloadAvailable =
      forcePdfJs && pdfBytes instanceof Uint8Array;
    const fileContent = usePdfJs
      ? `<main id="pdf-pages" aria-label="PDF pages"></main>
    <p id="pdf-status" role="status" aria-live="polite"${preparedPdfDownloadAvailable ? " hidden" : ""}>${preparedPdfDownloadAvailable ? "" : `<span class="pdf-loading-spinner" aria-hidden="true"></span><span>${safeInitialStatus}</span>`}</p>
    ${forcePdfJs ? `<div id="pdf-loading-help" role="status"${preparedPdfDownloadAvailable ? ' style="visibility: visible; animation: none;"' : ""}><strong>PDF preview did not initialize.</strong><button id="pdf-download-help" type="button">Download PDF</button></div>` : ""}`
      : `<iframe title="${safeTitle}" src="${blobUrl}"></iframe>`;
    const downloadControl = forcePdfJs
      ? `<button id="pdf-download" type="button" hidden>Download</button>`
      : `<a id="pdf-download" href="${blobUrl}" download="${downloadName}" hidden>Download</a>`;
    const pdfRendererScript = usePdfJs
      ? `<script type="module">
      const pdfRenderer = import(${JSON.stringify(pdfModuleUrl)}).then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = ${JSON.stringify(pdfWorkerUrl)};
        window.parent.postMessage(
          { type: "MRH_PDF_VIEWER_READY" },
          location.origin,
        );
        return pdfjs;
      });
      const pages = document.getElementById("pdf-pages");
      const status = document.getElementById("pdf-status");
      const headerContent = document.querySelector(".viewer-header-content");
      let viewerWatermarkInterval = 0;
      let viewerStatusTimer = 0;
      let viewerStatusToken = 0;
      let viewerRenderFailureReported = false;
      const loadingHelp = document.getElementById("pdf-loading-help");
      const clearPreviewLoadingHint = () => {
        if (loadingHelp) loadingHelp.hidden = true;
      };
      const renderError = (error) => {
        clearPreviewLoadingHint();
        if (loadingHelp) {
          loadingHelp.hidden = false;
          loadingHelp.style.visibility = "visible";
          loadingHelp.style.animation = "none";
        }
        status.hidden = true;
        console.error("Unable to render PDF preview.", error);
        if (viewerRenderFailureReported) return;
        viewerRenderFailureReported = true;
        window.parent.postMessage(
          {
            type: "MRH_PDF_RENDER_FAILURE",
            message:
              "The PDF preview could not be displayed. Use Download to open the PDF.",
          },
          location.origin,
        );
      };
      window.addEventListener("message", (event) => {
        if (
          event.source !== window.parent ||
          event.origin !== location.origin ||
          event.data?.type !== "MRH_PDF_VIEWER_ERROR"
        )
          return;
        status.textContent =
          String(event.data.message || "").trim() ||
          "Unable to prepare this PDF. Return to the website and try again.";
        status.hidden = false;
        if (event.data.retryable === true) {
          const retryButton = document.createElement("button");
          retryButton.type = "button";
          retryButton.textContent = "Retry PDF preview";
          retryButton.addEventListener("click", () => {
            window.parent.postMessage(
              { type: "MRH_PDF_PREVIEW_RETRY" },
              location.origin,
            );
          });
          status.appendChild(retryButton);
        }
      });
      const updateHeaderPageAlignment = () => {
        if (!headerContent) return;
        const firstPage = pages.querySelector(".pdf-page");
        if (!firstPage) {
          headerContent.style.removeProperty("--pdf-page-left");
          headerContent.style.removeProperty("--pdf-page-width");
          return;
        }
        const pageRect = firstPage.getBoundingClientRect();
        const headerRect = headerContent.parentElement.getBoundingClientRect();
        headerContent.style.setProperty(
          "--pdf-page-left",
          pageRect.left - headerRect.left + "px",
        );
        headerContent.style.setProperty(
          "--pdf-page-width",
          pageRect.width + "px",
        );
      };
      ["selectstart", "copy", "cut", "contextmenu"].forEach((eventName) => {
        document.addEventListener(eventName, (event) => event.preventDefault());
      });
      document.addEventListener("keydown", (event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          ["a", "c", "x"].includes(event.key.toLowerCase())
        )
          event.preventDefault();
      });
      window.addEventListener("message", async (event) => {
        if (
          event.source === window.parent &&
          event.origin === location.origin &&
          event.data?.type === "MRH_PDF_VIEWER_STATUS"
        ) {
          const label = String(event.data.message || "").trim();
          if (label) {
            if (viewerStatusTimer) {
              window.clearTimeout(viewerStatusTimer);
              viewerStatusTimer = 0;
            }
            const statusToken = ++viewerStatusToken;
            const spinner = document.createElement("span");
            spinner.className = "pdf-loading-spinner";
            spinner.setAttribute("aria-hidden", "true");
            const text = document.createElement("span");
            text.textContent = label;
            status.replaceChildren(spinner, text);
            status.hidden = false;
            if (event.data.transient === true) {
              viewerStatusTimer = window.setTimeout(() => {
                if (statusToken !== viewerStatusToken) return;
                status.replaceChildren();
                status.hidden = true;
                viewerStatusTimer = 0;
              }, Math.min(
                2000,
                Math.max(100, Number(event.data.durationMs) || 650),
              ));
            }
          }
          return;
        }
        if (
          event.source !== window.parent ||
          event.origin !== location.origin ||
          event.data?.type !== "MRH_PDF_VIEWER_DATA" ||
          !(event.data.bytes instanceof ArrayBuffer)
        )
          return;
        try {
          status.replaceChildren();
          status.hidden = true;
          if (loadingHelp) {
            loadingHelp.hidden = false;
            loadingHelp.style.visibility = "visible";
            loadingHelp.style.animation = "none";
            window.requestAnimationFrame(() => {
              window.parent.postMessage(
                { type: "MRH_PDF_VIEWER_FALLBACK_READY" },
                location.origin,
              );
            });
          }
          const viewerWatermark = document.getElementById("viewer-watermark");
          if (
            viewerWatermark &&
            event.data.viewerWatermark?.brand === "MRH"
          ) {
            const [brand, fullName, email] = viewerWatermark.children;
            brand.textContent = "MRH";
            fullName.textContent = String(event.data.viewerWatermark.fullName || "");
            email.textContent = String(event.data.viewerWatermark.email || "");
            viewerWatermark.setAttribute(
              "aria-label",
              "Maritime Review Hub viewing watermark for " +
                fullName.textContent +
                ", " +
                email.textContent,
            );
            const positions = [
              [0.12, 0.14],
              [0.88, 0.14],
              [0.12, 0.86],
              [0.88, 0.86],
              [0.5, 0.5],
              [0.5, 0.24],
            ];
            let positionIndex = 0;
            const moveViewerWatermark = () => {
              if (!viewerWatermark.isConnected) return;
              const viewportRect = pages.getBoundingClientRect();
              const visiblePages = Array.from(
                pages.querySelectorAll(".pdf-page"),
              )
                .map((page) => {
                  const rect = page.getBoundingClientRect();
                  const left = Math.max(0, viewportRect.left, rect.left);
                  const right = Math.min(
                    window.innerWidth,
                    viewportRect.right,
                    rect.right,
                  );
                  const top = Math.max(0, viewportRect.top, rect.top);
                  const bottom = Math.min(
                    window.innerHeight,
                    viewportRect.bottom,
                    rect.bottom,
                  );
                  return {
                    left,
                    right,
                    top,
                    bottom,
                    area: Math.max(0, right - left) * Math.max(0, bottom - top),
                  };
                })
                .filter((page) => page.area > 0)
                .sort((left, right) => right.area - left.area);
              const page = visiblePages[0];
              if (!page || page.right - page.left < 40 || page.bottom - page.top < 32) {
                viewerWatermark.hidden = true;
                return;
              }
              viewerWatermark.hidden = false;
              viewerWatermark.style.maxWidth =
                Math.max(24, Math.min(240, page.right - page.left - 16)) + "px";
              const watermarkWidth = viewerWatermark.offsetWidth;
              const watermarkHeight = viewerWatermark.offsetHeight;
              if (
                watermarkWidth > page.right - page.left - 16 ||
                watermarkHeight > page.bottom - page.top - 16
              ) {
                viewerWatermark.hidden = true;
                return;
              }
              const [horizontal, vertical] = positions[positionIndex];
              const minLeft = page.left + 8;
              const minTop = page.top + 8;
              const maxLeft = page.right - watermarkWidth - 8;
              const maxTop = page.bottom - watermarkHeight - 8;
              const targetLeft = page.left + (page.right - page.left) * horizontal;
              const targetTop = page.top + (page.bottom - page.top) * vertical;
              viewerWatermark.style.left =
                Math.min(maxLeft, Math.max(minLeft, targetLeft)) + "px";
              viewerWatermark.style.top =
                Math.min(maxTop, Math.max(minTop, targetTop)) + "px";
              positionIndex = (positionIndex + 1) % positions.length;
            };
            if (!viewerWatermarkInterval) {
              moveViewerWatermark();
              window.addEventListener("resize", moveViewerWatermark, {
                passive: true,
              });
              pages.addEventListener("scroll", moveViewerWatermark, {
                passive: true,
              });
              viewerWatermarkInterval = window.setInterval(
                moveViewerWatermark,
                5000,
              );
            }
          }
          const downloadLink = document.getElementById("pdf-download");
          document.documentElement.dataset.theme =
            event.data.darkMode === true ? "dark" : "light";
          const pdfjs = await pdfRenderer;
          const pdf = await pdfjs.getDocument({
            data: new Uint8Array(event.data.bytes),
          }).promise;
          const maxOutputScale = 2.5;
          const maxCanvasPixels = 8 * 1024 * 1024;
          const maxCanvasDimension = 8192;
          const getRequestedOutputScale = () =>
            Math.min(
              Math.max(window.devicePixelRatio || 1, 1) *
                (window.visualViewport?.scale || 1),
              maxOutputScale,
            );
          const getOutputScale = (viewport) =>
            Math.min(
              getRequestedOutputScale(),
              Math.sqrt(
                maxCanvasPixels / (viewport.width * viewport.height),
              ),
              maxCanvasDimension /
                Math.max(viewport.width, viewport.height),
            );
          const visiblePages = new WeakMap();
          const pendingPageProxies = new WeakMap();
          let firstPageRendered = false;
          let firstPageUpgradeScheduled = false;
          const renderPage = async (section) => {
            if (!section.isConnected) return;
            if (section.dataset.rendering === "true") return;
            const existingCanvas = section.querySelector("canvas");
            if (
              existingCanvas &&
              section.dataset.renderContainerWidth ===
                String(pages.clientWidth) &&
              Number(section.dataset.renderDeviceScale || 0) >=
                getRequestedOutputScale()
            )
              return;
            section.dataset.rendering = "true";
            let rendered = false;
            let page = null;
            let deferFirstPageUpgrade = false;
            try {
              const pageNumber = Number(section.dataset.pageNumber);
              page =
                pendingPageProxies.get(section) ||
                (await pdf.getPage(pageNumber));
              pendingPageProxies.delete(section);
              const renderContainerWidth = pages.clientWidth;
              const unitViewport = page.getViewport({ scale: 1 });
              const scale = Math.min(
                1.5,
                Math.max(0.1, (renderContainerWidth - 24) / unitViewport.width),
              );
              const viewport = page.getViewport({ scale });
              const requestedOutputScale = getRequestedOutputScale();
              deferFirstPageUpgrade =
                pageNumber === 1 &&
                !firstPageRendered &&
                requestedOutputScale > 1;
              const outputScale = deferFirstPageUpgrade
                ? Math.min(1, getOutputScale(viewport))
                : getOutputScale(viewport);
              section.style.width = Math.ceil(viewport.width) + "px";
              updateHeaderPageAlignment();
              const canvas = document.createElement("canvas");
              canvas.width = Math.ceil(viewport.width * outputScale);
              canvas.height = Math.ceil(viewport.height * outputScale);
              canvas.style.width = viewport.width + "px";
              canvas.style.height = viewport.height + "px";
              await page.render({
                canvasContext: canvas.getContext("2d"),
                viewport,
                transform: outputScale === 1
                  ? null
                  : [outputScale, 0, 0, outputScale, 0, 0],
              }).promise;
              status.hidden = true;
              if (!visiblePages.get(section) && pageNumber !== 1) {
                canvas.width = 0;
                canvas.height = 0;
                existingCanvas?.remove();
                if (existingCanvas) {
                  existingCanvas.width = 0;
                  existingCanvas.height = 0;
                }
                return;
              }
              if (existingCanvas) {
                existingCanvas.replaceWith(canvas);
                existingCanvas.width = 0;
                existingCanvas.height = 0;
              } else {
                section.appendChild(canvas);
              }
              section.dataset.renderScale = String(outputScale);
              section.dataset.renderDeviceScale = String(
                deferFirstPageUpgrade
                  ? outputScale
                  : requestedOutputScale,
              );
              section.dataset.renderContainerWidth = String(
                renderContainerWidth,
              );
              rendered = true;
              if (viewerWatermark) moveViewerWatermark();
              if (pageNumber === 1 && !firstPageRendered) {
                firstPageRendered = true;
                document.documentElement.dataset.pdfPreviewRendered = "true";
                clearPreviewLoadingHint();
                window.parent.postMessage(
                  { type: "MRH_PDF_VIEWER_FIRST_PAGE_RENDERED" },
                  location.origin,
                );
              }
            } finally {
              if (deferFirstPageUpgrade && rendered && page)
                pendingPageProxies.set(section, page);
              else page?.cleanup();
              section.dataset.rendering = "false";
              const needsHigherResolution =
                rendered &&
                visiblePages.get(section) &&
                (section.dataset.renderContainerWidth !==
                  String(pages.clientWidth) ||
                  Number(section.dataset.renderDeviceScale || 0) <
                    getRequestedOutputScale());
              if (needsHigherResolution && deferFirstPageUpgrade) {
                if (!firstPageUpgradeScheduled) {
                  firstPageUpgradeScheduled = true;
                  const upgradeFirstPage = () => {
                    firstPageUpgradeScheduled = false;
                    if (visiblePages.get(section))
                      void renderPage(section).catch(renderError);
                  };
                  if (typeof window.requestIdleCallback === "function")
                    window.requestIdleCallback(upgradeFirstPage, {
                      timeout: 1500,
                    });
                  else window.setTimeout(upgradeFirstPage, 250);
                }
              } else if (needsHigherResolution) {
                void renderPage(section).catch(renderError);
              }
            }
          };
          const observer =
            typeof IntersectionObserver === "function"
              ? new IntersectionObserver(
                  (entries) => {
                    entries.forEach((entry) => {
                      visiblePages.set(entry.target, entry.isIntersecting);
                      const canvas = entry.target.querySelector("canvas");
                      if (entry.isIntersecting) {
                        void renderPage(entry.target).catch(renderError);
                      } else if (entry.target.dataset.rendering !== "true") {
                        const pendingPage =
                          pendingPageProxies.get(entry.target);
                        if (pendingPage) {
                          pendingPage.cleanup();
                          pendingPageProxies.delete(entry.target);
                        }
                        if (canvas) {
                          canvas.width = 0;
                          canvas.height = 0;
                          canvas.remove();
                        }
                      }
                    });
                  },
                  { root: pages, rootMargin: "100% 0px" },
                )
              : null;
          const rerenderVisiblePages = () => {
            pages.querySelectorAll(".pdf-page").forEach((section) => {
              if (visiblePages.get(section))
                void renderPage(section).catch(renderError);
            });
          };
          const updateViewerLayout = () => {
            rerenderVisiblePages();
            updateHeaderPageAlignment();
          };
          const pageLayoutObserver =
            typeof ResizeObserver === "function"
              ? new ResizeObserver(updateViewerLayout)
              : null;
          if (pageLayoutObserver) pageLayoutObserver.observe(pages);
          window.visualViewport?.addEventListener(
            "resize",
            updateViewerLayout,
            { passive: true },
          );
          window.addEventListener("resize", updateViewerLayout, {
            passive: true,
          );
          pages.addEventListener("scroll", updateHeaderPageAlignment, {
            passive: true,
          });
          const fallbackPages = [];
          const appendPage = async (pageNumber) => {
            const page = await pdf.getPage(pageNumber);
            const unitViewport = page.getViewport({ scale: 1 });
            const section = document.createElement("section");
            pendingPageProxies.set(section, page);
            section.className = "pdf-page";
            section.setAttribute("aria-label", "Page " + pageNumber);
            section.dataset.pageNumber = String(pageNumber);
            section.style.aspectRatio =
              unitViewport.width + " / " + unitViewport.height;
            section.style.width =
              "min(100%, " + Math.max(1, pages.clientWidth - 24) + "px)";
            pages.appendChild(section);
            if (pageNumber === 1) {
              visiblePages.set(section, true);
            }
            if (pageNumber === 1) pageLayoutObserver?.observe(section);
            updateHeaderPageAlignment();
            if (observer) observer.observe(section);
            else {
              visiblePages.set(section, true);
              fallbackPages.push(section);
            }
            return section;
          };
          const firstPageSection = await appendPage(1);
          await renderPage(firstPageSection);
          await new Promise((resolve) => window.setTimeout(resolve, 0));
          for (let pageNumber = 2; pageNumber <= pdf.numPages; pageNumber += 1) {
            await appendPage(pageNumber);
          }
          if (!observer)
            for (const section of fallbackPages) {
              if (section !== firstPageSection) await renderPage(section);
            }
        } catch (error) {
          renderError(error);
        }
      });
      pdfRenderer.catch((error) => {
        renderError(error);
      });
    </script>`
      : "";
    const viewerHtml = `<!doctype html>
<html lang="en" data-theme="${initialTheme}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="referrer" content="no-referrer">
    <title>${safeTitle} - Maritime Review Hub</title>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body {
        display: grid;
        grid-template-rows: ${forcePdfJs ? "minmax(0, 1fr)" : "auto minmax(0, 1fr)"};
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: #f1f5f9;
        color: #0f172a;
        font: 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      body * { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
      header {
        position: relative;
        z-index: 1;
        display: block;
        min-height: 56px;
        padding: 0;
        border-bottom: 1px solid #cbd5e1;
        background: #fff;
      }
      ${forcePdfJs ? "header { display: none; }" : ""}
      h1 { flex: 1 1 auto; min-width: 0; margin: 0; overflow-wrap: anywhere; font-size: 14px; font-weight: 600; }
      .viewer-header-content { display: flex; flex: none; flex-wrap: wrap; width: var(--pdf-page-width, calc(100% - 24px)); min-width: 0; max-width: var(--pdf-page-width, calc(100% - 24px)); align-items: center; justify-content: space-between; gap: 8px; margin-left: var(--pdf-page-left, 12px); padding-block: 4px; overflow: hidden; }
      .viewer-heading { display: flex; flex: 1 1 240px; width: auto; max-width: 100%; min-width: 0; align-items: stretch; gap: 2px; }
      .viewer-title-icon { flex: 0 0 auto; width: 48px; height: 100%; min-height: 100%; align-self: stretch; color: #991b1b; }
      html[data-theme="dark"] .viewer-title-icon { color: #ef4444; }
      .viewer-title { flex: 1 1 auto; width: auto; max-width: 100%; min-width: 0; overflow: hidden; overflow-wrap: anywhere; }
      .viewer-title-term { font-size: 12px; font-style: italic; line-height: 1.2; }
      .viewer-title-course { font-size: 16px; font-weight: 700; line-height: 1.25; }
      .viewer-title-file { font-size: 12px; font-weight: 400; line-height: 1.2; }
      nav { display: flex; flex: 0 1 auto; min-width: 0; max-width: 100%; gap: 8px; margin-left: auto; }
      a, button {
        display: inline-flex;
        min-height: 40px;
        align-items: center;
        justify-content: center;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        padding: 0 12px;
        background: #fff;
        color: #1d4ed8;
        font: inherit;
        font-weight: 600;
        text-decoration: none;
        white-space: nowrap;
        cursor: pointer;
      }
      a:focus-visible, button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
      a[aria-disabled="true"], button[aria-disabled="true"] { opacity: 0.55; pointer-events: none; }
      iframe, #pdf-pages { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; border: 0; background: #64748b; }
      #pdf-pages {
        overflow: auto;
        padding: 12px;
        background: #475569;
        scrollbar-width: none;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      #pdf-pages::-webkit-scrollbar { display: none; }
      .pdf-page { width: min(100%, 100%); max-width: 100%; margin: 0 auto 12px; background: #fff; box-shadow: 0 2px 12px #0f172a66; }
      #viewer-watermark {
        position: fixed;
        z-index: 4;
        display: grid;
        justify-items: center;
        gap: 1px;
        max-width: 240px;
        color: #6b7280;
        font-size: 10px;
        line-height: 1.2;
        overflow-wrap: anywhere;
        opacity: 0.34;
        pointer-events: none;
        transition: left 1s ease, top 1s ease;
        text-align: center;
      }
      .viewer-watermark-brand { font-size: 11px; font-weight: 800; letter-spacing: .08em; }
      .pdf-page canvas {
        display: block;
        width: 100%;
        max-width: 100%;
        height: auto;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      #pdf-status { position: fixed; z-index: 2; top: 50%; left: 50%; width: max-content; max-width: calc(100vw - 32px); margin: 0; padding: 12px 16px; border-radius: 8px; background: #fff; color: #0f172a; text-align: center; transform: translate(-50%, -50%); }
      #pdf-status { display: grid; justify-items: center; gap: 12px; animation: pdf-loading-status-timeout 0s 8s forwards; }
      #pdf-download[hidden] { display: none !important; }
      #pdf-loading-help {
        position: fixed;
        z-index: 2;
        top: 50%;
        left: 50%;
        display: grid;
        width: min(28rem, calc(100vw - 32px));
        justify-items: center;
        gap: 2px;
        margin: 0;
        padding: 12px 16px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #fff;
        color: #0f172a;
        text-align: center;
        transform: translate(-50%, -50%);
        visibility: hidden;
      }
      #pdf-loading-help[hidden] { display: none; animation: none; }
      #pdf-loading-help button { min-height: 40px; margin-top: 8px; }
      .pdf-loading-spinner { width: 40px; height: 40px; border: 4px solid #cbd5e1; border-top-color: #2563eb; border-radius: 50%; animation: pdf-loading-spin 0.8s linear infinite; }
      @keyframes pdf-loading-spin { to { transform: rotate(360deg); } }
      @keyframes pdf-loading-status-timeout { to { visibility: hidden; } }
      #pdf-status[hidden] { display: none; }
      html[data-theme="dark"] body { background: #111827; color: #f3f4f6; }
      html[data-theme="dark"] header { border-bottom-color: #374151; background: #111827; }
      html[data-theme="dark"] #pdf-pages { background: #1f2937; }
      html[data-theme="dark"] nav a { border-color: #4b5563; background: #1f2937; color: #bfdbfe; }
      html[data-theme="dark"] #pdf-status { background: #1f2937; color: #f3f4f6; }
      html[data-theme="dark"] #pdf-loading-help { border-color: #475569; background: #1f2937; color: #f3f4f6; }
      @media (max-width: 640px) {
        .viewer-header-content { width: var(--pdf-page-width, calc(100% - 24px)); min-width: 0; max-width: var(--pdf-page-width, calc(100% - 24px)); gap: 6px; }
        h1, .viewer-heading { max-width: 100%; }
        .viewer-title { width: auto; flex: 1 1 auto; }
        h1 { white-space: normal; }
        .viewer-title-course { font-size: 15px; }
        nav { display: grid; flex: 1 1 100%; width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-left: 0; }
        nav a { min-width: 0; padding-inline: 6px; font-size: 12px; text-align: center; white-space: normal; overflow-wrap: anywhere; }
        #pdf-pages { padding: 8px; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="viewer-header-content">
        ${safeTitleBlock}
        <nav aria-label="File actions">
          <a id="return-to-site" href="${returnUrl}" target="_top">${safeReturnLabel}</a>
          ${downloadControl}
        </nav>
      </div>
    </header>
    ${viewerWatermarkMarkup}
    ${fileContent}
    ${pdfRendererScript}
    <script>
      window.addEventListener("message", (event) => {
        if (
          event.source === window.parent &&
          event.origin === location.origin &&
          event.data?.type === "MRH_PDF_VIEWER_THEME"
        )
          document.documentElement.dataset.theme =
            event.data.darkMode === true ? "dark" : "light";
      });
      document.getElementById("return-to-site").addEventListener("click", (event) => {
        if (window.parent === window) return;
        event.preventDefault();
        window.parent.postMessage(
          {
            type: ${JSON.stringify(returnMessageType)},
          },
          location.origin,
        );
      });
      if (${forcePdfJs}) {
        const requestParentDownload = (event) => {
          event.preventDefault();
          window.parent.postMessage(
            { type: "MRH_PDF_VIEWER_DOWNLOAD_REQUEST" },
            location.origin,
          );
        };
        document.getElementById("pdf-download")?.addEventListener("click", requestParentDownload);
        document.getElementById("pdf-download-help")?.addEventListener("click", requestParentDownload);
      }
    </script>
  </body>
  </html>`;
    const viewerUrl = URL.createObjectURL(
      new Blob([viewerHtml], { type: "text/html;charset=utf-8" }),
    );
    resourcePortalPreviewBlobViewerUrl = viewerUrl;
    try {
      resourcePortalPreviewUrlOpened = true;
      resourcePortalPreviewPdfBytes = usePdfJs ? pdfBytes : null;
      resourcePortalPreviewBlobViewerReady = false;
      resourcePortalPreviewBlobViewerError = "";
      clearReviewerPdfViewerWatchdog();
      preview.classList.add("is-blob-viewer");
      frame.title = title || "PDF Preview";
      frame.hidden = false;
      frame.src = viewerUrl;
      if (status && !forcePdfJs) {
        status.classList.remove("is-loading");
        status.hidden = true;
      }
      if (forcePdfJs) {
        const viewerGeneration = resourcePreviewController.getGeneration();
        clearReviewerPdfViewerWatchdog();
        reviewerPdfViewerCore.startWatchdog(() => {
          if (viewerGeneration !== resourcePreviewController.getGeneration())
            return;
          failReviewerPdfCanvasViewer(
            "The PDF preview viewer did not initialize. Use Download to open the protected PDF.",
          );
        }, 15000);
      }
    } catch (error) {
      preview.classList.remove("is-blob-viewer", "is-pdf-fallback");
      resourcePortalPreviewBlobViewerReady = false;
      resourcePortalPreviewBlobViewerError = "";
      resourcePortalPreviewBlobViewerUrl = "";
      resourcePortalPreviewPdfBytes = null;
      resourcePortalPreviewUrlOpened = false;
      URL.revokeObjectURL(viewerUrl);
      throw error;
    }
    return true;
  }

  function getDrivePreviewUrl(fileId, mimeType) {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(String(fileId || ""))) return "";
    const routes = {
      "application/vnd.google-apps.document":
        "https://docs.google.com/document/d/",
      "application/vnd.google-apps.spreadsheet":
        "https://docs.google.com/spreadsheets/d/",
      "application/vnd.google-apps.presentation":
        "https://docs.google.com/presentation/d/",
    };
    const baseUrl =
      routes[String(mimeType || "").toLowerCase()] ||
      "https://drive.google.com/file/d/";
    return `${baseUrl}${encodeURIComponent(fileId)}/preview`;
  }

  function openDriveResourceViewer(
    title,
    fileId,
    mimeType,
    {
      preview,
      frame,
      status,
      returnLabel = "Return to Website",
      allowWebsiteFallback = true,
    } = {},
  ) {
    const driveUrl = getDrivePreviewUrl(fileId, mimeType);
    if (!driveUrl || !preview || !frame) return false;

    const safeTitle = escapeHTML(title || "File Preview");
    const returnUrl = escapeHTML(globalScope.location.href);
    const safeReturnLabel = escapeHTML(returnLabel);
    const returnMessageType =
      returnLabel === "Return to Website"
        ? "MRH_RESOURCE_PREVIEW_RETURN_REQUEST"
        : "MRH_RESOURCE_PREVIEW_RETURN";
    const websitePreviewAction = allowWebsiteFallback
      ? `<a id="website-preview" href="${returnUrl}" target="_top">Use website preview</a>`
      : "";
    const viewerHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="referrer" content="no-referrer">
    <title>${safeTitle} - Maritime Review Hub</title>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; }
      body { display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; background: #f1f5f9; color: #0f172a; font: 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      header { position: relative; z-index: 1; display: flex; min-height: 56px; align-items: center; justify-content: space-between; gap: 12px; padding: 8px max(12px, env(safe-area-inset-right)) 8px max(12px, env(safe-area-inset-left)); border-bottom: 1px solid #cbd5e1; background: #fff; }
      h1 { min-width: 0; margin: 0; overflow: hidden; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
      nav { display: flex; flex: 0 0 auto; gap: 8px; }
      a { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; border: 1px solid #cbd5e1; border-radius: 7px; padding: 0 12px; background: #fff; color: #1d4ed8; font-weight: 600; text-decoration: none; white-space: nowrap; }
      a:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
      iframe { display: block; width: 100%; height: 100%; border: 0; background: #64748b; }
      @media (max-width: 520px) { header { align-items: flex-start; flex-direction: column; gap: 6px; } nav { width: 100%; } nav a { flex: 1 1 0; padding-inline: 8px; font-size: 12px; } }
    </style>
  </head>
  <body>
    <header>
      <h1>${safeTitle}</h1>
      <nav aria-label="File actions">
        <a id="return-to-site" href="${returnUrl}" target="_top">${safeReturnLabel}</a>
        ${websitePreviewAction}
      </nav>
    </header>
    <iframe title="${safeTitle}" src="${escapeHTML(driveUrl)}" referrerpolicy="no-referrer" allow="autoplay"></iframe>
    <script>
      const notifyParent = (type) => {
        if (window.parent === window) return false;
        window.parent.postMessage({ type }, location.origin);
        return true;
      };
      document.getElementById("return-to-site").addEventListener("click", (event) => {
        const messageType = ${JSON.stringify(returnMessageType)};
        if (notifyParent(messageType)) event.preventDefault();
      });
      const websitePreview = document.getElementById("website-preview");
      websitePreview?.addEventListener("click", (event) => {
        if (notifyParent("MRH_RESOURCE_PREVIEW_WEBSITE_FALLBACK")) event.preventDefault();
      });
    </script>
  </body>
</html>`;
    const viewerUrl = URL.createObjectURL(
      new Blob([viewerHtml], { type: "text/html;charset=utf-8" }),
    );
    resourcePortalPreviewBlobViewerUrl = viewerUrl;
    try {
      resourcePortalPreviewUrlOpened = false;
      resourcePortalPreviewPdfBytes = null;
      preview.classList.add("is-blob-viewer");
      frame.title = title || "File Preview";
      frame.hidden = false;
      frame.src = viewerUrl;
      if (status) {
        status.classList.remove("is-loading");
        status.hidden = true;
      }
    } catch (error) {
      preview.classList.remove("is-blob-viewer", "is-pdf-fallback");
      resourcePortalPreviewBlobViewerUrl = "";
      URL.revokeObjectURL(viewerUrl);
      throw error;
    }
    return true;
  }

  function openReviewerPdfBlobViewer(
    activePdf,
    title,
    preview,
    frame,
    status,
    titleLines = null,
  ) {
    if (
      !activePdf ||
      !reviewerSessionId ||
      activePdf.sessionId !== reviewerSessionId
    )
      return false;
    return openBlobResourceViewer(title, {
      downloadFileName: activePdf.downloadFileName,
      viewerWatermark: {
        brand: "MRH",
        fullName: activePdf.fullName,
        email: activePdf.email,
      },
      preview,
      frame,
      status,
      titleLines,
      forcePdfJs: true,
      pdfBytes: activePdf.bytes,
    });
  }

  function getReviewerPdfCourseHeading(course) {
    return resourceCatalogCore.getReviewerPdfCourseHeading(course);
  }

  function getReviewerPdfTermHeading(year, semester) {
    return resourceCatalogCore.getReviewerPdfTermHeading(year, semester);
  }

  function getReviewerPdfLessonTitle(fileName, courseName) {
    return resourceCatalogCore.getReviewerPdfLessonTitle(fileName, courseName);
  }

  const reviewerPdfProcessor = globalScope.ReviewerPdfProcessorCore.create({
    getTimingNow: getReviewerPdfTimingNow,
  });

  function decodeBase64Bytes(encoded) {
    return reviewerPdfProcessor.decodeBase64(encoded);
  }

  function hasPdfSignature(bytes) {
    return reviewerPdfProcessor.hasPdfSignature(bytes);
  }

  function cancelReviewerPdfPreviewGeneration() {
    clearReviewerPdfViewerWatchdog();
    reviewerPdfPreviewAbortController?.abort();
    reviewerPdfPreviewAbortController = null;
    reviewerPdfProcessor.cancel();
  }

  function discardReviewerPdfWorker(worker, error) {
    return reviewerPdfProcessor.discardWorker(worker, error);
  }

  function getReviewerPdfWorker() {
    return reviewerPdfProcessor.getWorker();
  }

  function watermarkReviewerPdfInWorker(source, identity, workerReady) {
    return reviewerPdfProcessor.watermark(source, identity, workerReady);
  }

  function encryptReviewerPdfInWorker(source, downloadPassword, workerReady) {
    return reviewerPdfProcessor.encrypt(source, downloadPassword, workerReady);
  }

  function hasReviewerPdfEncryptionDictionary(bytes) {
    return reviewerPdfProcessor.hasEncryptionDictionary(bytes);
  }

  function processReviewerPdfInWorker(source, identity, workerReady, operationType) {
    return reviewerPdfProcessor.process(source, identity, workerReady, operationType);
  }

  function waitForReviewerPdfRetry(delayMs, signal) {
    return reviewerPdfDownloadCore.waitForRetry(delayMs, signal);
  }

  async function callReviewerPdfPreviewWithRetry(request, options) {
    return reviewerPdfDownloadCore.callPreviewWithRetry(request, options);
  }

  function hasValidReviewerPdfSource(response) {
    const sourceByteLength = Number(response?.sourceByteLength);
    return (
      Number.isSafeInteger(sourceByteLength) &&
      sourceByteLength >= 5 &&
      sourceByteLength <= REVIEWER_PDF_MAX_SOURCE_BYTES &&
      typeof response?.data === "string" &&
      /^[A-Za-z0-9+/]*={0,2}$/.test(response.data) &&
      response.data.length === Math.ceil(sourceByteLength / 3) * 4
    );
  }

  function getCachedReviewerPdfSource(fileId) {
    const cachedSource = reviewerPdfSourceCache;
    return cachedSource &&
      cachedSource.sessionId === reviewerSessionId &&
      cachedSource.fileId === String(fileId || "")
      ? cachedSource
      : null;
  }

  function clearReviewerPdfSourceCache() {
    reviewerPdfSourceCache = null;
  }

  function getReviewerPdfTimingNow() {
    return reviewerPdfDownloadCore.getTimingNow();
  }

  function logReviewerPdfPreviewTimings(timings) {
    reviewerPdfDownloadCore.logPreviewTimings(timings);
  }

  function renderReviewerPdfDownloadFallback(status, activePdf, messageText) {
    return reviewerPdfViewerCore.renderDownloadFallback(
      status,
      activePdf,
      messageText,
    );
  }

  const reviewerPdfDownloadCore = globalScope.ReviewerPdfDownloadCore.create({
    cleanResourceDisplayName,
    encryptPdf: encryptReviewerPdfInWorker,
    getActivePdf: () => resourcePortalReviewerPdf,
    getReviewerDisplayName: getReviewerPdfDisplayName,
    getSessionId: () => reviewerSessionId,
    getWorker: getReviewerPdfWorker,
    hasEncryptionDictionary: hasReviewerPdfEncryptionDictionary,
    hasPreviewObjectUrl: () =>
      Boolean(
        resourcePortalPreviewObjectUrl ||
          (resourcePortalPreviewIsReviewer &&
            resourcePortalReviewerPdf?.bytes instanceof Uint8Array),
      ),
    logResourceDashboardAction,
    markPreviewUrlOpened: () => {
      resourcePortalPreviewUrlOpened = true;
    },
    setPreviewStatus: setReviewerPdfPreviewStatus,
    clearPreviewStatus: clearReviewerPdfPreviewStatus,
    showToast,
  });

  function watchReviewerPdfPreviewRender(frame, status, activePdf, generation) {
    return reviewerPdfViewerCore.watchRender(frame, status, activePdf, generation);
  }

  async function downloadReviewerPdf(event, alreadyConfirmed = false) {
    return reviewerPdfDownloadCore.download(event, alreadyConfirmed);
  }

  async function issueReviewerPdfDownload(event, alreadyConfirmed = false) {
    return reviewerPdfDownloadCore.issue(event, alreadyConfirmed);
  }

  function getResourceDashboardFolderPanel(frame) {
    const viewer = frame?.parentElement;
    if (!viewer) return null;
    let panel = viewer.querySelector(".resource-dashboard-folder-preview");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "resource-dashboard-folder-preview";
      panel.hidden = true;
      viewer.appendChild(panel);
    }
    return panel;
  }

  function renderResourceDashboardFolderListing(listing, frame, status) {
    const panel = getResourceDashboardFolderPanel(frame);
    if (!panel) return false;
    resourceDashboardFolderListing = listing;
    panel.replaceChildren();

    const items = document.createElement("ul");
    items.className = "resource-dashboard-folder-items";
    [...listing.items]
      .map((item, index) => ({ item, index }))
      .sort(
        (left, right) =>
          compareResourceOrder(left.item.name, right.item.name) ||
          left.index - right.index,
      )
      .forEach(({ item }) => {
        const row = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.disabled = !/^[A-Za-z0-9_-]{10,200}$/.test(
          String(item.id || ""),
        );
        const icon = document.createElement("i");
        icon.className =
          item.type === "folder"
            ? "fa-solid fa-folder"
            : "fa-solid fa-file-lines";
        icon.setAttribute("aria-hidden", "true");
        const name = document.createElement("span");
        const originalName = String(item.name || "Unnamed resource");
        name.appendChild(
          document.createTextNode(
            (item.type === "folder"
              ? getCourseHeading(originalName)
              : cleanResourceDisplayName(originalName)) || "Unnamed resource",
          ),
        );
        let thumbnailUrl = "";
        if (item.type === "file") {
          try {
            const parsedUrl = new URL(String(item.thumbnailLink || ""));
            if (
              parsedUrl.protocol === "https:" &&
              (parsedUrl.hostname.endsWith(".googleusercontent.com") ||
                parsedUrl.hostname === "drive.google.com") &&
              !parsedUrl.username &&
              !parsedUrl.password
            )
              thumbnailUrl = parsedUrl.href;
          } catch (error) {
            thumbnailUrl = "";
          }
        }
        const isPdf = item.mimeType === "application/pdf";
        if (thumbnailUrl) {
          const thumbnail = document.createElement("img");
          thumbnail.className = "resource-dashboard-folder-thumbnail";
          thumbnail.src = thumbnailUrl;
          thumbnail.alt = "";
          thumbnail.loading = "lazy";
          thumbnail.referrerPolicy = "no-referrer";
          thumbnail.addEventListener("error", () => thumbnail.remove(), {
            once: true,
          });
          button.append(thumbnail, name);
        } else {
          if (item.type === "file") {
            const fallback = document.createElement("span");
            fallback.className = "resource-dashboard-folder-thumbnail-fallback";
            if (!isPdf) {
              const fallbackIcon = document.createElement("i");
              fallbackIcon.className = "fa-solid fa-file-lines";
              fallbackIcon.setAttribute("aria-hidden", "true");
              fallback.appendChild(fallbackIcon);
            }
            button.append(fallback, name);
          } else {
            button.append(icon, name);
          }
        }
        button.addEventListener("click", () => {
          if (button.disabled) return;
          if (item.type === "folder") {
            void logResourceDashboardAction(
              "MODULES",
              "FOLDER_OPEN",
              item.name,
              item.name,
            );
            void loadResourceDashboardFolderPreview(item.id, frame, status);
            return;
          }
          void logResourceFileClick("MODULES", item.name, item.id, {
            category: "MODULES",
          });
          resourceDashboardFolderReturn = resourceDashboardFolderListing;
          void previewResourceFile(item.id, item.name, {
            dashboardFolderFile: true,
            mimeType: item.mimeType,
            course: getCourseCodeFromBreadcrumbs(
              listing.breadcrumbs,
              String(listing.folder?.name || ""),
            ),
          });
        });
        row.appendChild(button);
        const itemType = document.createElement("span");
        itemType.className = "resource-dashboard-folder-item-type";
        if (item.type === "file" && isPdf) {
          const pdfIcon = document.createElement("i");
          pdfIcon.className = "fa-solid fa-file-pdf";
          pdfIcon.setAttribute("aria-label", "PDF");
          itemType.appendChild(pdfIcon);
        } else {
          itemType.textContent =
            item.type === "folder"
              ? "Folder"
              : isPdf
                ? "PDF"
                : item.mimeType === "application/vnd.google-apps.document"
                  ? "Google Doc"
                  : item.mimeType === "application/vnd.google-apps.spreadsheet"
                    ? "Google Sheet"
                    : item.mimeType ===
                        "application/vnd.google-apps.presentation"
                      ? "Google Slides"
                      : "File";
        }
        row.appendChild(itemType);
        items.appendChild(row);
      });
    panel.appendChild(items);

    if (!listing.items.length && !listing.nextPageToken) {
      const empty = document.createElement("p");
      empty.className = "resource-dashboard-folder-empty";
      empty.textContent = "This folder is empty.";
      panel.appendChild(empty);
    }
    if (listing.nextPageToken) {
      const loadMore = document.createElement("button");
      loadMore.type = "button";
      loadMore.className = "resource-dashboard-folder-load-more";
      loadMore.textContent = "Load more";
      loadMore.addEventListener("click", () => {
        void logResourceDashboardAction(
          "MODULES",
          "FOLDER_PAGE",
          "Load more",
          String(listing.folder?.name || ""),
        );
        void loadResourceDashboardFolderPreview(
          listing.folder.id,
          frame,
          status,
          listing.nextPageToken,
        );
      });
      panel.appendChild(loadMore);
    }
    const title = document.getElementById("resource-portal-preview-title");
    if (title) {
      const folderName = String(listing.folder?.name || "Folder");
      title.replaceChildren();
      title.appendChild(document.createTextNode(getCourseHeading(folderName)));
    }
    return true;
  }

  function loadResourceDashboardFolderPreview(
    folderId,
    frame,
    status,
    pageToken = "",
  ) {
    return resourcePortalBrowser.loadFolderPreview(
      folderId,
      frame,
      status,
      pageToken,
    );
  }

  async function previewResourceFile(
    fileId,
    fileName,
    {
      reviewer = false,
      course = "",
      year = "",
      semester = "",
      category = "",
      folderId = "",
      dashboardFolderFile = false,
      mimeType = "",
      forceInSite = false,
    } = {},
  ) {
    const preview = document.getElementById("resource-portal-preview");
    const title = document.getElementById("resource-portal-preview-title");
    const fileIcon = document.getElementById(
      "resource-portal-preview-file-icon",
    );
    const frame = document.getElementById("resource-portal-preview-frame");
    const status = document.getElementById("resource-portal-preview-status");
    const downloadButton = document.getElementById(
      "resource-portal-preview-download",
    );
    const backButton = document.getElementById("resource-portal-preview-back");
    if (!preview || !title || !frame) return false;
    if (
      reviewer &&
      !isReviewerBackendAvailable() &&
      !reviewerSessionRestorePending &&
      (reviewerAccountStatus === "TRUE" ||
        (!hasExplicitReviewerSignOut() &&
          Boolean(getStoredReviewerSessionId())))
    ) {
      openResourceDashboardTab("REVIEWERS");
      return false;
    }
    const reviewerRequestKey = reviewer
      ? `${
          reviewerSessionId ||
          getStoredReviewerSessionId() ||
          reviewerAuthorizedEmail.toLowerCase()
        }:${String(fileId || "")}`
      : "";
    if (reviewer && reviewerPdfPreviewInFlight?.key === reviewerRequestKey)
      return false;
    if (
      reviewer &&
      !setReviewerPdfSelectionRateLimit(
        reviewerSessionId || getStoredReviewerSessionId(),
        fileId,
      )
    )
      return false;
    const requestOptions = {
      reviewer,
      course,
      year,
      semester,
      category,
      folderId,
      dashboardFolderFile,
      mimeType,
      forceInSite,
    };
    resourcePreviewController.begin({
      fileId,
      fileName,
      options: requestOptions,
    });
    resourcePortalPreviewBlobViewerStatus = "";
    preview.classList.remove("is-blob-viewer", "is-pdf-fallback");
    resourcePortalPreviewBlobViewerReady = false;
    resourcePortalPreviewBlobViewerError = "";
    reviewerPdfViewerCore.clearRenderCheck();
    const closeButton = document.getElementById(
      "resource-portal-preview-close",
    );
    if (!preview.dataset.selectionRestricted) {
      ["selectstart", "copy", "cut", "contextmenu"].forEach((eventName) => {
        preview.addEventListener(eventName, (event) => {
          if (resourcePortalPreviewIsReviewer) event.preventDefault();
        });
      });
      preview.addEventListener("keydown", (event) => {
        if (
          resourcePortalPreviewIsReviewer &&
          (event.ctrlKey || event.metaKey) &&
          ["a", "c", "x"].includes(event.key.toLowerCase())
        )
          event.preventDefault();
      });
      preview.dataset.selectionRestricted = "true";
    }
    if (closeButton && !closeButton.dataset.initialized) {
      closeButton.addEventListener("click", () => {
        closeResourcePreview("preview-close-button");
      });
      closeButton.dataset.initialized = "true";
    }
    if (!preview.dataset.blobViewerReturnListener) {
      globalScope.addEventListener("message", (event) => {
        if (
          event.origin !== globalScope.location.origin ||
          event.source !== frame.contentWindow
        )
          return;
        if (event.data?.type === "MRH_PDF_VIEWER_READY") {
          clearReviewerPdfViewerWatchdog();
          resourcePortalPreviewBlobViewerReady = true;
          if (resourcePortalPreviewBlobViewerError) {
            showReviewerPdfBlobViewerError(
              resourcePortalPreviewBlobViewerError,
            );
            return;
          }
          if (resourcePortalPreviewBlobViewerStatus)
            setReviewerPdfPreviewStatus(resourcePortalPreviewBlobViewerStatus);
          if (!sendReviewerPdfBytesToBlobViewer()) {
            resourcePortalPreviewBlobViewerReady = false;
            failReviewerPdfCanvasViewer(
              "The PDF preview viewer could not receive the document. Use Download to open the protected PDF.",
            );
          }
          return;
        }
        if (event.data?.type === "MRH_PDF_VIEWER_FALLBACK_READY") {
          clearReviewerPdfPreviewStatus();
          return;
        }
        if (event.data?.type === "MRH_PDF_VIEWER_DOWNLOAD_REQUEST") {
          void downloadReviewerPdf(null);
          return;
        }
        if (event.data?.type === "MRH_PDF_RENDER_FAILURE") {
          if (resourcePortalPreviewIsReviewer) {
            failReviewerPdfCanvasViewer(String(event.data.message || ""));
            return;
          }
          clearReviewerPdfPreviewStatus();
          showReviewerPdfBlobViewerError(
            String(
              event.data.message ||
                "The PDF preview could not be displayed. Use Download to open the PDF.",
            ),
            true,
          );
          showToast("The PDF preview could not be displayed.", "warning", 5000);
          return;
        }
        if (event.data?.type === "MRH_PDF_VIEWER_ERROR") {
          showReviewerPdfBlobViewerError(
            event.data.message,
            event.data.retryable === true,
          );
          return;
        }
        if (event.data?.type === "MRH_PDF_PREVIEW_RETRY") {
          const request = resourcePreviewController.getRequest();
          if (request)
            void previewResourceFile(
              request.fileId,
              request.fileName,
              request.options,
            );
          return;
        }
        if (event.data?.type === "MRH_PDF_VIEWER_FIRST_PAGE_RENDERED") {
          clearReviewerPdfViewerWatchdog();
          clearReviewerPdfPreviewStatus();
          if (resourcePortalReviewerPdf?.timings?.previewStartedAt) {
            const timings = resourcePortalReviewerPdf.timings;
            (globalScope.DebugUtils || console).info(
              "Reviewer PDF first-page render timing.",
              {
                authorizationAndSourceRoundTripMs:
                  timings.authorizationAndSourceRoundTripMs,
                sourceDownloadMs: timings.sourceDownloadMs,
                sourceCacheHit: timings.sourceCacheHit,
                processedPdfCacheHit: timings.processedPdfCacheHit,
                correlationId: timings.correlationId,
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
                timeToFirstPageMs: timings.previewRequestedAt
                  ? getReviewerPdfTimingNow() - timings.previewRequestedAt
                  : null,
                firstPageRenderMs:
                  getReviewerPdfTimingNow() - timings.previewStartedAt,
              },
            );
          }
          return;
        }
        if (event.data?.type === "MRH_RESOURCE_PREVIEW_WEBSITE_FALLBACK") {
          const request = resourcePreviewController.getRequest();
          if (!request || request.options.forceInSite) return;
          void previewResourceFile(request.fileId, request.fileName, {
            ...request.options,
            forceInSite: true,
          });
          return;
        }
        const returnToWebsite = () => {
          if (
            resourceDashboardActiveTab === "MODULES" &&
            resourceDashboardFolderReturn &&
            backButton &&
            !backButton.hidden
          ) {
            backButton.click();
            return;
          }
          closeResourcePreview("viewer-return");
        };
        if (event.data?.type === "MRH_RESOURCE_PREVIEW_RETURN_REQUEST") {
          if (resourcePreviewReturnConfirmationPending) return;
          resourcePreviewReturnConfirmationPending = true;
          void (async () => {
            try {
              const confirmed = await requestConfirmation(
                "Are you sure you want to return to the website?",
                "Return to Website",
              );
              if (confirmed) returnToWebsite();
            } catch (error) {
              (globalScope.DebugUtils || console).error(
                "Unable to confirm returning from the preview.",
                error,
              );
            } finally {
              resourcePreviewReturnConfirmationPending = false;
            }
          })();
          return;
        }
        if (event.data?.type === "MRH_RESOURCE_PREVIEW_RETURN")
          returnToWebsite();
      });
      preview.dataset.blobViewerReturnListener = "true";
    }
    if (downloadButton && !downloadButton.dataset.initialized) {
      downloadButton.addEventListener("click", downloadReviewerPdf);
      downloadButton.dataset.initialized = "true";
    }
    if (backButton && !backButton.dataset.initialized) {
      backButton.addEventListener("click", () => {
        const listing = resourceDashboardFolderReturn;
        if (!listing) {
          if (
            resourceDashboardActiveTab === "MODULES" &&
            !resourcePortalPreviewIsReviewer
          )
            closeResourcePreview("module-preview-back");
          return;
        }
        const panel = getResourceDashboardFolderPanel(frame);
        if (!panel) return;
        cancelReviewerPdfPreviewGeneration();
        resourcePreviewController.nextGeneration();
        resourcePortalPreviewBlobViewerReady = false;
        resourceDashboardFolderGeneration += 1;
        resourceDashboardFolderReturn = null;
        resourcePortalPreviewIsReviewer = false;
        resourcePortalPreviewCourse = "";
        resourcePortalReviewerPdf = null;
        resourcePortalPreviewPdfBytes = null;
        resourcePreviewController.begin(null);
        releaseResourcePortalPreviewObjectUrl();
        frame.removeAttribute("src");
        frame.hidden = true;
        frame.title = `Preview of ${String(listing.folder?.name || "Folder")}`;
        const previewTitle = document.getElementById(
          "resource-portal-preview-title",
        );
        if (previewTitle)
          previewTitle.textContent = String(listing.folder?.name || "Folder");
        if (fileIcon) fileIcon.hidden = true;
        if (downloadButton) {
          downloadButton.hidden = true;
          downloadButton.removeAttribute("href");
          downloadButton.removeAttribute("download");
        }
        backButton.hidden = true;
        preview.classList.remove(
          "is-blob-viewer",
          "is-reviewer-pdf",
          "is-module-preview",
        );
        panel.hidden = false;
        if (status) {
          status.classList.remove("is-loading");
          status.textContent = "";
          status.hidden = true;
        }
        renderResourceDashboardFolderListing(listing, frame, status);
      });
      backButton.dataset.initialized = "true";
    }
    const folderPanel = getResourceDashboardFolderPanel(frame);
    if (!dashboardFolderFile) resourceDashboardFolderReturn = null;
    if (backButton) {
      const returningToFolder = dashboardFolderFile;
      const returningToModules =
        !reviewer && resourceDashboardActiveTab === "MODULES";
      backButton.hidden = !returningToFolder && !returningToModules;
      const returnLabel = returningToFolder
        ? "Back to folder"
        : "Back to Modules";
      backButton.setAttribute("aria-label", returnLabel);
      backButton.title = returnLabel;
    }
    if (folderPanel) folderPanel.hidden = true;
    cancelReviewerPdfPreviewGeneration();
    const reviewerRequest = reviewer ? { key: reviewerRequestKey } : null;
    if (reviewerRequest) reviewerPdfPreviewInFlight = reviewerRequest;
    const previewAbortController = reviewer ? new AbortController() : null;
    reviewerPdfPreviewAbortController = previewAbortController;

    preview.classList.remove("is-fullscreen");
    preview.classList.toggle("is-reviewer-pdf", reviewer);
    preview.classList.toggle(
      "is-module-preview",
      dashboardFolderFile && !reviewer && !folderId,
    );
    const previewGeneration = resourcePreviewController.nextGeneration();
    let reviewerPdfViewerOpened = false;
    let previewReviewerSessionId = reviewer ? reviewerSessionId : "";
    let previewReviewerAuthGeneration = reviewerAuthGeneration;
    const reviewerPdfTimings = reviewer
      ? {
          previewRequestedAt: getReviewerPdfTimingNow(),
          authorizationAndSourceRoundTripMs: 0,
          sourceDownloadMs: 0,
          sourceCacheHit: false,
          processedPdfCacheHit: false,
          decodeMs: 0,
          watermarkMs: 0,
          sourceByteLength: 0,
          outputByteLength: 0,
          pageCount: 0,
          previewSetupMs: 0,
          previewStartedAt: 0,
          correlationId: "",
        }
      : null;
    resourceDashboardFolderGeneration += 1;
    resourcePortalPreviewIsReviewer = reviewer;
    resourcePortalPreviewCourse = String(course || "").trim();
    resourcePortalReviewerPdf = null;
    resourcePortalPreviewPdfBytes = null;
    if (downloadButton) {
      downloadButton.hidden = true;
      downloadButton.removeAttribute("href");
      downloadButton.removeAttribute("download");
    }
    releaseResourcePortalPreviewObjectUrl();
    frame.removeAttribute("src");
    frame.setAttribute("draggable", "false");
    frame.tabIndex = 0;
    frame.hidden = true;
    const previewCourse = String(course || "").trim();
    const reviewerCourseHeading = reviewer
      ? getReviewerPdfCourseHeading(course)
      : "";
    const reviewerTitleLines = reviewer
      ? {
          term: getReviewerPdfTermHeading(year, semester),
          course: reviewerCourseHeading || "Reviewer",
          file: resourceCatalogCore.getReviewerPdfPreviewTitle(fileName),
        }
      : null;
    const previewTitle = reviewer
      ? `${reviewerTitleLines.term}\n${reviewerTitleLines.course}\n${reviewerTitleLines.file}`
      : previewCourse
        ? getCourseHeading(previewCourse)
        : cleanResourceDisplayName(fileName) || "File preview";
    if (fileIcon)
      fileIcon.hidden = !(reviewer || /\.pdf$/i.test(String(fileName || "")));
    if (reviewer) {
      const termLine = document.createElement("span");
      termLine.className = "resource-portal-preview-title-term";
      termLine.textContent = reviewerTitleLines.term;
      const courseLine = document.createElement("span");
      courseLine.className = "resource-portal-preview-title-course";
      courseLine.textContent = reviewerTitleLines.course;
      const fileLine = document.createElement("span");
      fileLine.className = "resource-portal-preview-title-details";
      fileLine.textContent = reviewerTitleLines.file;
      title.replaceChildren(termLine, courseLine, fileLine);
    } else if (previewCourse) {
      const courseLine = document.createElement("span");
      courseLine.appendChild(
        document.createTextNode(getCourseHeading(previewCourse)),
      );
      const resourceLine = document.createElement("span");
      resourceLine.className = "resource-portal-preview-title-details";
      resourceLine.appendChild(
        document.createTextNode(
          cleanResourceDisplayName(fileName) || "Resource preview",
        ),
      );
      title.replaceChildren(courseLine, resourceLine);
    } else {
      const resourceLine = document.createElement("span");
      resourceLine.appendChild(document.createTextNode(previewTitle));
      title.replaceChildren(resourceLine);
    }
    frame.title = `Preview of ${previewTitle}`;
    preview.classList.add("is-fullscreen");
    preview.setAttribute("role", "dialog");
    preview.setAttribute("aria-modal", "true");
    preview.hidden = false;

    if (status) {
      status.removeAttribute("title");
      status.classList.add("is-loading");
      const loadingIcon = document.createElement("i");
      loadingIcon.className = "fa-solid fa-spinner fa-spin";
      loadingIcon.setAttribute("aria-hidden", "true");
      const loadingMessage = document.createElement("span");
      loadingMessage.textContent = reviewer
        ? "Verifying"
        : mimeType === "application/pdf" || /\.pdf$/i.test(fileName)
          ? "Loading preview"
          : "Loading File Preview...";
      status.replaceChildren(loadingIcon, loadingMessage);
      status.hidden = false;
    }
    try {
      if (!reviewer && folderId)
        return await loadResourceDashboardFolderPreview(
          folderId,
          frame,
          status,
        );
      if (
        previewGeneration !== resourcePreviewController.getGeneration() ||
        previewAbortController?.signal.aborted
      )
        return false;
      if (reviewer && !reviewerSessionId && getStoredReviewerSessionId())
        await restoreReviewerSession();
      if (
        previewGeneration !== resourcePreviewController.getGeneration() ||
        previewAbortController?.signal.aborted
      )
        return false;
      if (reviewer && !reviewerSessionId)
        throw new Error(
          "Your Reviewer session is unavailable. Return to the Reviewer section and try again.",
        );
      if (reviewer) {
        previewReviewerSessionId = reviewerSessionId;
        previewReviewerAuthGeneration = reviewerAuthGeneration;
      }
      const requestedMimeType = String(mimeType || "").toLowerCase();
      const isPdfResource =
        requestedMimeType === "application/pdf" || /\.pdf$/i.test(fileName);
      const isInlineResourceType =
        requestedMimeType === "application/pdf" ||
        requestedMimeType === "text/plain" ||
        requestedMimeType === "application/json" ||
        /^image\/(?:avif|gif|jpeg|png|webp)$/.test(requestedMimeType) ||
        /^(?:audio|video)\//.test(requestedMimeType);
      const isDrivePreviewOnly =
        resourceDashboardActiveTab === "MODULES" &&
        !isInlineResourceType &&
        !isPdfResource;
      const useDrivePreview =
        !reviewer &&
        !forceInSite &&
        (isPdfResource ||
          (resourceDashboardActiveTab === "MODULES" && !isInlineResourceType));
      if (forceInSite && isDrivePreviewOnly) {
        if (status) {
          status.textContent =
            "This file type must be previewed in Google Drive.";
          status.hidden = false;
        }
        return false;
      }
      const reviewerRequestStartedAt = reviewer ? getReviewerPdfTimingNow() : 0;
      const cachedReviewerPdfSource = reviewer
        ? reviewerPdfSourceReuseSupported
          ? getCachedReviewerPdfSource(fileId)
          : null
        : null;
      if (reviewerPdfSourceCache && !cachedReviewerPdfSource)
        clearReviewerPdfSourceCache();
      let reviewerRequestEventId = reviewer ? createResourceEventId() : "";
      let response;
      let reviewerPdfWorkerReady = null;
      if (reviewer) {
        if (isPdfResource)
          reviewerPdfWorkerReady = getReviewerPdfWorker().then(
            () => null,
            (error) => error,
          );
        const reviewerPdfRequest = {
          type: "get_reviewer_pdf_preview",
          sessionId: reviewerSessionId,
          eventId: reviewerRequestEventId,
          fileId,
          course,
          courseName: getCourseHeading(course, true) || course,
          year,
          semester,
          category,
          ...(cachedReviewerPdfSource
            ? {
                cachedSourceVersion: cachedReviewerPdfSource.sourceVersion,
              }
            : {}),
          ...(cachedReviewerPdfSource?.sourceBytes instanceof Uint8Array &&
          cachedReviewerPdfSource.sourceBytes.byteLength ===
            cachedReviewerPdfSource.sourceByteLength &&
          hasPdfSignature(cachedReviewerPdfSource.sourceBytes)
            ? { cachedSignedSourceAvailable: true }
            : {}),
          preferDeliveryMode: "signed-url",
          issuancePurpose: "PREVIEW",
        };
        const reviewerPdfRequestOptions = {
          timeoutMs: 180000,
          queueTimeoutMs: 30000,
          priority: true,
          signal: previewAbortController?.signal,
          bypassIdleGate: true,
        };
        try {
          response = await callReviewerPdfPreviewWithRetry(
            reviewerPdfRequest,
            reviewerPdfRequestOptions,
          );
        } catch (error) {
          const invalidCachedSourceVersionError =
            cachedReviewerPdfSource &&
            (error?.message === "The cached PDF source version is invalid." ||
              error?.code === "BAD_REQUEST" ||
              error?.status === 400) &&
            !previewAbortController?.signal.aborted;
          if (!invalidCachedSourceVersionError) throw error;
          reviewerPdfSourceReuseSupported = false;
          clearReviewerPdfSourceCache();
          const uncachedReviewerPdfRequest = { ...reviewerPdfRequest };
          delete uncachedReviewerPdfRequest.cachedSourceVersion;
          response = await callReviewerPdfPreviewWithRetry(
            uncachedReviewerPdfRequest,
            reviewerPdfRequestOptions,
          );
        }
      } else {
        response = await globalScope.AppNetwork.callBackend(
          {
            type: "get_resource_preview",
            fileId,
            ...(useDrivePreview ? { previewMode: "drive" } : {}),
          },
          {
            timeoutMs: 180000,
            maxRetries: 0,
            signal: previewAbortController?.signal,
          },
        );
      }
      if (reviewer)
        reviewerPdfTimings.authorizationAndSourceRoundTripMs =
          getReviewerPdfTimingNow() - reviewerRequestStartedAt;
      if (reviewer) reviewerPdfTimings.correlationId = reviewerRequestEventId;
      if (previewGeneration !== resourcePreviewController.getGeneration())
        return false;
      if (previewAbortController?.signal.aborted) return false;
      const previewFolderPanel = getResourceDashboardFolderPanel(frame);
      if (previewFolderPanel) previewFolderPanel.hidden = true;
      if (useDrivePreview) {
        if (
          response?.status !== "success" ||
          response.deliveryMode !== "drive" ||
          typeof response.name !== "string" ||
          typeof response.mimeType !== "string"
        )
          throw new Error(
            response?.message ||
              "The external file preview could not be prepared.",
          );
        const returnLabel = dashboardFolderFile
          ? "Back to Folder"
          : resourceDashboardActiveTab === "MODULES"
            ? "Back to Modules"
            : "Return to Website";
        if (
          !openDriveResourceViewer(previewTitle, fileId, response.mimeType, {
            preview,
            frame,
            status,
            returnLabel,
            allowWebsiteFallback: !isDrivePreviewOnly,
          })
        )
          throw new Error("The external file preview URL is invalid.");
        return true;
      }
      const isSignedReviewerPdfSource =
        reviewer && response?.deliveryMode === "signed-url";
      const isCachedSignedReviewerPdfSource =
        reviewer &&
        response?.deliveryMode === "cached-authorized-source" &&
        cachedReviewerPdfSource &&
        cachedReviewerPdfSource.sourceVersion === response.sourceVersion &&
        cachedReviewerPdfSource.sourceByteLength ===
          Number(response.sourceByteLength) &&
        cachedReviewerPdfSource.sourceBytes instanceof Uint8Array &&
        cachedReviewerPdfSource.sourceBytes.byteLength ===
          Number(response.sourceByteLength) &&
        hasPdfSignature(cachedReviewerPdfSource.sourceBytes);
      if (
        response?.status !== "success" ||
        (!isSignedReviewerPdfSource &&
          !isCachedSignedReviewerPdfSource &&
          (typeof response.data !== "string" ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(response.data)))
      ) {
        throw new Error(
          response?.message ||
            "The preview service returned invalid file data.",
        );
      }
      if (
        reviewer &&
        (typeof response.fullName !== "string" ||
          !response.fullName.trim() ||
          typeof response.firstName !== "string" ||
          !response.firstName.trim() ||
          typeof response.lastName !== "string" ||
          !response.lastName.trim() ||
          typeof response.email !== "string" ||
          !response.email.trim() ||
          typeof response.issuanceReference !== "string" ||
          !/^MRH-[0-9]{4}-[0-9]{4}$/.test(response.issuanceReference) ||
          typeof response.downloadFileName !== "string" ||
          !/^[^<>:"/\\|?*\u0000-\u001f]{1,255}\.pdf$/i.test(
            response.downloadFileName,
          ))
      )
        throw new Error(
          "The backend did not provide verified account and download metadata.",
        );

      const responseMimeType = String(response.mimeType || "").toLowerCase();
      if (
        requestedMimeType === "application/pdf" &&
        responseMimeType !== "application/pdf"
      )
        throw new Error(
          "The preview service returned an unexpected file type.",
        );
      const isCachedReviewerPdfSource =
        reviewer &&
        response.deliveryMode === "cached-authorized-source" &&
        cachedReviewerPdfSource &&
        cachedReviewerPdfSource.sourceVersion === response.sourceVersion &&
        cachedReviewerPdfSource.sourceByteLength ===
          Number(response.sourceByteLength);
      const cachedWatermarkedPdf =
        (isSignedReviewerPdfSource || isCachedSignedReviewerPdfSource) &&
        cachedReviewerPdfSource?.watermarkedBytes instanceof Uint8Array &&
        cachedReviewerPdfSource.watermarkedBytes.byteLength <=
          REVIEWER_PDF_MAX_SOURCE_BYTES &&
        hasPdfSignature(cachedReviewerPdfSource.watermarkedBytes) &&
        cachedReviewerPdfSource.sessionId === previewReviewerSessionId &&
        cachedReviewerPdfSource.sourceVersion === response.sourceVersion &&
        cachedReviewerPdfSource.sourceByteLength ===
          Number(response.sourceByteLength) &&
        cachedReviewerPdfSource.fullName === response.fullName &&
        cachedReviewerPdfSource.email === response.email &&
        cachedReviewerPdfSource.issuanceReference ===
          response.issuanceReference &&
        cachedReviewerPdfSource.downloadFileName ===
          response.downloadFileName
        ? cachedReviewerPdfSource.watermarkedBytes
        : null;
      if (
        reviewer &&
        (responseMimeType !== "application/pdf" ||
          (!isSignedReviewerPdfSource &&
            response.deliveryMode !== "authorized-source" &&
            !isCachedReviewerPdfSource))
      )
        throw new Error(
          "The PDF preview service did not return an authorized PDF source.",
        );
      if (
        reviewer &&
        !/^[a-f0-9]{64}$/i.test(String(response.sourceVersion || ""))
      )
        throw new Error("The protected source PDF metadata is invalid.");
      const reviewerSourceBase64 = reviewer
        ? isSignedReviewerPdfSource || isCachedSignedReviewerPdfSource
          ? ""
          : isCachedReviewerPdfSource
            ? cachedReviewerPdfSource.sourceBase64
            : response.data
        : "";
      let reviewerSourceBytes = null;
      if (isSignedReviewerPdfSource) {
        const sourceDownloadStartedAt = getReviewerPdfTimingNow();
        reviewerSourceBytes = cachedWatermarkedPdf
          ? null
          : isCachedSignedReviewerPdfSource
            ? cachedReviewerPdfSource.sourceBytes.slice()
            : await globalScope.AppNetwork.fetchReviewerPdfSignedSource({
                signedUrl: response.signedUrl,
                signedUrlExpiresInSeconds: response.signedUrlExpiresInSeconds,
                fileId,
                sourceVersion: response.sourceVersion,
                sourceByteLength: response.sourceByteLength,
                downloadFileName: response.downloadFileName,
                signal: previewAbortController?.signal,
              });
        reviewerPdfTimings.sourceDownloadMs =
          isCachedSignedReviewerPdfSource || cachedWatermarkedPdf
            ? 0
            : getReviewerPdfTimingNow() - sourceDownloadStartedAt;
        reviewerPdfTimings.sourceCacheHit =
          isCachedSignedReviewerPdfSource || Boolean(cachedWatermarkedPdf);
        reviewerPdfTimings.processedPdfCacheHit =
          Boolean(cachedWatermarkedPdf);
      } else if (isCachedSignedReviewerPdfSource) {
        reviewerSourceBytes =
          cachedReviewerPdfSource.sourceBytes.slice();
        reviewerPdfTimings.sourceCacheHit = true;
        reviewerPdfTimings.processedPdfCacheHit =
          Boolean(cachedWatermarkedPdf);
      }
      if (
        reviewer &&
        !isSignedReviewerPdfSource &&
        !isCachedSignedReviewerPdfSource &&
        !hasValidReviewerPdfSource({
          ...response,
          data: reviewerSourceBase64,
        })
      )
        throw new Error("The protected source PDF metadata is invalid.");
      if (reviewer) response.data = "";
      if (previewAbortController?.signal.aborted) return false;
      if (
        !reviewer &&
        response.data.length > RESOURCE_PREVIEW_MAX_BASE64_LENGTH
      )
        throw new Error(
          "The preview file exceeds the 32 MiB in-site transport limit.",
        );
      let bytes;
      if (reviewer) {
        const watermarkStartedAt = getReviewerPdfTimingNow();
        let preparedPdf;
        if (cachedWatermarkedPdf) {
          bytes = cachedWatermarkedPdf;
        } else {
          preparedPdf = await watermarkReviewerPdfInWorker(
            isSignedReviewerPdfSource || isCachedSignedReviewerPdfSource
              ? reviewerSourceBytes
              : reviewerSourceBase64,
            {
              fullName: String(response.fullName || ""),
              email: String(response.email || ""),
              downloadFileName: String(response.downloadFileName || ""),
              issuanceReference: String(response.issuanceReference || ""),
            },
            reviewerPdfWorkerReady,
          );
          bytes = preparedPdf.bytes;
          Object.assign(reviewerPdfTimings, preparedPdf.metrics);
          if (preparedPdf.metrics.watermarkFontFallback) {
            (globalScope.DebugUtils || console).warn(
              "Unicode watermark assets were unavailable; the PDF preview used the built-in font fallback.",
              {
                correlationId: reviewerPdfRequestEventId,
                reason: String(
                  preparedPdf.metrics.watermarkFontFallbackReason || "",
                ).slice(0, 240),
              },
            );
          }
        }
        reviewerPdfTimings.watermarkMs =
          getReviewerPdfTimingNow() - watermarkStartedAt;
        reviewerPdfTimings.workerStartupMs = reviewerPdfProcessor.getStartupMs() || 0;
        if (
          preparedPdf &&
          preparedPdf.metrics.sourceByteLength !==
          Number(response.sourceByteLength)
        )
          throw new Error("The protected PDF source length did not match.");
        if (
          previewGeneration !== resourcePreviewController.getGeneration() ||
          previewReviewerSessionId !== reviewerSessionId ||
          previewReviewerAuthGeneration !== reviewerAuthGeneration
        )
          return false;
        if (reviewerPdfSourceReuseSupported && preparedPdf)
          reviewerPdfSourceCache = {
            sessionId: previewReviewerSessionId,
            fileId: String(fileId || ""),
            sourceVersion: response.sourceVersion,
            sourceByteLength: Number(response.sourceByteLength),
            sourceBase64: isSignedReviewerPdfSource ||
              isCachedSignedReviewerPdfSource
              ? ""
              : reviewerSourceBase64,
            sourceBytes:
              preparedPdf.sourceBytes instanceof Uint8Array &&
              preparedPdf.sourceBytes.byteLength ===
                Number(response.sourceByteLength)
                ? preparedPdf.sourceBytes
                : null,
          };
      } else {
        bytes = decodeBase64Bytes(response.data);
        response.data = "";
      }
      if (reviewer) {
        reviewerPdfTimings.outputByteLength = bytes.byteLength;
        if (previewGeneration !== resourcePreviewController.getGeneration())
          return false;
      }
      if (
        !reviewer &&
        responseMimeType === "application/pdf" &&
        !hasPdfSignature(bytes)
      )
        throw new Error("The preview service returned invalid PDF content.");
      if (
        reviewer &&
        (bytes.byteLength < 5 ||
          bytes[0] !== 0x25 ||
          bytes[1] !== 0x50 ||
          bytes[2] !== 0x44 ||
          bytes[3] !== 0x46 ||
          bytes[4] !== 0x2d)
      )
        throw new Error("The PDF service returned invalid content.");
      if (
        reviewer &&
        reviewerPdfSourceReuseSupported &&
        !cachedWatermarkedPdf &&
        bytes.byteLength <= REVIEWER_PDF_MAX_SOURCE_BYTES &&
        reviewerPdfSourceCache?.sessionId === previewReviewerSessionId &&
        reviewerPdfSourceCache.fileId === String(fileId || "") &&
        reviewerPdfSourceCache.sourceVersion === response.sourceVersion
      ) {
        Object.assign(reviewerPdfSourceCache, {
          fullName: String(response.fullName || ""),
          email: String(response.email || ""),
          issuanceReference: String(response.issuanceReference || ""),
          downloadFileName: String(response.downloadFileName || ""),
          watermarkedBytes: bytes,
        });
      }
      if (reviewer)
        reviewerPdfTimings.previewReadyAt = getReviewerPdfTimingNow();
      const isSafeInlineType =
        responseMimeType === "application/pdf" ||
        responseMimeType === "text/plain" ||
        responseMimeType === "application/json" ||
        /^image\/(?:avif|gif|jpeg|png|webp)$/.test(responseMimeType);
      const isModulesSection =
        resourceDashboardActiveTab === "MODULES" && !reviewer;
      const isNativeMediaType = /^(?:audio|video)\//.test(responseMimeType);
      const previewMimeType =
        responseMimeType === "application/json"
          ? "text/plain"
          : isSafeInlineType || (isModulesSection && isNativeMediaType)
            ? responseMimeType
            : "application/octet-stream";
      if (!isSafeInlineType && !isModulesSection) {
        if (status) {
          status.textContent =
            "Online preview is not available for this file type.";
          status.hidden = false;
        }
        return false;
      }
      if (!reviewer) {
        const previewBlob = new Blob([bytes], { type: previewMimeType });
        resourcePortalPreviewObjectUrl = URL.createObjectURL(previewBlob);
      }
      if (reviewer) {
        resourcePortalReviewerPdf = {
          fileId: String(fileId || ""),
          sessionId: reviewerSessionId,
          fileName: getReviewerPdfDisplayName(fileName),
          fullName: String(response.fullName || ""),
          firstName: String(response.firstName || ""),
          lastName: String(response.lastName || ""),
          email: String(response.email || ""),
          issuanceReference: String(response.issuanceReference || ""),
          downloadFileName: String(response.downloadFileName || ""),
          course: String(course || ""),
          courseName: String(getCourseHeading(course, true) || course || ""),
          year: String(year || ""),
          semester: String(semester || ""),
          category: String(category || ""),
          bytes,
          sourceVersion: response.sourceVersion,
          sourceBase64: reviewerSourceBase64,
          sourceByteLength: Number(response.sourceByteLength),
          timings: reviewerPdfTimings,
        };
        resourcePortalPreviewUrlOpened = false;
        if (downloadButton) downloadButton.hidden = reviewer;
        if (reviewerPdfTimings)
          reviewerPdfTimings.previewStartedAt = getReviewerPdfTimingNow();
        if (reviewerPdfViewerOpened) {
          resourcePortalPreviewPdfBytes = bytes;
          if (!sendReviewerPdfBytesToBlobViewer()) {
            resourcePortalPreviewBlobViewerReady = false;
            failReviewerPdfCanvasViewer(
              "The PDF preview viewer could not receive the document. Use Download to open the protected PDF.",
            );
            return false;
          }
          reviewerPdfTimings.previewSetupMs =
            getReviewerPdfTimingNow() - reviewerPdfTimings.previewReadyAt;
          logReviewerPdfPreviewTimings(reviewerPdfTimings);
          return true;
        }
        if (
          (reviewerPdfViewerOpened = openReviewerPdfBlobViewer(
            resourcePortalReviewerPdf,
            previewTitle,
            preview,
            frame,
            status,
            reviewerTitleLines,
          ))
        ) {
          reviewerPdfTimings.previewSetupMs =
            getReviewerPdfTimingNow() - reviewerPdfTimings.previewReadyAt;
          logReviewerPdfPreviewTimings(reviewerPdfTimings);
          return true;
        }
        throw new Error("The protected PDF canvas viewer could not be opened.");
      } else {
        const isModulesFile = isModulesSection;
        const isSyllabusPdf =
          resourceDashboardActiveTab === "SYLLABUS" &&
          responseMimeType === "application/pdf" &&
          !reviewer;
        if (isModulesFile || isSyllabusPdf) {
          const returnLabel = isModulesFile
            ? dashboardFolderFile
              ? "Back to Folder"
              : "Back to Modules"
            : "Return to Website";
          if (
            openBlobResourceViewer(previewTitle, {
              downloadFileName: String(response.name || fileName || "resource"),
              preview,
              frame,
              status,
              returnLabel,
              pdfBytes: responseMimeType === "application/pdf" ? bytes : null,
            })
          )
            return true;
        }
      }
      if (reviewer && isPdfResource)
        throw new Error(
          "The protected PDF canvas viewer could not be opened. The native viewer is disabled.",
        );
      frame.hidden = false;
      await new Promise((resolve) => {
        if (typeof globalScope.requestAnimationFrame === "function")
          globalScope.requestAnimationFrame(resolve);
        else globalScope.setTimeout(resolve, 0);
      });
      if (previewGeneration !== resourcePreviewController.getGeneration())
        return false;
      if (reviewer && status) {
        status.classList.remove("is-loading");
        status.replaceChildren();
        status.hidden = true;
        watchReviewerPdfPreviewRender(
          frame,
          status,
          resourcePortalReviewerPdf,
          previewGeneration,
        );
      }
      if (reviewer)
        reviewerPdfTimings.previewStartedAt = getReviewerPdfTimingNow();
      frame.src = resourcePortalPreviewObjectUrl;
      if (reviewer) {
        reviewerPdfTimings.previewSetupMs =
          getReviewerPdfTimingNow() - reviewerPdfTimings.previewReadyAt;
        logReviewerPdfPreviewTimings(reviewerPdfTimings);
      }
      if (status) {
        status.classList.remove("is-loading");
        if (!reviewer) {
          status.textContent = "";
          status.hidden = true;
        }
      }
      return true;
    } catch (error) {
      if (previewGeneration !== resourcePreviewController.getGeneration())
        return false;
      if (
        reviewer &&
        previewReviewerSessionId &&
        (previewReviewerSessionId !== reviewerSessionId ||
          previewReviewerAuthGeneration !== reviewerAuthGeneration)
      )
        return false;
      if (reviewerPdfViewerOpened)
        showReviewerPdfBlobViewerError(
          `Unable to load file preview: ${String(error?.message || error)}`,
        );
      status?.classList.remove("is-loading");
      const preparedReviewerPdf =
        reviewer &&
        resourcePortalReviewerPdf &&
        resourcePortalReviewerPdf.bytes instanceof Uint8Array
          ? resourcePortalReviewerPdf
          : null;
      if (reviewer && !preparedReviewerPdf) {
        releaseResourcePortalPreviewObjectUrl();
        resourcePortalReviewerPdf = null;
        if (downloadButton) downloadButton.hidden = true;
      }
      const reviewerPdfRateLimited =
        reviewer &&
        (Number(error?.status) === 429 ||
          ["RATE_LIMITED", "RATE_LIMIT"].includes(
            String(error?.code || "").toUpperCase(),
          ) ||
          /rate.?limit/i.test(String(error?.message || "")));
      let reviewerSessionValidationFailed = false;
      if (reviewer && isDefinitivelyInvalidReviewerCredential(error)) {
        try {
          const verifiedSession = await reviewerAuthCore.restoreSession(
            previewReviewerSessionId || reviewerSessionId,
          );
          if (
            previewGeneration !== resourcePreviewController.getGeneration() ||
            previewReviewerAuthGeneration !== reviewerAuthGeneration ||
            previewReviewerSessionId !== reviewerSessionId
          )
            return false;
          applyReviewerAccountStatus(verifiedSession, previewReviewerSessionId);
          if (verifiedSession.accountStatus === "TRUE") {
            const message =
              "The PDF request could not be verified, but your sign-in is still active. Please retry the preview.";
            if (status) {
              status.textContent = message;
              status.hidden = false;
            }
            if (reviewerPdfViewerOpened)
              showReviewerPdfBlobViewerError(message, true);
            return false;
          }
          return false;
        } catch (sessionError) {
          if (
            previewGeneration !== resourcePreviewController.getGeneration() ||
            previewReviewerAuthGeneration !== reviewerAuthGeneration ||
            previewReviewerSessionId !== reviewerSessionId
          )
            return false;
          if (isDefinitivelyInvalidReviewerCredential(sessionError)) {
            signOutReviewer(false);
            setReviewerAuthStatus(
              "Your access session expired or was revoked. Sign in with Google again.",
            );
            return false;
          }
          reviewerSessionValidationFailed = true;
          (globalScope.DebugUtils || console).error(
            "Unable to confirm the Reviewer session after a PDF request failed authentication.",
            sessionError,
          );
        }
      }
      const retryableServerError =
        reviewer &&
        (reviewerPdfRateLimited ||
          reviewerSessionValidationFailed ||
          [
            "SERVER_ERROR",
            "NON_JSON_RESPONSE",
            "TEMPORARY_UNAVAILABLE",
          ].includes(String(error?.code || "")) ||
          error?.code === "SIGNED_URL_FETCH_FAILED" ||
          error?.name === "TimeoutError" ||
          error instanceof TypeError);
      if (reviewerPdfRateLimited) {
        const retryAfterMs = Number(error?.retryAfterMs);
        startReviewerPdfCooldown(
          Number.isFinite(retryAfterMs) && retryAfterMs > 0
            ? retryAfterMs
            : REVIEWER_PDF_CLICK_COOLDOWN_MS,
        );
        if (!reviewerPdfRateLimitWarningShown) {
          reviewerPdfRateLimitWarningShown = true;
          showToast(
            "You are being rate limited. Please wait before opening another PDF.",
            "warning",
            5000,
          );
        }
      }
      const temporaryAccessLogContention =
        reviewer && error?.code === "TEMPORARY_UNAVAILABLE";
      if (
        reviewer &&
        ["ACCOUNT_PENDING", "ACCOUNT_DENIED", "ACCOUNT_RESTRICTED"].includes(
          error?.code,
        )
      ) {
        const failedSessionId = reviewerSessionId;
        try {
          const accountStatus = await getReviewerAccountStatus(failedSessionId);
          if (
            previewGeneration !== resourcePreviewController.getGeneration() ||
            failedSessionId !== reviewerSessionId
          )
            return false;
          applyReviewerAccountStatus(accountStatus, failedSessionId);
          if (accountStatus.accountStatus !== "TRUE") return false;
          if (status) {
            status.textContent =
              "This account is not authorized to view this PDF.";
            status.hidden = false;
          }
          return false;
        } catch (statusError) {
          if (previewGeneration !== resourcePreviewController.getGeneration())
            return false;
          if (isDefinitivelyInvalidReviewerCredential(statusError)) {
            signOutReviewer(false);
            setReviewerAuthStatus(
              "Your access session expired or was revoked. Sign in with Google again.",
            );
            return false;
          }
          (globalScope.DebugUtils || console).error(
            "Unable to refresh account approval after PDF access was denied.",
            statusError,
          );
        }
      }
      if (status) {
        status.classList.remove("is-loading");
        if (retryableServerError) {
          const correlationId = String(error?.correlationId || "").trim();
          const message = temporaryAccessLogContention
            ? "The server is busy completing another request. Your sign-in is still active. Please retry the preview shortly."
            : reviewerSessionValidationFailed
              ? "Could not confirm your sign-in just now. Your session is still active. Please retry the preview shortly."
              : `The server could not prepare this PDF. Your sign-in is still active. Try again in a moment.${
                  correlationId ? ` Reference: ${correlationId}.` : ""
                }`;
          status.replaceChildren(document.createTextNode(`${message} `));
          const retryButton = document.createElement("button");
          retryButton.type = "button";
          retryButton.textContent = "Retry PDF preview";
          retryButton.addEventListener(
            "click",
            () => void previewResourceFile(fileId, fileName, requestOptions),
          );
          status.appendChild(retryButton);
          if (reviewerPdfViewerOpened)
            showReviewerPdfBlobViewerError(message, true);
        } else {
          status.textContent = `Unable to load file preview: ${String(
            error?.message || error,
          )}`;
        }
        status.hidden = false;
        if (preparedReviewerPdf) {
          const message = document.createTextNode(
            " The PDF is ready to download: ",
          );
          const link = document.createElement("button");
          link.type = "button";
          link.className = "resource-portal-preview-download-link";
          link.textContent = "Download PDF";
          link.addEventListener("click", downloadReviewerPdf);
          status.append(message, link);
        }
      }
      (globalScope.DebugUtils || console).error(
        "Unable to preview resource file.",
        error,
      );
      return false;
    } finally {
      if (reviewerPdfPreviewInFlight === reviewerRequest)
        reviewerPdfPreviewInFlight = null;
      if (reviewerPdfPreviewAbortController === previewAbortController)
        reviewerPdfPreviewAbortController = null;
    }
  }

  function closeResourcePreview(reason = "user-request") {
    return resourcePreviewController.close(reason);
  }

  function closeReviewerPdfPreview(reason = "reviewer-state-changed") {
    if (resourcePortalPreviewIsReviewer) closeResourcePreview(reason);
  }

  async function loadResourcePortalFolder(
    folderId,
    { openExternal = false } = {},
  ) {
    return resourcePortalBrowser.loadFolder(
      folderId || resourcePortalCurrentFolderId,
      { openExternal },
    );
  }

  function preloadResourcePortalDocuments() {
    if (resourcePortalHasLoadedDocuments) return Promise.resolve(true);
    const folderId =
      document.getElementById("resource-dashboard-library-link")?.dataset
        .folderId || "";
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(folderId)) {
      const error = new Error("The configured Documents folder ID is invalid.");
      const status = document.getElementById("resource-documents-status");
      if (status) {
        status.textContent = "Documents are unavailable.";
        status.hidden = false;
      }
      (globalScope.DebugUtils || console).error(
        "Unable to preload the Documents section.",
        error,
      );
      return Promise.resolve(false);
    }
    return loadResourcePortalFolder(folderId, { openExternal: true });
  }

  const compatibilityExports = {
    applyAppTheme,
    applyNavigationPosition,
    applySummaryData,
    applyTitleMode,
    buildAccessMetadataMap,
    calculateBackoffDelay,
    changeDatabaseUpdateMode,
    changeDeckNameMode,
    changeDeckSort,
    changeDeckSource,
    changeNavigationPosition,
    changeQuestionTypeMode,
    changeQuizFilter,
    changeStudyIndex,
    changeStudyLayout,
    changeStudyPage,
    changeStudyPageSize,
    checkSavedSession,
    checkSyncStatusLightweight,
    cleanupAppResources,
    clearAppData,
    clearDatabase,
    clearLocalDownloadDeleted,
    clearSessionProgress,
    closeAllDropdownMenus,
    computeSrsInterval,
    createDebugSnapshot,
    cycleNavigationModeButton,
    cycleScrollNavigationPosition,
    deleteSubjectData,
    emitDebugState,
    endSession,
    ensureAppReady,
    ensureUnlockedFolderState,
    enterFolder,
    fetchAccessMetadata,
    fetchAndStartCategory,
    fetchDeckQuestions,
    fetchDeckQuestionsFromNetwork,
    forcePageRefresh,
    formatCacheAge,
    formatQuestionText,
    getAccessMetadataSignature,
    getAnalyticsCore,
    getCategoryProgressRenderSignature,
    invalidateCategoryProgressRenderSignature,
    getCollectionSignature,
    getCurrentReviewSubject,
    getDeckDataFreshnessBannerHtml,
    getDeckDataFreshnessState,
    getDeckDataReadinessState,
    getDeckFetchKey,
    getDeckLoaderId,
    getDeckNavigationOverride,
    getDefaultSrsEntry,
    getLastResourceDashboardSection,
    getNavigationContextSubject,
    getPathSegments,
    getQuestionTypeMode,
    getQuizNavigationPosition,
    getRecentPathDepth,
    getRecentPathRelationDepth,
    getScrollNavigationButtonLabel,
    getShortSubjectLabel,
    getStudyNavigationPosition,
    getSubjectListSignature,
    getSubjectProgressStats,
    getSummarySignature,
    getSummarySyncDecision,
    getSyncStatusVisualState,
    getVisibleCategorySummary,
    goToPath,
    handleCacheInvalidation,
    handleDeckClick,
    hasRequiredAppRuntime,
    hideConnectionStatusAfterDelay,
    initDetailsExclusivity,
    initializeApp,
    isDeckHidden,
    isDeckLocked,
    isDeckPasswordProtected,
    isFolderUnlocked,
    isRecentlyViewedPath,
    jumpToStudyPage,
    loadState,
    openResourceDashboardTab,
    loadResourceDashboard,
    markLocalDownloadDeleted,
    nextQuestion,
    normalizeAccessFlag,
    normalizeQuestionRecord,
    normalizeSummaryData,
    openModeSelect,
    optimizedBackgroundSync,
    persistDeckCacheTimestamp,
    persistSyncStatusTimestamp,
    populateFilters,
    prevQuestion,
    proceedToQuiz,
    proceedToReview,
    readStoredDeckCacheTimestamp,
    readStoredSyncStatusTimestamp,
    reloadAppStateInMemory,
    renderCategoryProgress,
    renderCategoryProgressNow,
    refreshPendingDeckPayloads,
    dismissDeckNotFound,
    renderCharts,
    resetCategory,
    resetProgress,
    resolveSubjectAccess,
    resumeSession,
    revealAnswer,
    revealClozeAnswer,
    reviewDeck,
    runWithActionLock,
    runWithBusyButton,
    safeIdbClearQuestionDatabase,
    safeIdbDel,
    safeIdbDeleteDeck,
    safeIdbSaveDeck,
    sanitizeDeletedDeckReferences,
    saveSessionProgress,
    saveState,
    setResourceDashboardPortalMode,
    switchPracticeToReview,
    switchReviewToPractice,
    toggleSessionHeader,
    cancelDeckPasswordRequest,
    scheduleDeferredInitialization,
    scheduleNextPolling,
    scheduleSinglePollLoop,
    scheduleStartupSync,
    scheduleSyncPoll,
    scheduleSyncRetry,
    setDeckNavigationOverride,
    setDeckSortDirection,
    setFolderUnlocked,
    setFormError,
    setGlobalLoadingState,
    setInlineError,
    setStudyNavigationPosition,
    setTitleMode,
    setupCacheInvalidationListener,
    setupLeaderElection,
    setupVisibilityChangeHandler,
    showColdStartNotification,
    showExplanation,
    showMCQOptions,
    showToast,
    showToastNotification,
    shuffleArray,
    startCacheVersionChecking,
    startCustomSession,
    startVisualTimer,
    stopVisualTimer,
    stripAccessMetadataFromSummary,
    submitPracticeAnswer,
    syncDatabase,
    syncPreferenceControls,
    toggleActiveRecall,
    toggleAppMode,
    toggleArchiveDeck,
    toggleArchivedDeckVisibility,
    toggleCurrentQuestionFavorite,
    toggleDeckSortDirection,
    toggleFavoriteDeck,
    togglePinDeck,
    toggleMainNavigationPosition,
    toggleNavigationPosition,
    togglePasswordVisibility,
    toggleQuestionFavorite,
    toggleShuffleChoices,
    toggleShuffleQuestions,
    toggleShowABCD,
    toggleShowExplanations,
    toggleSpecificChoices,
    toggleStudyFullscreen,
    toggleTheme,
    toggleTitleMode,
    trackStats,
    triggerSilentSummaryRefresh,
    updateRecentDecks,
    updateSrsForQuestion,
    updateSyncStatus,
    updateThemeButton,
    updateTitleModeButton,
  };

  Object.assign(globalScope, compatibilityExports);
  Object.defineProperties(globalScope, {
    currentAppMode: {
      configurable: true,
      get: () => currentAppMode,
      set: (value) => {
        currentAppMode = value;
      },
    },
    pendingSummaryData: {
      configurable: true,
      get: () => pendingSummaryData,
      set: (value) => {
        pendingSummaryData = value;
      },
    },
    pendingDeckSubject: {
      configurable: true,
      get: () => pendingDeckSubject,
      set: (value) => {
        pendingDeckSubject = value;
      },
    },
    pendingDeckAction: {
      configurable: true,
      get: () => pendingDeckAction,
      set: (value) => {
        pendingDeckAction = value;
      },
    },
  });

  const AppCore = Object.freeze({ ...compatibilityExports });
  globalThis.AppCore = AppCore;
  globalScope.AppCore = AppCore;
  globalScope.initializeApp = initializeApp;
})(typeof window !== "undefined" ? window : globalThis);
