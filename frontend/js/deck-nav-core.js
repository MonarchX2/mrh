// ============================================================================
// Deck Navigation Core - Category browsing, folder navigation, and deck lifecycle
// Extracted from frontend/js/app-core.js - Phase 5
// ============================================================================

(function (globalScope) {
  const lifecycle = globalScope.LifecycleUtils || globalScope;
  const logger =
    globalScope.DebugUtils?.createDebugLogger?.("mrh-navigation") || console;
  const {
    state,
    saveState,
    saveSessionProgress,
    getQuestionsForSubject,
    decodeHandlerValue,
    renderQuestion,
    isDeckHidden,
    isDeckLocked,
    fetchDeckQuestions,
    openDeckPasswordModal,
  } = globalScope;

  if (typeof document !== "undefined") {
    const existingStyle = document.getElementById(
      "mrh-reset-deck-bounce-style",
    );
    if (!existingStyle) {
      const style = document.createElement("style");
      style.id = "mrh-reset-deck-bounce-style";
      style.textContent = `
        @keyframes mrhResetDeckBounce {
          0%, 100% { transform: translateY(0) scale(1); filter: saturate(1); }
          30% { transform: translateY(-2px) scale(1.04); filter: saturate(1.1); }
          55% { transform: translateY(1px) scale(0.99); filter: saturate(1.05); }
          75% { transform: translateY(-1px) scale(1.02); filter: saturate(1.08); }
        }
        .reset-deck-btn.mrh-reset-bouncing {
          animation: mrhResetDeckBounce 1.8s ease-in-out 2;
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ===================== VIEW NAVIGATION =====================
  let navigationPromise = null;
  let navigationTarget = "";
  let navigationStarted = false;

  async function confirmNavigationAwayFromSession() {
    const message =
      "You have an active session. Do you want to pause and return? Your progress will be saved.";
    const title = "Pause Session";

    if (typeof globalScope.requestConfirmation === "function") {
      return Boolean(await globalScope.requestConfirmation(message, title));
    }
    return typeof globalScope.confirm === "function"
      ? Boolean(globalScope.confirm(message))
      : false;
  }

  async function confirmNavigationAwayFromResourceDashboard(portalMode) {
    const portalName =
      portalMode === "academic" ? "BSMT Library" : "Learning Materials";
    const message = `Are you sure you want to exit the ${portalName}?`;
    const title = `Exit ${portalName}`;
    if (typeof globalScope.requestConfirmation === "function") {
      return Boolean(await globalScope.requestConfirmation(message, title));
    }
    return typeof globalScope.confirm === "function"
      ? Boolean(globalScope.confirm(message))
      : false;
  }

  function getAcademicDashboardTab() {
    return (
      globalScope.getLastResourceDashboardSection?.("academic") || "SUBJECTS"
    );
  }

  function navigate(viewId) {
    if (navigationPromise) {
      if (!navigationStarted) navigationTarget = viewId;
      return navigationPromise;
    }
    navigationTarget = viewId;
    let navigation;
    navigation = Promise.resolve()
      .then(() => {
        navigationStarted = true;
        return performNavigation(navigationTarget);
      })
      .finally(() => {
        if (navigationPromise !== navigation) return;
        navigationPromise = null;
        navigationTarget = "";
        navigationStarted = false;
      });
    navigationPromise = navigation;
    return navigation;
  }

  async function performNavigation(navigationId) {
    const portalMode =
      navigationId === "library"
        ? "academic"
        : navigationId === "resources"
          ? "student"
          : navigationId === "profile"
            ? "profile"
            : null;
    const viewId = ["library", "profile"].includes(navigationId)
      ? "resources"
      : navigationId;
    const viewElement = document.getElementById(`view-${viewId}`);
    if (!viewElement) return false;
    const currentView = document.querySelector(".view-section.active");
    const resourceLayout = document.querySelector(".resource-dashboard-layout");
    const currentPortalMode = resourceLayout?.dataset.portalMode || "student";
    const isLeavingResourcePortal =
      currentView?.id === "view-resources" &&
      currentPortalMode !== "profile" &&
      portalMode !== "profile" &&
      (!portalMode || portalMode !== currentPortalMode);

    if (
      isLeavingResourcePortal &&
      !(await confirmNavigationAwayFromResourceDashboard(currentPortalMode))
    ) {
      return false;
    }

    const leavingActiveSession =
      state.session.active &&
      ["view-practice", "view-deck-review"].includes(currentView?.id) &&
      !["practice", "deck-review"].includes(viewId);
    if (leavingActiveSession && !(await confirmNavigationAwayFromSession()))
      return false;

    const featureByView = {
      practice: "practice",
      "deck-review": "deck-review",
      stats: "analytics",
    };
    const featureName = featureByView[viewId];
    if (featureName) {
      if (typeof globalScope.ensureAppFeature !== "function") {
        logger.error("App feature loader is unavailable.", { featureName });
        return false;
      }
      if (!(await globalScope.ensureAppFeature(featureName))) return false;
    }

    const portalModeChanged =
      portalMode !== null && portalMode !== currentPortalMode;
    if (
      portalMode !== null &&
      typeof globalScope.setResourceDashboardPortalMode === "function" &&
      !globalScope.setResourceDashboardPortalMode(portalMode)
    ) {
      return false;
    }
    if (
      portalMode !== null &&
      typeof globalScope.setResourceDashboardPortalMode !== "function"
    ) {
      logger.error("Resource Dashboard portal mode handler is unavailable.");
      return false;
    }
    if (viewElement.classList.contains("active")) {
      if (viewId !== "deck-review") {
        globalScope.updateNavigationUrl?.([navigationId]);
      }
      if (portalMode !== null) {
        const activePortalTab =
          portalMode === "academic"
            ? getAcademicDashboardTab()
            : portalMode === "profile"
              ? "PROFILE"
              : "DEFAULT";
        globalScope.openResourceDashboardTab?.(activePortalTab);
        Promise.resolve(globalScope.loadResourceDashboard?.()).catch(
          (error) => {
            logger.error("Unable to load the Resource Dashboard.", error);
          },
        );
      }
      return true;
    }

    if (leavingActiveSession) {
      saveSessionProgress();
      state.session.active = false;
      if (viewId === "settings") state.currentPath = [];
      await saveState();
    }

    const leavingDeckReview =
      currentView?.id === "view-deck-review" && viewId !== "deck-review";
    const leavingSessionView =
      (currentView?.id === "view-practice" ||
        currentView?.id === "view-deck-review") &&
      viewId !== "practice" &&
      viewId !== "deck-review";
    const returningToDashboard =
      viewId === "dashboard" && currentView?.id !== "view-dashboard";
    if (returningToDashboard) {
      globalScope.updateDashboard();
      globalScope.renderCategoryProgressNow?.({ allowInactive: true });
    }

    if (currentView) {
      currentView.setAttribute("inert", "");
      currentView.classList.remove("active");
    }

    viewElement.removeAttribute("inert");
    viewElement.classList.add("active");
    globalScope.syncPreferenceControls?.();
    if (
      leavingDeckReview &&
      typeof globalScope.refreshPendingDeckPayloads === "function"
    ) {
      Promise.resolve(globalScope.refreshPendingDeckPayloads()).catch(
        (error) => {
          logger.error(
            "Unable to apply pending backend payload updates after study.",
            error,
          );
        },
      );
    }
    if (viewId === "settings" || viewId === "resources") {
      globalScope.updateNavigationUrl?.([navigationId]);
    } else if (viewId === "deck-review") {
      // Don't update URL here - let updateSessionNavigationUrl handle it after the subject is known
    } else if (leavingSessionView) {
      globalScope.updateNavigationUrl?.(state.currentPath || [], {
        replace: true,
      });
    } else if (["view-settings", "view-resources"].includes(currentView?.id)) {
      globalScope.updateNavigationUrl?.(state.currentPath || []);
    }
    if (!returningToDashboard) globalScope.updateDashboard();
    if (viewId === "stats") globalScope.renderCharts();
    if (viewId === "resources") {
      if (currentView?.id !== "view-resources" || portalModeChanged) {
        globalScope.openResourceDashboardTab?.(
          portalMode === "academic"
            ? getAcademicDashboardTab()
            : portalMode === "profile"
              ? "PROFILE"
              : "DEFAULT",
        );
      }
      Promise.resolve(globalScope.loadResourceDashboard?.()).catch((error) => {
        logger.error("Unable to load the Resource Dashboard.", error);
      });
    }
    return true;
  }

  // ===================== CATEGORY VISIBILITY & FILTERING =====================
  function getVisibleCategorySummary() {
    return (state.categorySummary || []).filter((deck) => {
      if (!deck || !deck.Subject) return false;
      const subject = String(deck.Subject || "").trim();
      if (!subject) return false;
      const accessEntry = state.accessMetadata?.[subject] || {};
      const hidden =
        accessEntry.Hidden === true ||
        deck.Hidden === true ||
        String(deck.Hidden || "").toLowerCase() === "true" ||
        String(accessEntry.Hidden || "").toLowerCase() === "true";
      if (hidden) return false;
      return true;
    });
  }

  // ===================== FOLDER NAVIGATION =====================
  function enterFolder(folderName, isLockedFolder, expectedParentPath = null) {
    return globalScope.DeckNavigationControllerCore.enterFolder(
      folderName,
      isLockedFolder,
      expectedParentPath,
    );
  }

  function goToPath(index) {
    return globalScope.DeckNavigationControllerCore.goToPath(index);
  }

  function triggerDeckResetBounce(subject) {
    const normalized = String(subject || "").trim();
    if (!normalized) return;

    const buttons = Array.from(
      document.querySelectorAll(".reset-deck-btn[data-reset-subject]"),
    );
    const button =
      buttons.find((el) => {
        const value = String(el.dataset.resetSubject || "").trim();
        return value === normalized || value === decodeURIComponent(normalized);
      }) || document.querySelector(".reset-deck-btn");

    if (!button) return;

    button.classList.remove("mrh-reset-bouncing");
    void button.offsetWidth;
    button.classList.add("mrh-reset-bouncing");
    clearTimeout(button.__mrhResetBounceTimer);
    button.__mrhResetBounceTimer = lifecycle.setTimeout(() => {
      button.classList.remove("mrh-reset-bouncing");
    }, 1600);
  }

  // ===================== DECK LIFECYCLE & SESSION MANAGEMENT =====================
  async function fetchAndStartCategory(subject, mode, pass = null) {
    const loader = document.getElementById(
      globalScope.getDeckLoaderId(subject),
    );
    if (
      typeof globalScope.isDeckHidden === "function" &&
      globalScope.isDeckHidden(subject)
    ) {
      globalScope.showToast(
        "This deck is hidden and not available.",
        "warning",
      );
      return;
    }
    if (
      typeof globalScope.isDeckLocked === "function" &&
      globalScope.isDeckLocked(subject)
    ) {
      if (!pass) {
        globalScope.pendingDeckSubject = subject;
        globalScope.pendingDeckAction = mode;
        openDeckPasswordModal(subject, mode);
        return;
      }
    }

    // Define strict MCQ filter condition conditionally based on user preference
    const qTypeOverride =
      globalScope.getDeckSessionSetting?.("quiz", "qTypeOverride", subject) ||
      state.prefs.qTypeOverride;
    const isForcedMCQ = qTypeOverride === "mcq";
    const customFilter = isForcedMCQ
      ? (q) =>
          q.ChoiceA &&
          q.ChoiceA.trim() !== "" &&
          q.ChoiceB &&
          q.ChoiceB.trim() !== ""
      : null;

    if (!state.stats.completedQs) state.stats.completedQs = [];
    const completedSet = new Set(state.stats.completedQs);
    if (mode === "continue") {
      const summaryEntry = (state.categorySummary || []).find(
        (category) => category?.Subject === subject,
      );
      const summaryQuestionCount = Number(summaryEntry?.QuestionCount || 0);
      const localSubjectQuestions = (state.db || []).filter(
        (question) => question?.Subject === subject,
      );
      const availableLocalQuestions = customFilter
        ? localSubjectQuestions.filter(customFilter)
        : localSubjectQuestions;
      const isKnownComplete =
        summaryQuestionCount > 0 &&
        localSubjectQuestions.length >= summaryQuestionCount &&
        availableLocalQuestions.length > 0 &&
        availableLocalQuestions.every((question) =>
          completedSet.has(question.ID),
        );

      if (isKnownComplete) {
        triggerDeckResetBounce(subject);
        globalScope.showToast?.(
          "You have answered all available questions. Reset to start over.",
          "info",
        );
        return;
      }
    }

    // Always attempt to fetch fresh data for gameplay sessions
    if (typeof globalScope.fetchDeckQuestions !== "function") {
      throw new Error("fetchDeckQuestions is not available.");
    }
    let validQuestions = await globalScope.fetchDeckQuestions(
      subject,
      pass,
      loader,
      customFilter,
    );
    if (!Array.isArray(validQuestions)) validQuestions = [];

    // Fallback check if fetch returned empty; keep the user in-app and let them retry.
    if (validQuestions.length === 0) {
      if (
        typeof globalScope.isDeckLocked === "function" &&
        globalScope.isDeckLocked(subject)
      ) {
        globalScope.pendingDeckSubject = subject;
        globalScope.pendingDeckAction = mode;
        openDeckPasswordModal(subject, mode);
        return;
      }
      globalScope.showToast?.(
        `Could not refresh "${subject}". Please try again in a moment.`,
        "warning",
      );
      return;
    }

    if (!state.stats.srsMap) state.stats.srsMap = {};

    // Set membership turns repeated O(n) includes() checks into O(1) lookups
    // for large question banks.
    const mistakesSet = new Set(state.stats.mistakes || []);

    let pool = [];
    if (mode === "continue") {
      pool = validQuestions.filter((q) => !completedSet.has(q.ID));

      const srsEnabled =
        globalScope.getDeckSessionSetting?.("quiz", "srsEnabled", subject) ??
        state.prefs.srsEnabled;
      if (srsEnabled === true) {
        const now = Date.now();
        const duePool = pool.filter((q) => {
          const srs = state.stats.srsMap?.[q.ID];
          if (!srs) return true;
          return Number(srs.due || 0) <= now;
        });

        if (duePool.length > 0) {
          pool = duePool;
        } else {
          if (pool.length > 0) {
            // Keep the existing pool; no copy is needed.
          }
        }
      }

      if (pool.length === 0) {
        if (srsEnabled === true) {
          const queue = validQuestions.filter((q) => !completedSet.has(q.ID));
          if (queue.length > 0) {
            pool = queue;
          } else {
            triggerDeckResetBounce(subject);
            globalScope.showToast?.(
              "You have answered all available questions. Reset to start over.",
              "info",
            );
            return;
          }
        } else {
          triggerDeckResetBounce(subject);
          globalScope.showToast?.(
            "You have answered all available questions. Reset to start over.",
            "info",
          );
          return;
        }
      }
    } else if (mode === "mistakes") {
      pool = validQuestions.filter((q) => mistakesSet.has(q.ID));
      if (pool.length === 0) {
        globalScope.showToast?.(
          `No mistakes to review for ${subject}. Great job.`,
          "success",
        );
        return;
      }
    }

    return startCustomSession(pool).catch((error) => {
      DebugUtils.error("Unable to start deck session:", error);
      globalScope.showToast?.(
        "We're having a temporary issue with our servers or services, so this session couldn't start. Please check your internet connection and try again later.",
        "error",
        8000,
      );
      return false;
    });
  }

  async function startCustomSession(pool) {
    if (!Array.isArray(pool) || pool.length === 0) return false;
    let navigated;
    if (
      typeof globalScope.navigate === "function" &&
      globalScope.navigate !== navigate
    ) {
      navigated = await globalScope.navigate("practice");
    } else {
      navigated = await navigate("practice");
    }
    if (!navigated) return false;
    if (typeof globalScope.prepareSessionPool !== "function")
      throw new Error("prepareSessionPool is not available.");
    document.getElementById("session-setup")?.classList.add("hidden");
    document.getElementById("session-active")?.classList.remove("hidden");

    pool = globalScope.prepareSessionPool(pool, pool[0]?.Subject || "");
    if (!Array.isArray(pool) || pool.length === 0) return false;

    state.session = {
      active: true,
      questions: pool,
      currentIndex: 0,
      userAnswers: {},
      mode: "quiz",
      revealedCloze: false,
    };
    globalScope.updateSessionNavigationUrl?.(pool[0]?.Subject, "quiz");

    if (typeof globalScope.renderQuestion === "function")
      globalScope.renderQuestion();
    if (typeof globalScope.saveSessionProgress === "function")
      globalScope.saveSessionProgress();
    return true;
  }

  async function resetCategory(subject) {
    subject = decodeHandlerValue(subject);
    const deckName = String(subject || "")
      .split("::")
      .pop()
      .trim();
    if (
      await requestConfirmation(
        {
          before:
            "Are you sure you want to reset your accuracy and progress statistics for ",
          emphasis: deckName,
          blurEmphasis: isDeckLocked(subject),
          after: "? This cannot be undone.",
        },
        "Reset Progress",
      )
    ) {
      if (state.stats.subjectAccuracy[subject]) {
        state.stats.subjectAccuracy[subject] = { total: 0, correct: 0 };
      }

      const subjectQIDs = getQuestionsForSubject(subject).map((q) => q.ID);
      const subjectIdSet = new Set(subjectQIDs);

      if (state.stats.completedQs) {
        state.stats.completedQs = state.stats.completedQs.filter(
          (id) => !subjectIdSet.has(id),
        );
      }

      if (state.stats.mistakes) {
        state.stats.mistakes = state.stats.mistakes.filter(
          (id) => !subjectIdSet.has(id),
        );
      }

      if (state.stats.srsMap) {
        for (const id of subjectQIDs) {
          delete state.stats.srsMap[id];
        }
      }

      if (state.prefs.studyProgress) {
        delete state.prefs.studyProgress[subject];
      }

      saveState();
      globalScope.invalidateCategoryProgressRenderSignature?.();
      globalScope.renderCategoryProgress();
    }
  }

  // ===================== MODULE EXPORT =====================
  const DeckNavCore = {
    navigate,
    getVisibleCategorySummary,
    enterFolder,
    goToPath,
    fetchAndStartCategory,
    startCustomSession,
    resetCategory,
  };

  // Export to global scope
  globalScope.DeckNavCore = DeckNavCore;

  // Export individual functions for backward compatibility
  globalScope.navigate = navigate;
  globalScope.getVisibleCategorySummary = getVisibleCategorySummary;
  globalScope.enterFolder = enterFolder;
  globalScope.goToPath = goToPath;
  globalScope.fetchAndStartCategory = fetchAndStartCategory;
  globalScope.startCustomSession = startCustomSession;
  globalScope.resetCategory = resetCategory;
  globalScope.triggerDeckResetBounce = triggerDeckResetBounce;

  // For Node.js testing - export as CommonJS if in test environment
  if (typeof module !== "undefined" && module.exports) {
    module.exports = DeckNavCore;
  }
})(
  typeof globalScope !== "undefined"
    ? globalScope
    : typeof globalThis !== "undefined"
      ? globalThis
      : this,
);
