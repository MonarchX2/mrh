(function (globalScope) {
  function requireSessionMethod(method, description) {
    const sessionCore = globalScope.SessionCore;
    if (typeof sessionCore?.[method] !== "function") {
      throw new Error(`SessionCore is required before ${description}.`);
    }
    return sessionCore[method].bind(sessionCore);
  }

  function create(dependencies) {
    const {
      state,
      ensureAppFeature,
      isAppReady,
      waitForLocalDatabaseReady,
      showToast,
      syncPreferenceControls,
      isDeckHidden,
      isDeckLocked,
      setPendingDeckRequest,
      openDeckPasswordModal,
      fetchDeckQuestions,
      getStoredItem,
      prepareSessionPool,
      logger,
      navigate,
      document,
      renderQuestion,
      markQuizActivity,
      updateSessionNavigationUrl,
      requestConfirmation,
      getSessionNavigationFromUrl,
      updateNavigationUrl,
      reviewDeck,
      getCurrentPath,
      setCurrentAppMode,
    } = dependencies;
    let pendingResumeSession = null;

    function saveSessionProgress(immediate = false) {
      return requireSessionMethod(
        "saveSessionProgress",
        "saving session progress",
      )(immediate);
    }

    async function checkSavedSession() {
      if (typeof globalScope.SessionCore?.checkSavedSession !== "function") {
        if (typeof ensureAppFeature !== "function") {
          throw new Error("App feature loader is unavailable.");
        }
        if (!(await ensureAppFeature("practice"))) return false;
      }
      return requireSessionMethod(
        "checkSavedSession",
        "checking saved sessions",
      )();
    }

    function clearSessionProgress() {
      return requireSessionMethod(
        "clearSessionProgress",
        "clearing session progress",
      )();
    }

    function hasSessionRestoreProgress(sessionRoute) {
      const subject = String(sessionRoute?.subject || "").trim();
      if (!subject) return false;

      if (sessionRoute.mode === "study") {
        const progress = state.prefs?.studyProgress?.[subject];
        return (
          Number(progress?.index) > 0 ||
          Number(progress?.page) > 1 ||
          Number(progress?.scrollY) > 0
        );
      }
      if (sessionRoute.mode !== "quiz") return false;

      const storedSession = getStoredItem("saved_session");
      if (!storedSession) return false;

      let savedSession;
      try {
        savedSession =
          typeof storedSession === "string"
            ? JSON.parse(storedSession)
            : storedSession;
      } catch (error) {
        logger.error("Unable to check saved quiz progress for refresh.", error);
        return false;
      }

      const belongsToDeck =
        savedSession?.questions?.some(
          (question) => String(question?.Subject || "").trim() === subject,
        ) === true;
      if (
        savedSession?.active !== true ||
        !belongsToDeck ||
        !Array.isArray(savedSession.questions)
      ) {
        return false;
      }
      const hasRecordedAnswers = (answers) =>
        answers &&
        typeof answers === "object" &&
        Object.values(answers).some(
          (answer) => answer !== null && answer !== undefined && answer !== "",
        );

      return (
        Number(savedSession.currentIndex) > 0 ||
        hasRecordedAnswers(savedSession.userAnswers) ||
        hasRecordedAnswers(savedSession.identificationRatings)
      );
    }

    async function resumeSession(password = null, options = {}) {
      if (!options.allowResume) return false;
      if (
        typeof globalScope.SessionCore?.resumeSuspendedSession !== "function"
      ) {
        if (typeof ensureAppFeature !== "function") {
          throw new Error("App feature loader is unavailable.");
        }
        if (!(await ensureAppFeature("practice"))) return false;
      }
      if (!isAppReady()) throw new Error("App bootstrap not complete yet.");
      if (!(await waitForLocalDatabaseReady())) {
        showToast(
          "Your saved question data is not ready yet. Please try again shortly.",
          "warning",
        );
        return false;
      }

      const activity = state.prefs.lastActivity;
      const saved = getStoredItem("saved_session");
      if (!saved && activity?.mode === "review" && activity.subject) {
        setCurrentAppMode("review");
        syncPreferenceControls();
        if (
          (isDeckHidden(activity.subject) || isDeckLocked(activity.subject)) &&
          !password
        ) {
          setPendingDeckRequest(activity.subject, "resume-review");
          openDeckPasswordModal(activity.subject, "resume-review");
          return;
        }
        await reviewDeck(activity.subject, password);
        return;
      }
      if (!saved) return;

      const savedSession =
        pendingResumeSession ||
        (typeof saved === "string" ? JSON.parse(saved) : saved);
      const currentQuestion =
        savedSession.questions?.[savedSession.currentIndex];
      const currentSubject = currentQuestion?.Subject;
      const authorizedReviewQuestions = Array.isArray(
        options.authorizedReviewQuestions,
      )
        ? options.authorizedReviewQuestions.filter(
            (question) =>
              String(question?.Subject || "").trim() ===
              String(currentSubject || "").trim(),
          )
        : [];
      const hasAuthorizedReviewSession = authorizedReviewQuestions.length > 0;

      if (
        (isDeckHidden(currentSubject) || isDeckLocked(currentSubject)) &&
        !password &&
        !hasAuthorizedReviewSession
      ) {
        pendingResumeSession = savedSession;
        setPendingDeckRequest(currentSubject, "resume");
        openDeckPasswordModal(currentSubject, "resume");
        return;
      }

      if (
        currentSubject &&
        (password ||
          (isDeckLocked(currentSubject) && !hasAuthorizedReviewSession))
      ) {
        await fetchDeckQuestions(currentSubject, password);
      }

      pendingResumeSession = null;
      state.session = savedSession;
      const dbQuestionsById = new Map(
        (state.db || [])
          .filter((dbQuestion) => dbQuestion?.ID)
          .map((dbQuestion) => [String(dbQuestion.ID), dbQuestion]),
      );

      state.session.questions = state.session.questions.map(
        (savedQuestion, index) => {
          let searchId = savedQuestion.ID;
          if (searchId && !String(searchId).includes("::")) {
            const cleanId = String(searchId).replace(/^[a-zA-Z]+[-\s]?/, "");
            searchId = `${savedQuestion.Subject}::${cleanId}`;
          }
          const freshQuestion =
            dbQuestionsById.get(String(searchId || "")) ||
            dbQuestionsById.get(String(savedQuestion.ID || ""));

          if (freshQuestion) {
            savedQuestion.Question = freshQuestion.Question;
            savedQuestion.Explanation = freshQuestion.Explanation;
            const realCorrectText =
              freshQuestion[`Choice${freshQuestion.Answer}`];
            const matchingChoice = ["A", "B", "C", "D", "E"].find(
              (letter) => savedQuestion[`Choice${letter}`] === realCorrectText,
            );

            if (matchingChoice) {
              savedQuestion.Answer = matchingChoice;
            } else {
              const freshShuffled = prepareSessionPool([freshQuestion])[0];
              for (const letter of ["A", "B", "C", "D", "E"]) {
                savedQuestion[`Choice${letter}`] =
                  freshShuffled[`Choice${letter}`];
              }
              savedQuestion.Answer = freshShuffled.Answer;
              if (state.session.userAnswers[index]) {
                state.session.userAnswers[index] = null;
              }
            }
          } else {
            logger.warn(
              `Question ${searchId || savedQuestion.ID} not found in DB. Falling back to saved session data.`,
            );
          }
          return savedQuestion;
        },
      );

      await navigate("practice");
      document.getElementById("session-setup").classList.add("hidden");
      document.getElementById("session-active").classList.remove("hidden");
      renderQuestion();
      await markQuizActivity(currentSubject);
      updateSessionNavigationUrl?.(currentSubject, "quiz");
      return true;
    }

    async function restoreSessionFromUrl() {
      const sessionRoute = getSessionNavigationFromUrl?.();
      if (!sessionRoute) return;

      const hasProgress = hasSessionRestoreProgress(sessionRoute);
      const sessionDeckName =
        String(sessionRoute.subject || "")
          .split("::")
          .filter(Boolean)
          .at(-1) || "this deck";
      const shouldRestore = hasProgress
        ? await requestConfirmation(
            {
              before: `A ${sessionRoute.mode === "study" ? "Study" : "Quiz"} session for `,
              emphasis: sessionDeckName,
              after:
                " was interrupted by the page refresh. Do you want to restore it?",
            },
            "Restore Session",
          )
        : false;
      const restoreCancelled = hasProgress && shouldRestore === false;
      let restored = false;
      if (shouldRestore) {
        try {
          if (sessionRoute.mode === "study" && sessionRoute.subject) {
            setCurrentAppMode("review");
            syncPreferenceControls();
            restored = await reviewDeck(sessionRoute.subject, null, true);
          } else if (sessionRoute.mode === "quiz") {
            restored = await resumeSession(null, { allowResume: true });
          }
        } catch (error) {
          logger.error("Unable to restore the session from its URL.", error);
          showToast(
            "This session could not be restored. Return to the deck and start a new session.",
            "warning",
            8000,
          );
        }
      }

      const passwordPending =
        shouldRestore &&
        ((sessionRoute.mode === "quiz" &&
          getPendingDeckAction() === "resume") ||
          (sessionRoute.mode === "study" &&
            getPendingDeckAction() === "resume-review"));
      if (!restored && !passwordPending) {
        updateNavigationUrl?.(getCurrentPath() || [], { replace: true });
      }
    }

    let getPendingDeckAction = () => "";
    function setPendingDeckActionGetter(getter) {
      getPendingDeckAction = getter;
    }

    return {
      checkSavedSession,
      clearSessionProgress,
      hasSessionRestoreProgress,
      restoreSessionFromUrl,
      resumeSession,
      saveSessionProgress,
      setPendingDeckActionGetter,
    };
  }

  const SessionPersistenceCore = { create };
  globalScope.SessionPersistenceCore = SessionPersistenceCore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = SessionPersistenceCore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
