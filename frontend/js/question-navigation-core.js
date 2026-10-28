(function (globalScope) {
  function callRequired(coreName, method, description, ...args) {
    const core = globalScope[coreName];
    if (typeof core?.[method] !== "function") {
      throw new Error(`${coreName} is required before ${description}.`);
    }
    return core[method](...args);
  }

  function revealClozeAnswer(trigger) {
    if (!trigger) return;
    const mask = trigger.querySelector(".cloze-mask");
    const hiddenAnswer = trigger.querySelector(".cloze-answer");
    if (!hiddenAnswer) return;

    const nextVisible = !trigger.classList.contains("cloze-visible");
    trigger.classList.toggle("cloze-visible", nextVisible);
    mask?.classList.toggle("hidden", nextVisible);
    hiddenAnswer.classList.toggle("hidden", !nextVisible);
  }

  function create(dependencies) {
    const { state, saveState, decodeHandlerValue } = dependencies;

    function toggleSpecificChoices(questionId) {
      questionId = decodeHandlerValue(questionId);
      if (!state.prefs.qToggles) state.prefs.qToggles = {};
      let currentState = state.prefs.qToggles[questionId];
      if (currentState === undefined) {
        currentState =
          globalScope.getDeckSessionSetting?.("study", "showWrongChoices") !==
          false;
      }

      state.prefs.qToggles[questionId] = !currentState;
      saveState();
      callRequired(
        "DeckReviewCore",
        "updateQuestionChoices",
        "updating study choices",
        questionId,
      );
    }

    return {
      changeStudyIndex(delta) {
        return callRequired(
          "DeckReviewCore",
          "changeStudyIndex",
          "changing study index",
          delta,
        );
      },
      changeStudyPage(delta, position) {
        return callRequired(
          "DeckReviewCore",
          "changeStudyPage",
          "changing study page",
          delta,
          position,
        );
      },
      changeStudyPageSize(size) {
        return callRequired(
          "DeckReviewCore",
          "changeStudyPageSize",
          "changing study page size",
          size,
        );
      },
      changeStudyLayout(layout) {
        return callRequired(
          "DeckReviewCore",
          "changeStudyLayout",
          "changing study layout",
          layout,
        );
      },
      jumpToStudyPage(page) {
        return callRequired(
          "DeckReviewCore",
          "jumpToStudyPage",
          "jumping to a study page",
          page,
        );
      },
      nextQuestion() {
        return callRequired(
          "SessionCore",
          "nextQuestion",
          "navigating questions",
        );
      },
      prevQuestion() {
        return callRequired(
          "SessionCore",
          "prevQuestion",
          "navigating questions",
        );
      },
      revealClozeAnswer,
      toggleClozeMode(source) {
        return callRequired(
          "QuizRenderingCore",
          "toggleClozeMode",
          "changing cloze mode",
          source,
        );
      },
      toggleChoiceVisibility(source) {
        return callRequired(
          "QuizRenderingCore",
          "toggleShowWrongChoices",
          "changing choice visibility",
          source,
        );
      },
      toggleSpecificChoices,
    };
  }

  const QuestionNavigationCore = { create, revealClozeAnswer };
  globalScope.QuestionNavigationCore = QuestionNavigationCore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = QuestionNavigationCore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
