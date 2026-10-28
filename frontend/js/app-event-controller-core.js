(function (globalScope) {
  "use strict";

  function create(dependencies) {
    const {
      document,
      window,
      state,
      handleDelegatedUiAction,
      signal,
      scheduleAnimationFrame,
      lifecycle,
      getCurrentReviewSubject,
      updateStudyProgressIndicator,
      saveState,
    } = dependencies;
    let isTicking = false;
    let lastScrollTop = 0;
    let latestReviewScrollY = 0;
    let latestReviewSubject = null;

    function flushReviewScrollProgress() {
      const reviewSubject = latestReviewSubject;
      if (!reviewSubject) return false;
      lifecycle.clearTimeout(window.scrollSaveTimeout);
      latestReviewSubject = null;
      if (!state.prefs.studyProgress) state.prefs.studyProgress = {};
      if (!state.prefs.studyProgress[reviewSubject]) {
        state.prefs.studyProgress[reviewSubject] = {
          page: 1,
          index: 0,
          scrollY: 0,
          updatedAt: Date.now(),
        };
      }
      state.prefs.studyProgress[reviewSubject].scrollY = latestReviewScrollY;
      state.prefs.studyProgress[reviewSubject].updatedAt = Date.now();
      saveState("prefs");
      return true;
    }

    function bind() {
      const mainElement = document.querySelector("main");
      const headerElement = document.querySelector("header");
      if (headerElement) {
        headerElement.classList.add("transition-transform", "duration-300");
      }

      for (const eventName of ["click", "change", "input"]) {
        document.addEventListener(eventName, handleDelegatedUiAction, {
          signal,
        });
      }

      if (!mainElement || !headerElement) return false;

      mainElement.addEventListener(
        "scroll",
        (event) => {
          if (isTicking) return;
          isTicking = true;
          scheduleAnimationFrame(() => {
            const currentScroll = event.target.scrollTop;
            if (currentScroll > lastScrollTop && currentScroll > 50) {
              headerElement.classList.add("-translate-y-full");
            } else {
              headerElement.classList.remove("-translate-y-full");
            }
            lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;

            if (typeof globalScope.scheduleVirtualReviewRender === "function") {
              globalScope.scheduleVirtualReviewRender();
            }

            const reviewSubject = getCurrentReviewSubject();
            if (
              document
                .getElementById("view-deck-review")
                ?.classList.contains("active") &&
              reviewSubject
            ) {
              updateStudyProgressIndicator?.();
              latestReviewScrollY = currentScroll;
              latestReviewSubject = reviewSubject;
              lifecycle.clearTimeout(window.scrollSaveTimeout);
              window.scrollSaveTimeout = lifecycle.setTimeout(() => {
                if (!state.prefs.studyProgress) state.prefs.studyProgress = {};
                if (!state.prefs.studyProgress[reviewSubject]) {
                  state.prefs.studyProgress[reviewSubject] = {
                    page: 1,
                    index: 0,
                    scrollY: 0,
                    updatedAt: Date.now(),
                  };
                }
                state.prefs.studyProgress[reviewSubject].scrollY =
                  latestReviewScrollY;
                state.prefs.studyProgress[reviewSubject].updatedAt = Date.now();
                if (latestReviewSubject === reviewSubject) {
                  latestReviewSubject = null;
                }
                saveState("prefs");
              }, 1000);
            }

            isTicking = false;
          });
        },
        { signal },
      );
      return true;
    }

    return Object.freeze({ bind, flushReviewScrollProgress });
  }

  const AppEventControllerCore = Object.freeze({ create });
  globalScope.AppEventControllerCore = AppEventControllerCore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = AppEventControllerCore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
