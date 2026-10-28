(function (globalScope) {
  "use strict";

  const state = globalScope.state;

  function saveState() {
    return globalScope.saveState?.();
  }

  function renderCategoryProgress() {
    return globalScope.renderCategoryProgress?.();
  }

  const SESSION_SETTING_KEYS = {
    quiz: new Set([
      "activeRecall",
      "shuffleChoices",
      "shuffleQuestions",
      "quizHideABCD",
      "clozeEnabled",
      "srsEnabled",
      "qTypeOverride",
      "quizShowExplanations",
      "showSessionHeader",
    ]),
    study: new Set([
      "hideABCD",
      "showWrongChoices",
      "studyShowAnswers",
      "studyShowExplanations",
      "studyLayout",
      "studyPageSize",
      "studyFilterMode",
      "showSessionHeader",
    ]),
  };
  const hasOwn = (object, key) =>
    Object.prototype.hasOwnProperty.call(object, key);

  function syncPreferenceControls() {
    if (typeof globalScope.AppState?.syncPreferenceControls === "function") {
      return globalScope.AppState.syncPreferenceControls();
    }
    throw new Error(
      "AppState is required before synchronizing preference controls.",
    );
  }

  function getNavigationContextSubject() {
    if (
      document.getElementById("view-deck-review")?.classList.contains("active")
    ) {
      return globalScope.getCurrentReviewSubject?.() || "";
    }

    if (state.session?.active) {
      return (
        state.session.questions?.[state.session.currentIndex]?.Subject || ""
      );
    }

    return "";
  }

  function syncSessionHeaderVisibility() {
    const studyView = document.getElementById("view-deck-review");
    const practiceView = document.getElementById("view-practice");
    const isStudyActive = Boolean(studyView?.classList.contains("active"));
    const isQuizActive = Boolean(
      practiceView?.classList.contains("active") &&
        state.session?.active &&
        !document.getElementById("session-active")?.classList.contains("hidden"),
    );
    const mode = isStudyActive ? "study" : isQuizActive ? "quiz" : null;
    const subject = mode ? getNavigationContextSubject() : "";
    const showHeader =
      Boolean(mode && subject) &&
      getDeckSessionSetting(mode, "showSessionHeader", subject) === true;
    const header = document.querySelector(".app-site-header");

    if (header) {
      header.hidden = Boolean(mode && !showHeader);
      header.classList.toggle(
        "session-header-visible",
        Boolean(mode && showHeader),
      );
    }

    ["study", "quiz"].forEach((sessionMode) => {
      const button = document.getElementById(
        `session-header-toggle-${sessionMode}`,
      );
      if (!button) return;
      button.hidden = mode !== sessionMode;
      const label = showHeader ? "Hide Header" : "Show Header";
      button.setAttribute("aria-expanded", String(showHeader));
      button.setAttribute("aria-label", label);
      button.title = label;
      const icon = button.querySelector("i");
      if (icon) {
        icon.className = `fa-solid ${showHeader ? "fa-eye-slash" : "fa-eye"}`;
      }
      const text = button.querySelector(".session-header-toggle-label");
      if (text) text.textContent = label;
    });

    return { mode, subject, showHeader };
  }

  function getDeckSessionSetting(
    mode,
    key,
    subject = getNavigationContextSubject(),
  ) {
    const deckKey = String(subject || "").trim();
    if (!SESSION_SETTING_KEYS[mode]?.has(key) || !deckKey) {
      return state.prefs[key];
    }
    const decks = state.prefs.deckSessionSettings;
    const settings =
      decks && hasOwn(decks, deckKey)
        ? decks[deckKey]?.[mode]
        : null;
    return settings && hasOwn(settings, key)
      ? settings[key]
      : state.prefs[key];
  }

  function setDeckSessionSetting(
    mode,
    key,
    value,
    subject = getNavigationContextSubject(),
  ) {
    const deckKey = String(subject || "").trim();
    if (!SESSION_SETTING_KEYS[mode]?.has(key) || !deckKey) return false;

    let deckSettings = state.prefs.deckSessionSettings;
    if (!deckSettings || Object.getPrototypeOf(deckSettings) !== null) {
      deckSettings = Object.assign(
        Object.create(null),
        deckSettings || {},
      );
    }
    state.prefs.deckSessionSettings = deckSettings;
    if (
      !hasOwn(deckSettings, deckKey) ||
      !deckSettings[deckKey] ||
      typeof deckSettings[deckKey] !== "object"
    ) {
      deckSettings[deckKey] = Object.create(null);
    }
    if (
      !hasOwn(deckSettings[deckKey], mode) ||
      !deckSettings[deckKey][mode] ||
      typeof deckSettings[deckKey][mode] !== "object"
    ) {
      deckSettings[deckKey][mode] = Object.create(null);
    }
    deckSettings[deckKey][mode][key] = value;
    return true;
  }

  function getDeckSessionSettings(
    mode,
    subject = getNavigationContextSubject(),
  ) {
    const deckKey = String(subject || "").trim();
    const decks = state.prefs.deckSessionSettings;
    const settings =
      decks && hasOwn(decks, deckKey)
        ? decks[deckKey]?.[mode]
        : null;
    if (!SESSION_SETTING_KEYS[mode] || !settings) return {};
    return Object.fromEntries(
      Object.entries(settings).filter(([key]) =>
        SESSION_SETTING_KEYS[mode].has(key),
      ),
    );
  }

  function getQuizNavigationPosition(subject = getNavigationContextSubject()) {
    const deckKey = String(subject || "").trim();
    const override = deckKey
      ? getDeckNavigationOverride(deckKey, "quiz")
      : null;
    if (override) {
      return ["top", "bottom"].includes(override) ? override : "top";
    }
    if (state.prefs.quizNavigationPosition !== "auto") {
      return state.prefs.quizNavigationPosition;
    }
    const breakpoint = globalScope.MRH_CONFIG?.quizNavigationBreakpoint ?? 768;
    return window.innerWidth <= breakpoint ? "top" : "bottom";
  }

  function getDeckNavigationOverride(subject, type) {
    const deckKey = String(subject || "").trim();
    if (!deckKey) return null;
    const overrides = state.prefs.deckNavigationOverrides || {};
    if (!hasOwn(overrides, deckKey)) return null;
    const deckOverrides = overrides[deckKey];
    if (!deckOverrides || !hasOwn(deckOverrides, type) || !deckOverrides[type])
      return null;
    return deckOverrides[type];
  }

  function setDeckNavigationOverride(subject, type, value) {
    const deckKey = String(subject || "").trim();
    if (!deckKey) return false;
    let overrides = state.prefs.deckNavigationOverrides;
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
      overrides = Object.create(null);
    } else if (Object.getPrototypeOf(overrides) !== null) {
      overrides = Object.assign(Object.create(null), overrides);
    }
    state.prefs.deckNavigationOverrides = overrides;
    if (
      !hasOwn(overrides, deckKey) ||
      !overrides[deckKey] ||
      typeof overrides[deckKey] !== "object" ||
      Array.isArray(overrides[deckKey])
    ) {
      overrides[deckKey] = Object.create(null);
    } else if (Object.getPrototypeOf(overrides[deckKey]) !== null) {
      overrides[deckKey] = Object.assign(
        Object.create(null),
        overrides[deckKey],
      );
    }
    overrides[deckKey][type] = value;
    saveState();
    return true;
  }

  function getStudyNavigationPosition(
    layoutType,
    subject = getNavigationContextSubject(),
  ) {
    const effectiveLayout =
      layoutType ||
      getDeckSessionSetting("study", "studyLayout", subject) ||
      "scroll";
    const normalizedLayout =
      effectiveLayout === "single" ? "single" : "scroll";
    const overrideKey =
      normalizedLayout === "single" ? "studySingle" : "studyScroll";
    const overrideValue = getDeckNavigationOverride(subject, overrideKey);
    if (overrideValue) {
      if (normalizedLayout === "single") {
        return ["top", "bottom"].includes(overrideValue)
          ? overrideValue
          : "top";
      }
      return ["top", "bottom", "both"].includes(overrideValue)
        ? overrideValue
        : "both";
    }

    const value =
      normalizedLayout === "single"
        ? state.prefs.studySingleNavigationPosition
        : state.prefs.studyScrollNavigationPosition;

    if (normalizedLayout === "single") {
      return ["top", "bottom"].includes(value) ? value : "top";
    }

    if (!["top", "bottom", "both"].includes(value)) return "both";
    return value;
  }

  function setStudyNavigationPosition(
    layoutType,
    position,
    subject = getNavigationContextSubject(),
  ) {
    const normalized =
      position === "bottom" ? "bottom" : position === "both" ? "both" : "top";
    const effectiveLayout = layoutType === "single" ? "single" : "scroll";

    if (!String(subject || "").trim()) return false;

    if (effectiveLayout === "single") {
      const nextValue = normalized === "both" ? "top" : normalized;
      return setDeckNavigationOverride(subject, "studySingle", nextValue);
    } else {
      return setDeckNavigationOverride(subject, "studyScroll", normalized);
    }
  }

  function getScrollNavigationButtonLabel(position) {
    const normalized = ["top", "bottom", "both"].includes(position)
      ? position
      : "top";
    if (normalized === "both") return "TOP + BOTTOM";
    if (normalized === "bottom") return "BOTTOM";
    return "TOP";
  }

  function syncNavigationButtonLabels() {
    const label = globalScope.getScrollNavigationButtonLabel;
    const getQuizPosition = globalScope.getQuizNavigationPosition;
    const getStudyPosition = globalScope.getStudyNavigationPosition;
    if (
      typeof label !== "function" ||
      typeof getQuizPosition !== "function" ||
      typeof getStudyPosition !== "function"
    ) {
      return;
    }

    const isSettingsPage = document
      .getElementById("view-settings")
      ?.classList.contains("active");
    
    const studyLayout =
      getDeckSessionSetting("study", "studyLayout") ||
      state.prefs.studyLayout ||
      "scroll";
    
    // On settings page, show global preferences. In sessions, show effective (deck-specific or global)
    const positions = isSettingsPage
      ? {
          "toggle-main-navigation-quiz": state.prefs.quizNavigationPosition || "top",
          "toggle-main-navigation-single": state.prefs.studySingleNavigationPosition || "top",
          "main-navigation-scroll-button": state.prefs.studyScrollNavigationPosition || "both",
          "toggle-session-navigation-bottom": state.prefs.quizNavigationPosition || "top",
          "toggle-review-navigation-bottom": studyLayout === "single"
            ? state.prefs.studySingleNavigationPosition || "top"
            : state.prefs.studyScrollNavigationPosition || "both",
        }
      : {
          "toggle-main-navigation-quiz": getQuizPosition(),
          "toggle-main-navigation-single": getStudyPosition("single"),
          "main-navigation-scroll-button": getStudyPosition("scroll"),
          "toggle-session-navigation-bottom": getQuizPosition(),
          "toggle-review-navigation-bottom": getStudyPosition(studyLayout),
        };

    Object.entries(positions).forEach(([id, position]) => {
      const button = document.getElementById(id);
      if (button) button.textContent = label(position);
    });
  }

  function cycleNavigationModeButton(mode, button) {
    const layoutType =
      mode === "study"
        ? (getDeckSessionSetting("study", "studyLayout") ||
            state.prefs.studyLayout) === "single"
          ? "single"
          : "scroll"
        : mode;
    const orderByMode = {
      quiz: ["top", "bottom"],
      single: ["top", "bottom"],
      scroll: ["top", "both", "bottom"],
    };
    const order = orderByMode[layoutType] || ["top", "bottom"];
    const subject = String(getNavigationContextSubject() || "").trim() || null;
    let current = "top";

    if (layoutType === "quiz") {
      current = getQuizNavigationPosition(subject) || "top";
    } else if (layoutType === "single") {
      current = getStudyNavigationPosition("single", subject) || "top";
    } else {
      current = getStudyNavigationPosition("scroll", subject) || "top";
    }

    const next = order[(order.indexOf(current) + 1) % order.length];
    
    // Check if this is being called from settings page vs active session
    const isSettingsPage = document.getElementById("view-settings")?.classList.contains("active");
    
    if (isSettingsPage) {
      // Settings page - ALWAYS save to global preferences
      if (layoutType === "quiz") {
        state.prefs.quizNavigationPosition = next;
      } else if (layoutType === "single") {
        state.prefs.studySingleNavigationPosition = next;
      } else {
        state.prefs.studyScrollNavigationPosition = next;
      }
    } else if (subject) {
      // Active session - save deck-specific override
      if (layoutType === "quiz") {
        if (!setDeckNavigationOverride(subject, "quiz", next)) {
          notifyNavigationSettingUnavailable();
          return false;
        }
      } else if (layoutType === "single") {
        if (!setStudyNavigationPosition("single", next, subject)) {
          notifyNavigationSettingUnavailable();
          return false;
        }
      } else {
        if (!setStudyNavigationPosition("scroll", next, subject)) {
          notifyNavigationSettingUnavailable();
          return false;
        }
      }
    } else {
      // No subject but not in settings - save to global
      if (layoutType === "quiz") {
        state.prefs.quizNavigationPosition = next;
      } else if (layoutType === "single") {
        state.prefs.studySingleNavigationPosition = next;
      } else {
        state.prefs.studyScrollNavigationPosition = next;
      }
    }

    saveState();
    applyNavigationPosition();
    if (
      document.getElementById("view-deck-review")?.classList.contains("active")
    ) {
      globalScope.reRenderDeckReview?.();
    }
    syncNavigationButtonLabels();
    if (button) button.textContent = getScrollNavigationButtonLabel(next);
    return true;
  }

  function cycleScrollNavigationPosition() {
    cycleNavigationModeButton(
      "scroll",
      document.getElementById("main-navigation-scroll-button"),
    );
  }

  function applyNavigationPosition() {
    const navigation = document.getElementById("quiz-navigation");
    const topAnchor = document.getElementById("quiz-navigation-top");
    const bottomAnchor = document.getElementById("quiz-navigation-bottom");
    if (!navigation || !topAnchor || !bottomAnchor) return;

    const savedPosition = state.session.active
      ? getQuizNavigationPosition()
      : getStudyNavigationPosition();
    const position = ["top", "bottom", "both"].includes(savedPosition)
      ? savedPosition
      : "top";

    if (navigation.parentElement)
      navigation.parentElement.removeChild(navigation);
    const existingBottomClone = bottomAnchor.querySelector(
      ".quiz-navigation-clone",
    );
    if (existingBottomClone) existingBottomClone.remove();

    if (position === "both") {
      topAnchor.appendChild(navigation);
      const bottomClone = navigation.cloneNode(true);
      bottomClone.id = "quiz-navigation-bottom-clone";
      bottomClone.classList.add("quiz-navigation-clone");
      bottomAnchor.appendChild(bottomClone);
      topAnchor.classList.remove("hidden");
      bottomAnchor.classList.remove("hidden");
      return;
    }

    (position === "top" ? topAnchor : bottomAnchor).appendChild(navigation);
    topAnchor.classList.toggle("hidden", position !== "top");
    bottomAnchor.classList.toggle("hidden", position !== "bottom");
  }

  function notifyNavigationSettingUnavailable() {
    if (typeof globalScope.showToast === "function") {
      globalScope.showToast(
        "Open a deck session before changing navigation position.",
        "warning",
      );
      return;
    }
    throw new Error(
      "Unable to save navigation position without an active deck.",
    );
  }

  function changeNavigationPosition(position) {
    const normalized = position === "top" ? "top" : "bottom";
    const isStudyActive = document
      .getElementById("view-deck-review")
      ?.classList.contains("active");
    const subject = getNavigationContextSubject();
    const isSettingsPage = document.getElementById("view-settings")?.classList.contains("active");
    
    if (isSettingsPage) {
      // Settings page - ALWAYS save to global preferences
      if (isStudyActive) {
        const layoutType =
          (getDeckSessionSetting("study", "studyLayout", subject) ||
            state.prefs.studyLayout) === "single"
            ? "single"
            : "scroll";
        if (layoutType === "single") {
          state.prefs.studySingleNavigationPosition = normalized;
        } else {
          state.prefs.studyScrollNavigationPosition = normalized;
        }
      } else {
        state.prefs.quizNavigationPosition = normalized;
      }
    } else if (subject) {
      // Active session - save deck-specific override
      if (isStudyActive) {
        const layoutType =
          (getDeckSessionSetting("study", "studyLayout", subject) ||
            state.prefs.studyLayout) === "single"
            ? "single"
            : "scroll";
        if (!setStudyNavigationPosition(layoutType, normalized, subject)) {
          notifyNavigationSettingUnavailable();
          return false;
        }
      } else if (!setDeckNavigationOverride(subject, "quiz", normalized)) {
        notifyNavigationSettingUnavailable();
        return false;
      }
    } else {
      // No subject but not in settings - save to global
      if (isStudyActive) {
        const layoutType =
          (getDeckSessionSetting("study", "studyLayout", subject) ||
            state.prefs.studyLayout) === "single"
            ? "single"
            : "scroll";
        if (layoutType === "single") {
          state.prefs.studySingleNavigationPosition = normalized;
        } else {
          state.prefs.studyScrollNavigationPosition = normalized;
        }
      } else {
        state.prefs.quizNavigationPosition = normalized;
      }
    }
    saveState();
    applyNavigationPosition();
    syncNavigationButtonLabels();
    const select = document.getElementById("navigation-position-select");
    if (select) select.value = normalized;
    return true;
  }

  function toggleMainNavigationPosition(mode, source) {
    const normalized = source.checked ? "bottom" : "top";
    const subject = getNavigationContextSubject();
    const isStudyActive = document
      .getElementById("view-deck-review")
      ?.classList.contains("active");
    const isSettingsPage = document.getElementById("view-settings")?.classList.contains("active");
    
    if (isSettingsPage) {
      // Settings page - ALWAYS save to global preferences
      if (mode === "quiz") {
        state.prefs.quizNavigationPosition = normalized;
      } else if (mode === "single") {
        state.prefs.studySingleNavigationPosition = normalized;
      } else {
        state.prefs.studyScrollNavigationPosition = normalized;
      }
    } else if (subject) {
      // Active session - save deck-specific override
      if (mode === "quiz") {
        if (!setDeckNavigationOverride(subject, "quiz", normalized)) {
          notifyNavigationSettingUnavailable();
          return false;
        }
      } else if (!setStudyNavigationPosition(mode, normalized, subject)) {
        notifyNavigationSettingUnavailable();
        return false;
      }
    } else {
      // No subject but not in settings - save to global
      if (mode === "quiz") {
        state.prefs.quizNavigationPosition = normalized;
      } else if (mode === "single") {
        state.prefs.studySingleNavigationPosition = normalized;
      } else {
        state.prefs.studyScrollNavigationPosition = normalized;
      }
    }
    saveState();
    applyNavigationPosition();
    syncNavigationButtonLabels();
    if (
      document.getElementById("view-deck-review")?.classList.contains("active")
    ) {
      globalScope.reRenderDeckReview?.();
    }
    return true;
  }

  function toggleNavigationPosition(source) {
    changeNavigationPosition(source.checked ? "bottom" : "top");
    if (
      document.getElementById("view-deck-review")?.classList.contains("active")
    ) {
      globalScope.reRenderDeckReview?.();
    }
  }

  function changeDeckNameMode(mode) {
    const normalizedMode = ["clip", "wrap"].includes(mode) ? mode : "wrap";
    state.prefs.deckNameMode = normalizedMode;
    state.prefs.titleMode = normalizedMode;
    saveState();
    applyTitleMode();
    renderCategoryProgress();
  }

  function changeDeckSort(sortOrder) {
    state.prefs.deckSortBy = ["letters", "questions"].includes(sortOrder)
      ? sortOrder
      : "letters";

    const menu = document.getElementById("deck-sort-menu");
    if (menu) {
      if (typeof globalScope.closeDropdownMenu === "function") {
        globalScope.closeDropdownMenu(menu);
      } else {
        menu.open = false;
      }
    }

    saveState();
    syncPreferenceControls();
    renderCategoryProgress();
  }

  function changeDeckSource(sourceValue) {
    const validSources = [
      "all",
      "favorites",
      "archived",
    ];
    state.prefs.deckSourceFilter = validSources.includes(sourceValue)
      ? sourceValue
      : "all";

    const sourceLabels = {
      all: "All",
      favorites: "Favorites",
      archived: "Archived",
    };

    const label = document.getElementById("deck-source-label");
    if (label) label.innerText = sourceLabels[state.prefs.deckSourceFilter];

    document.querySelectorAll(".deck-source-option").forEach((btn) => {
      const check = btn.querySelector(".source-check");
      const isSelected =
        btn.dataset.sourceValue === state.prefs.deckSourceFilter;
      if (check) check.style.opacity = isSelected ? "1" : "0";
    });

    const menu = document.getElementById("deck-source-menu");
    if (menu) {
      if (typeof globalScope.closeDropdownMenu === "function") {
        globalScope.closeDropdownMenu(menu);
      } else {
        menu.open = false;
      }
    }

    const select = document.getElementById("deck-source-filter");
    if (select) select.value = state.prefs.deckSourceFilter;

    saveState();
    syncPreferenceControls();
    renderCategoryProgress();
  }

  function toggleDeckSortDirection() {
    setDeckSortDirection(
      state.prefs.deckSortDirection === "desc" ? "asc" : "desc",
    );
  }

  function setDeckSortDirection(direction) {
    state.prefs.deckSortDirection = direction === "desc" ? "desc" : "asc";
    saveState();
    syncPreferenceControls();
    renderCategoryProgress();
  }

  function setTitleMode(mode) {
    if (!["clip", "wrap"].includes(mode)) return;

    const normalizedMode = mode === "clip" ? "clip" : "wrap";
    state.prefs.deckNameMode = normalizedMode;
    state.prefs.titleMode = normalizedMode;
    saveState();
    applyTitleMode();
    updateTitleModeButton();
  }

  function applyTitleMode() {
    const mode = state.prefs.titleMode || "wrap";
    const body = document.body;

    if (body) {
      body.classList.toggle("title-mode-wrap", mode === "wrap");
      body.classList.toggle("title-mode-clip", mode === "clip");
    }

    document
      .querySelectorAll(
        ".quiz-header-row, .review-header-row, .app-content-shell, main, .view-section, #view-dashboard, #view-practice, #view-deck-review",
      )
      .forEach((element) => {
        element.classList.add("min-w-0", "max-w-full");
        if (mode === "wrap") {
          element.classList.add("flex-wrap");
          element.style.maxWidth = "100%";
          element.style.minWidth = "0";
        } else {
          element.classList.remove("flex-wrap");
          element.style.maxWidth = "100%";
          element.style.minWidth = "0";
        }
      });

    const quizSubject = document.getElementById("q-subject");
    const reviewTitle = document.getElementById("deck-review-title");

    [quizSubject, reviewTitle].forEach((element) => {
      if (!element) return;

      const parent = element.parentElement;
      if (mode === "clip") {
        element.classList.add("truncate", "overflow-hidden");
        element.classList.remove("whitespace-normal", "break-words");
        element.style.whiteSpace = "nowrap";
        element.style.overflow = "hidden";
        element.style.textOverflow = "ellipsis";
        element.style.overflowWrap = "normal";
        element.style.wordBreak = "normal";

        if (parent) {
          parent.classList.add("min-w-0", "overflow-hidden");
          parent.classList.remove("flex-wrap");
        }
      } else if (mode === "wrap") {
        element.classList.remove("truncate", "overflow-hidden");
        element.classList.add("whitespace-normal", "break-words");
        element.style.whiteSpace = "normal";
        element.style.overflow = "hidden";
        element.style.textOverflow = "clip";
        element.style.overflowWrap = "anywhere";
        element.style.wordBreak = "break-word";

        if (parent) {
          parent.classList.add("min-w-0");
          parent.classList.add("overflow-hidden");
          parent.classList.remove("flex-wrap");
        }
      }
    });
  }

  function toggleTitleMode() {
    const currentMode = state.prefs.titleMode || "wrap";
    const newMode = currentMode === "wrap" ? "clip" : "wrap";
    setTitleMode(newMode);
    updateTitleModeButton();
  }

  function updateTitleModeButton() {
    const mode = state.prefs.titleMode || "wrap";
    const button = document.getElementById("title-mode-toggle-btn");
    if (button) {
      button.textContent = mode === "clip" ? "Clip" : "Wrap";
    }
  }

  function applyTextAlignment(alignment = state.prefs.textAlignment) {
    const validAlignment = ["left", "center", "right", "justify"].includes(
      alignment,
    )
      ? alignment
      : "left";
    const body = document.body;
    if (!body) return;

    body.classList.remove(
      "text-align-left",
      "text-align-center",
      "text-align-right",
      "text-align-justify",
    );
    body.classList.add(`text-align-${validAlignment}`);
  }

  function setTextAlignment(alignment) {
    if (!["left", "center", "right", "justify"].includes(alignment)) {
      return false;
    }

    state.prefs.textAlignment = alignment;
    applyTextAlignment(alignment);
    const select = document.getElementById("text-alignment-select");
    if (select) select.value = alignment;
    saveState();
    return true;
  }

  const PreferencesCore = {
    syncPreferenceControls,
    changeDeckNameMode,
    changeDeckSort,
    changeDeckSource,
    toggleDeckSortDirection,
    setDeckSortDirection,
    setTitleMode,
    applyTitleMode,
    toggleTitleMode,
    updateTitleModeButton,
    applyTextAlignment,
    setTextAlignment,
    getNavigationContextSubject,
    syncSessionHeaderVisibility,
    getDeckSessionSetting,
    setDeckSessionSetting,
    getDeckSessionSettings,
    getQuizNavigationPosition,
    getDeckNavigationOverride,
    setDeckNavigationOverride,
    getStudyNavigationPosition,
    setStudyNavigationPosition,
    getScrollNavigationButtonLabel,
    syncNavigationButtonLabels,
    cycleNavigationModeButton,
    cycleScrollNavigationPosition,
    applyNavigationPosition,
    changeNavigationPosition,
    toggleMainNavigationPosition,
    toggleNavigationPosition,
  };

  globalScope.PreferencesCore = PreferencesCore;
  Object.assign(globalScope, PreferencesCore);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PreferencesCore;
  }
})(
  typeof globalScope !== "undefined"
    ? globalScope
    : typeof globalThis !== "undefined"
      ? globalThis
      : this,
);
