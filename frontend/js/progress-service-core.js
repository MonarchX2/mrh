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
      saveState,
      decodeHandlerValue,
      showToast,
      invalidateCategoryProgressRenderSignature,
      renderCategoryProgress,
      requestConfirmation,
      getDeckReviewCore,
      reRenderDeckReview,
      document,
    } = dependencies;

    function toggleFavoriteDeck(subjectId) {
      subjectId = decodeHandlerValue(subjectId);
      if (!subjectId) return;

      if (!Array.isArray(state.prefs.favoriteDecks)) {
        state.prefs.favoriteDecks = [];
      }
      const existing = state.prefs.favoriteDecks.filter(Boolean);
      const isFavorite = existing.includes(subjectId);
      state.prefs.favoriteDecks = isFavorite
        ? existing.filter((deck) => deck !== subjectId)
        : [...existing, subjectId];

      saveState();
      invalidateCategoryProgressRenderSignature();
      renderCategoryProgress();
      showToast(isFavorite ? "Removed from Favorites." : "Added to Favorites.");
    }

    async function toggleArchiveDeck(subjectId) {
      subjectId = decodeHandlerValue(subjectId);
      const folderName = String(subjectId || "")
        .split("::")
        .pop()
        .trim();
      if (!Array.isArray(state.prefs.archivedDecks)) {
        state.prefs.archivedDecks = [];
      }

      const index = state.prefs.archivedDecks.indexOf(subjectId);
      if (index > -1) {
        state.prefs.archivedDecks.splice(index, 1);
        showToast("Removed from Archive.");
      } else {
        if (
          !(await requestConfirmation(
            {
              before: "Are you sure you want to archive ",
              emphasis: folderName,
              after: "?",
            },
            "Archive Folder",
          ))
        ) {
          return;
        }
        state.prefs.archivedDecks.push(subjectId);
        showToast("Added to Archive.");
      }

      saveState();
      invalidateCategoryProgressRenderSignature();
      renderCategoryProgress();
    }

    function toggleArchivedDeckVisibility() {
      const archiveScopePath = (state.currentPath || []).join("::");
      const expandedPaths = Array.isArray(state.prefs.expandedArchivedPaths)
        ? state.prefs.expandedArchivedPaths
        : [];
      const isExpanded = expandedPaths.includes(archiveScopePath);
      state.prefs.expandedArchivedPaths = isExpanded
        ? expandedPaths.filter((path) => path !== archiveScopePath)
        : [...expandedPaths, archiveScopePath];
      saveState();
      invalidateCategoryProgressRenderSignature();
      renderCategoryProgress();
    }

    function toggleQuestionFavorite(questionId) {
      questionId = decodeHandlerValue(questionId || "");
      if (!questionId) return;
      if (!Array.isArray(state.prefs.favoriteQuestions)) {
        state.prefs.favoriteQuestions = [];
      }

      const normalizedId = String(questionId);
      const isFavorite = state.prefs.favoriteQuestions.some(
        (value) => String(value) === normalizedId,
      );
      if (isFavorite) {
        state.prefs.favoriteQuestions = state.prefs.favoriteQuestions.filter(
          (value) => String(value) !== normalizedId,
        );
        showToast("Removed from Favorites.");
      } else {
        state.prefs.favoriteQuestions = [
          normalizedId,
          ...state.prefs.favoriteQuestions.map((value) => String(value)),
        ].slice(0, 250);
        showToast("Added to Favorites.");
      }

      saveState();
      const deckReviewCore = getDeckReviewCore();
      if (
        document
          .getElementById("view-deck-review")
          ?.classList.contains("active") &&
        deckReviewCore.updateQuestionFavorite(normalizedId, !isFavorite) !== true
      ) {
        reRenderDeckReview();
      }
    }

    function toggleCurrentQuestionFavorite() {
      if (!state.session.active) return;
      const question = state.session.questions[state.session.currentIndex];
      if (question) toggleQuestionFavorite(question.ID);
    }

    return {
      computeSrsInterval(step, ease) {
        return requireSessionMethod(
          "computeSrsInterval",
          "computing SRS intervals",
        )(step, ease);
      },
      getDefaultSrsEntry(questionId) {
        return requireSessionMethod(
          "getDefaultSrsEntry",
          "creating SRS entries",
        )(questionId);
      },
      trackStats(question, isCorrect) {
        return requireSessionMethod(
          "trackStats",
          "tracking statistics",
        )(question, isCorrect);
      },
      updateSrsForQuestion(question, isCorrect) {
        return requireSessionMethod(
          "updateSrsForQuestion",
          "updating SRS data",
        )(question, isCorrect);
      },
      toggleArchiveDeck,
      toggleArchivedDeckVisibility,
      toggleCurrentQuestionFavorite,
      toggleFavoriteDeck,
      toggleQuestionFavorite,
    };
  }

  const ProgressServiceCore = { create };
  globalScope.ProgressServiceCore = ProgressServiceCore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = ProgressServiceCore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
