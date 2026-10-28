(function (globalScope) {
  "use strict";

  function create(dependencies) {
    const {
      document,
      state,
      saveState,
      logger,
      getAnalyticsCore,
      getOrigin = () => globalScope.location?.origin,
    } = dependencies;

    function applyTheme(darkMode) {
      if (!document?.documentElement) return;
      const root = document.documentElement;
      root.classList.add("theme-switching");
      try {
        root.classList.toggle("dark", Boolean(darkMode));
        root.style.colorScheme = darkMode ? "dark" : "light";
        root.getBoundingClientRect();
        const previewFrame = document.getElementById(
          "resource-portal-preview-frame",
        );
        const origin = getOrigin();
        if (previewFrame?.contentWindow && origin) {
          try {
            previewFrame.contentWindow.postMessage(
              {
                type: "MRH_PDF_VIEWER_THEME",
                darkMode: Boolean(darkMode),
              },
              origin,
            );
          } catch (error) {
            logger.warn("Unable to sync the PDF preview theme.", error);
          }
        }
      } finally {
        root.classList.remove("theme-switching");
      }
      try {
        const maxAge = 60 * 60 * 24 * 365;
        document.cookie = `mrh_theme=${darkMode ? "dark" : "light"}; path=/; max-age=${maxAge}; SameSite=Lax`;
      } catch (error) {
        logger.warn("Unable to persist the selected theme cookie.", error);
      }
    }

    function toggleTheme() {
      const prefs = state.prefs || {};
      prefs.darkMode = prefs.darkMode === false;
      void saveState("prefs").catch((error) => {
        logger.warn("Unable to persist the selected theme preference.", error);
      });
      updateThemeButton();
      return prefs.darkMode;
    }

    function updateThemeButton() {
      const analytics = getAnalyticsCore();
      if (analytics && typeof analytics.updateThemeButton === "function") {
        return analytics.updateThemeButton();
      }
      const button = document?.getElementById("btn-theme-toggle");
      const darkMode = state.prefs?.darkMode !== false;
      applyTheme(darkMode);
      if (!button) return null;
      button.innerHTML = darkMode
        ? '<i class="fa-solid fa-sun transition-transform transform hover:rotate-180 duration-500"></i>'
        : '<i class="fa-solid fa-moon transition-transform transform hover:rotate-12 duration-300"></i>';
      button.setAttribute(
        "aria-label",
        darkMode ? "Switch to light mode" : "Switch to dark mode",
      );
      button.setAttribute(
        "title",
        darkMode ? "Switch to light mode" : "Switch to dark mode",
      );
      return button;
    }

    function applyPreferences() {
      const darkMode = state.prefs?.darkMode !== false;
      if (!document?.documentElement) return;
      document.documentElement.classList.toggle("dark", darkMode);
      document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
    }

    return Object.freeze({
      applyPreferences,
      applyTheme,
      toggleTheme,
      updateThemeButton,
    });
  }

  const AppThemeControllerCore = Object.freeze({ create });
  globalScope.AppThemeControllerCore = AppThemeControllerCore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = AppThemeControllerCore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
