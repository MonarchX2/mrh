(function (globalScope) {
  function create(dependencies) {
    const {
      state,
      document,
      waitForLocalDatabaseReady,
      showToast,
      isDeckHidden,
      isDeckLocked,
      pendingDeckPayloadRefreshes,
      getDeckLoaderId,
      setPendingDeckRequest,
      openDeckPasswordModal,
      fetchDeckQuestions,
      navigate,
      saveState,
      renderDeckReview,
      updateSessionNavigationUrl,
      getSessionCore,
      hasSessionRestoreProgress,
      requestConfirmation,
      getDeckReviewCore,
      startCustomSession,
      markQuizActivity,
      getCurrentReviewSubject,
      getCurrentReviewQuestions,
      getStoredItem,
      resumeSession,
      getCurrentAppMode,
      setCurrentAppMode,
      syncPreferenceControls,
      logger,
    } = dependencies;
    let pendingPracticeReviewSwitch = null;

    async function reviewDeck(
      subject,
      pass = null,
      preferCachedQuestions = false,
      authorizedSessionQuestions = null,
    ) {
      const loader = document.getElementById(getDeckLoaderId(subject));
      const cachedSessionQuestions = Array.isArray(authorizedSessionQuestions)
        ? authorizedSessionQuestions.filter(
            (question) => String(question?.Subject || "").trim() === subject,
          )
        : [];
      const hasAuthorizedSessionQuestions = cachedSessionQuestions.length > 0;

      if (
        !hasAuthorizedSessionQuestions &&
        !(await waitForLocalDatabaseReady())
      ) {
        showToast(
          "Review actions are unavailable until your saved question data is ready.",
          "warning",
        );
        return false;
      }
      if (isDeckHidden(subject)) {
        showToast("This deck is hidden and not available.", "warning");
        return false;
      }
      if (isDeckLocked(subject) && !pass && !hasAuthorizedSessionQuestions) {
        setPendingDeckRequest(subject, "resume-review");
        openDeckPasswordModal(subject, "resume-review");
        return false;
      }

      let validQuestions = [];
      if (
        preferCachedQuestions &&
        !pendingDeckPayloadRefreshes.has(String(subject || "").trim())
      ) {
        const cachedQuestions = (state.db || []).filter(
          (question) => String(question?.Subject || "").trim() === subject,
        );
        const summaryEntry = (state.categorySummary || []).find(
          (category) => category?.Subject === subject,
        );
        const expectedQuestionCount = Number(summaryEntry?.QuestionCount || 0);
        if (
          cachedQuestions.length > 0 &&
          (!expectedQuestionCount ||
            cachedQuestions.length >= expectedQuestionCount)
        ) {
          validQuestions = cachedQuestions;
        }
      }
      if (validQuestions.length === 0 && hasAuthorizedSessionQuestions) {
        validQuestions = cachedSessionQuestions;
      }
      if (validQuestions.length === 0 && !hasAuthorizedSessionQuestions) {
        validQuestions = await fetchDeckQuestions(subject, pass, loader);
      }
      if (validQuestions.length === 0) {
        if (isDeckLocked(subject) && !hasAuthorizedSessionQuestions) {
          setPendingDeckRequest(subject, "resume-review");
          openDeckPasswordModal(subject, "resume-review");
          if (loader) loader.classList.add("hidden");
          return false;
        }
        showToast(
          `Could not refresh "${subject}". Please try again in a moment.`,
          "warning",
          5000,
        );
        if (loader) loader.classList.add("hidden");
        return false;
      }

      if (!(await navigate("deck-review"))) return false;
      if (loader) loader.classList.add("hidden");
      state.prefs.lastActivity = {
        mode: "review",
        subject,
        updatedAt: new Date().toISOString(),
      };
      saveState();
      renderDeckReview(subject, validQuestions);
      updateSessionNavigationUrl?.(subject, "study");
      return true;
    }

    function restorePracticeAfterReviewFailure(showWarning = true) {
      if (!pendingPracticeReviewSwitch) return false;
      const suspension = pendingPracticeReviewSwitch;
      pendingPracticeReviewSwitch = null;
      const resumed = getSessionCore().resumeSuspendedSession(suspension);
      if (resumed) {
        const question =
          suspension.session.questions[suspension.session.currentIndex];
        state.prefs.lastActivity = {
          mode: "quiz",
          subject: question?.Subject || null,
          updatedAt: new Date().toISOString(),
        };
        saveState();
        if (showWarning) {
          showToast(
            "Review could not be opened. Your quiz has been resumed.",
            "warning",
          );
        }
      }
      return resumed;
    }

    async function switchPracticeToReview() {
      const session = state.session;
      if (!session?.active || !Array.isArray(session.questions)) return false;

      const subject = session.questions[session.currentIndex]?.Subject || "";
      if (!subject) {
        showToast("Unable to determine the current quiz deck.", "error");
        return false;
      }
      const sessionCore = getSessionCore();
      const suspension = sessionCore.suspendSessionForModeSwitch();
      if (!suspension) {
        showToast(
          "Your quiz progress could not be saved, so Review was not opened.",
          "error",
        );
        return false;
      }

      pendingPracticeReviewSwitch = suspension;
      const hasStudyProgress = hasSessionRestoreProgress({
        mode: "study",
        subject,
      });
      const confirmed = await requestConfirmation(
        `${hasStudyProgress ? "Continue" : "Start"} a Study session for this deck?`,
        "Switch to Study Mode",
      );
      if (!confirmed) {
        restorePracticeAfterReviewFailure(false);
        return false;
      }

      let opened;
      try {
        opened = await reviewDeck(subject, null, true, suspension.session.questions);
      } catch (error) {
        logger.error("Unable to switch from quiz to review.", error);
        restorePracticeAfterReviewFailure();
        return false;
      }
      if (opened) {
        pendingPracticeReviewSwitch = null;
        setCurrentAppMode("review");
        syncPreferenceControls();
        return true;
      }

      const passwordModal = document.getElementById("deck-password-modal");
      if (passwordModal?.getAttribute("aria-hidden") !== "false") {
        restorePracticeAfterReviewFailure();
      }
      return false;
    }

    async function continuePracticeReviewSwitch(subject, password) {
      let opened;
      try {
        opened = await reviewDeck(subject, password);
      } catch (error) {
        logger.error("Unable to switch from quiz to review.", error);
        restorePracticeAfterReviewFailure();
        return false;
      }
      if (opened) {
        pendingPracticeReviewSwitch = null;
        setCurrentAppMode("review");
        syncPreferenceControls();
        return true;
      }

      const passwordModal = document.getElementById("deck-password-modal");
      if (passwordModal?.getAttribute("aria-hidden") !== "false") {
        restorePracticeAfterReviewFailure();
      }
      return false;
    }

    async function startReviewDeckQuiz(subject) {
      const deckReviewCore = getDeckReviewCore();
      const cachedQuestions =
        deckReviewCore?.getCurrentReviewSubject?.() === subject
          ? deckReviewCore.getCurrentReviewQuestions()
          : [];
      const questions = Array.isArray(cachedQuestions)
        ? cachedQuestions.filter(
            (question) => String(question?.Subject || "").trim() === subject,
          )
        : [];
      const customFilter =
        globalScope.getDeckSessionSetting?.(
          "quiz",
          "qTypeOverride",
          subject,
        ) === "mcq"
          ? (question) =>
              typeof question.ChoiceA === "string" &&
              question.ChoiceA.trim() !== "" &&
              typeof question.ChoiceB === "string" &&
              question.ChoiceB.trim() !== ""
          : null;
      const eligibleQuestions = customFilter
        ? questions.filter(customFilter)
        : questions;
      const completed = new Set(state.stats.completedQs || []);
      let pool = eligibleQuestions.filter(
        (question) => !completed.has(question.ID),
      );
      if (pool.length === 0) {
        showToast(
          `No unanswered questions are available in "${subject}". Reset progress to start over.`,
          "info",
        );
        return false;
      }
      if (
        globalScope.getDeckSessionSetting?.(
          "quiz",
          "srsEnabled",
          subject,
        ) ?? state.prefs.srsEnabled
      ) {
        const now = Date.now();
        const duePool = pool.filter((question) => {
          const srs = state.stats.srsMap?.[question.ID];
          return !srs || Number(srs.due || 0) <= now;
        });
        if (duePool.length > 0) pool = duePool;
      }

      let started;
      try {
        started = await startCustomSession(pool);
      } catch (error) {
        logger.error("Unable to start a quiz from Review Mode.", error);
        showToast(
          "We're having a temporary issue with our servers or services, so this quiz couldn't start. Please check your internet connection and try again later.",
          "error",
          8000,
        );
        return false;
      }
      if (!started) return false;
      await markQuizActivity(subject);
      return true;
    }

    async function switchReviewToPractice() {
      const subject = getCurrentReviewSubject();
      if (!subject) {
        showToast("Unable to determine the current study deck.", "error");
        return false;
      }
      if (state.session?.active) {
        showToast(
          "A quiz session is already active. Finish or pause it before starting another quiz.",
          "warning",
        );
        return false;
      }

      const savedSessionData = getStoredItem("saved_session");
      let savedSession = null;
      if (savedSessionData) {
        try {
          savedSession =
            typeof savedSessionData === "string"
              ? JSON.parse(savedSessionData)
              : savedSessionData;
        } catch (error) {
          logger.error("Unable to read the saved quiz session.", error);
          showToast(
            "Your saved quiz progress could not be read. Return to the Main Menu to recover it before starting another quiz.",
            "error",
            8000,
          );
          return false;
        }
      }

      const savedSubject = String(
        savedSession?.questions?.[savedSession.currentIndex]?.Subject || "",
      ).trim();
      const hasSavedQuiz =
        savedSession?.active === true &&
        Array.isArray(savedSession.questions) &&
        savedSession.questions.length > 0 &&
        Number.isInteger(savedSession.currentIndex) &&
        savedSession.currentIndex >= 0 &&
        savedSession.currentIndex < savedSession.questions.length;
      const hasQuizProgress =
        hasSavedQuiz &&
        savedSubject === subject &&
        hasSessionRestoreProgress({ mode: "quiz", subject });
      if (savedSessionData && !hasSavedQuiz) {
        showToast(
          "Your saved quiz progress could not be verified. Return to the Main Menu to recover it before starting another quiz.",
          "error",
          8000,
        );
        return false;
      }

      const persistReviewProgress = async () => {
        const progress = state.prefs.studyProgress?.[subject];
        const main = document.querySelector("main");
        if (progress && Number.isFinite(main?.scrollTop)) {
          progress.scrollY = main.scrollTop;
          progress.updatedAt = Date.now();
        }
        try {
          if ((await saveState("prefs")) !== false) return true;
          logger.error("Unable to save study progress before switching modes.");
        } catch (error) {
          logger.error(
            "Unable to save study progress before switching modes.",
            error,
          );
        }
        showToast(
          "Your study progress could not be saved. Please try again before switching modes.",
          "error",
        );
        return false;
      };

      if (hasSavedQuiz && savedSubject === subject) {
        const confirmed = await requestConfirmation(
          `${hasQuizProgress ? "Continue" : "Start"} a Quiz session for this deck?`,
          "Switch to Quiz Mode",
        );
        if (!confirmed || !(await persistReviewProgress())) return false;
        const deckReviewCore = getDeckReviewCore();
        const authorizedReviewQuestions =
          deckReviewCore?.getCurrentReviewSubject?.() === subject
            ? deckReviewCore.getCurrentReviewQuestions()
            : [];
        await resumeSession(null, {
          allowResume: true,
          authorizedReviewQuestions,
        });
        return Boolean(state.session?.active);
      }

      const confirmed = await requestConfirmation(
        "Start a Quiz session for this deck?",
        "Switch to Quiz Mode",
      );
      if (!confirmed || !(await persistReviewProgress())) return false;
      return startReviewDeckQuiz(subject);
    }

    function cancelPracticeReviewSwitch() {
      if (pendingPracticeReviewSwitch) {
        restorePracticeAfterReviewFailure(false);
      }
    }

    return {
      cancelPracticeReviewSwitch,
      continuePracticeReviewSwitch,
      reviewDeck,
      startReviewDeckQuiz,
      switchPracticeToReview,
      switchReviewToPractice,
    };
  }

  const ReviewControllerCore = { create };
  globalScope.ReviewControllerCore = ReviewControllerCore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = ReviewControllerCore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
