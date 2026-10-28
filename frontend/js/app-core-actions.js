(function (globalScope) {
  "use strict";

  const delegatedUiActionNames = new Set([
    "cancelDeckPasswordRequest",
    "changeDeckNameMode",
    "changeDeckSort",
    "changeDeckSource",
    "changeQuestionTypeMode",
    "changeQuizFilter",
    "changeStudyIndex",
    "changeStudyPage",
    "changeStudyPageSize",
    "closeAboutModal",
    "closeChangelogModal",
    "closeConfirmModal",
    "closeFolderPasswordModal",
    "closePracticeCompletionModal",
    "closeReviewSettingsModal",
    "closeSessionSettingsModal",
    "cycleNavigationModeButton",
    "dismissDeckNotFound",
    "enterFolder",
    "goToPath",
    "handleDeckClick",
    "handleReviewLayoutChange",
    "jumpToStudyPage",
    "navigate",
    "nextQuestion",
    "openAboutModal",
    "openAcademicPortal",
    "openChangelogModal",
    "openPracticeSession",
    "openResourceDashboardTab",
    "openStudentPortalProfile",
    "openReviewSettingsModal",
    "openSessionSettingsModal",
    "prevQuestion",
    "proceedToQuiz",
    "proceedToReview",
    "rateIdentificationAnswer",
    "resetCategory",
    "resumeSession",
    "returnFromStudyMode",
    "revealAnswer",
    "revealClozeAnswer",
    "resizeStudyPageInput",
    "setDeckSortDirection",
    "setTextAlignment",
    "showMCQOptions",
    "switchPracticeToReview",
    "switchReviewToPractice",
    "toggleActiveRecall",
    "toggleAppMode",
    "toggleArchiveDeck",
    "toggleArchivedDeckVisibility",
    "toggleChangelogGroups",
    "toggleClozeMode",
    "toggleCurrentQuestionFavorite",
    "toggleCurrentQuizExplanation",
    "toggleFavoriteDeck",
    "toggleHideABCD",
    "togglePasswordVisibility",
    "togglePinDeck",
    "toggleQuizHideABCD",
    "toggleQuizShowExplanations",
    "toggleShuffleChoices",
    "toggleShuffleQuestions",
    "toggleShowABCD",
    "toggleShowExplanations",
    "toggleShowWrongChoices",
    "toggleSpecificChoices",
    "toggleSrsMode",
    "toggleStudyExplanation",
    "toggleStudyFilterMode",
    "toggleStudyShowAnswers",
    "toggleStudyShowExplanations",
    "toggleSessionHeader",
    "toggleTheme",
    "togglePanel",
    "toggleQuestionFavorite",
  ]);

  function createDelegatedActionController({
    document,
    logger,
    escapeHTML,
  } = {}) {
    if (!document || typeof document.querySelector !== "function") {
      throw new TypeError("A document is required for delegated UI actions.");
    }
    if (!logger || typeof logger.error !== "function") {
      throw new TypeError("A logger is required for delegated UI actions.");
    }
    if (typeof escapeHTML !== "function") {
      throw new TypeError("HTML escaping is required for delegated UI actions.");
    }

    function delegatedActionAttributes(actionName, args = [], options = {}) {
      const attributes = [
        `data-action="${actionName}"`,
        `data-action-args="${escapeHTML(JSON.stringify(args))}"`,
      ];
      if (options.event) {
        attributes.push(`data-action-event="${options.event}"`);
      }
      if (options.preventDefault) {
        attributes.push('data-action-prevent-default="true"');
      }
      if (options.stopPropagation) {
        attributes.push('data-action-stop-propagation="true"');
      }
      return attributes.join(" ");
    }

    function setResourceDashboardPortalMode(mode) {
      const layout = document.querySelector(".resource-dashboard-layout");
      const title = layout?.querySelector(".resource-dashboard-title");
      if (!layout || !title) {
        logger.error("Resource Dashboard layout or title is unavailable.");
        return false;
      }

      const portalMode = ["academic", "profile"].includes(mode)
        ? mode
        : "student";
      layout.dataset.portalMode = portalMode;
      const titleText =
        portalMode === "academic"
          ? "BSMT LIBRARY"
          : portalMode === "profile"
            ? "PROFILE"
            : "LEARNING MATERIALS";
      title.textContent = titleText;
      title.setAttribute("aria-label", titleText);
      return true;
    }

    function handleDelegatedUiAction(event) {
      const target = event.target?.closest?.("*");
      if (!target) return;

      if (event.type === "input") {
        const inputAction = target.closest("[data-action-input]");
        if (inputAction) {
          const actionName = inputAction.dataset.actionInput;
          if (!delegatedUiActionNames.has(actionName)) {
            logger.warn(
              "Ignoring unrecognized delegated input action.",
              actionName,
            );
            return;
          }
          if (actionName === "resizeStudyPageInput") {
            inputAction.style.width = `${Math.max(
              1.8,
              (inputAction.value.length ||
                Number(inputAction.dataset.actionDefaultLength) ||
                1) + 1.2,
            )}ch`;
            return;
          }
          logger.error(
            `Delegated input action "${actionName}" is not handled.`,
          );
          return;
        }
      }

      const actionElement = target.closest("[data-action]");
      const stopElement = target.closest("[data-action-stop-propagation]");
      if (
        stopElement &&
        (!actionElement || !stopElement.contains(actionElement))
      ) {
        event.stopPropagation();
        return;
      }

      if (!actionElement) return;
      const eventType = actionElement.dataset.actionEvent || "click";
      if (event.type !== eventType) return;
      if (
        actionElement.dataset.actionSelfOnly === "true" &&
        event.target !== actionElement
      ) {
        return;
      }

      if (actionElement.dataset.actionPreventDefault === "true") {
        event.preventDefault();
      }
      if (actionElement.dataset.actionStopPropagation === "true") {
        event.stopPropagation();
      }

      const actionName = actionElement.dataset.action;
      if (!delegatedUiActionNames.has(actionName)) {
        logger.warn("Ignoring unrecognized delegated UI action.", actionName);
        return;
      }

      let args = [];
      const rawArgs = actionElement.dataset.actionArgs;
      if (rawArgs) {
        try {
          args = JSON.parse(rawArgs);
        } catch (error) {
          logger.error(
            "Unable to parse delegated UI action arguments.",
            error,
          );
          return;
        }
        if (!Array.isArray(args)) {
          logger.error("Delegated UI action arguments must be an array.");
          return;
        }
      }

      const resolvedArgs = args.map((value) => {
        if (value && typeof value === "object") {
          if (value.__mrhActionArgument === "element") return actionElement;
          if (value.__mrhActionArgument === "event") return event;
          if (value.__mrhActionArgument === "value") return actionElement.value;
        }
        return value;
      });
      if (actionName === "openAcademicPortal") {
        return globalScope.navigate("library");
      }
      if (actionName === "openStudentPortalProfile") {
        return globalScope.navigate("profile");
      }
      const handler = globalScope[actionName];
      if (typeof handler !== "function") {
        logger.error(`Delegated UI action "${actionName}" is not available.`);
        return;
      }
      return handler.apply(actionElement, resolvedArgs);
    }

    return Object.freeze({
      delegatedActionAttributes,
      handleDelegatedUiAction,
      setResourceDashboardPortalMode,
    });
  }

  globalScope.DelegatedActionsCore = Object.freeze({
    create: createDelegatedActionController,
  });
})(typeof window !== "undefined" ? window : globalThis);
