(function (globalScope) {
  const rootScope =
    globalScope || (typeof globalThis !== "undefined" ? globalThis : {});
  const lifecycle = rootScope.LifecycleUtils || rootScope;
  const MAX_CATEGORY_SUMMARY_ENTRIES =
    rootScope.MRH_CONFIG?.maxCategorySummaryEntries ?? 2000;
  const QUESTION_DATABASE_INDEX_KEY = "mrh_deck_index_v1";
  const LEGACY_QUESTION_DATABASE_KEY = "mrh_db";

  function getQuestionDeckStorageKey(subject) {
    return `mrh_deck:${String(subject || "").trim()}`;
  }

  async function loadQuestionDatabaseFromIndexedDB(
    lockedSubjects,
    storedIndexPromise,
  ) {
    if (
      typeof idbKeyval === "undefined" ||
      typeof idbKeyval.get !== "function" ||
      typeof idbKeyval.set !== "function" ||
      typeof idbKeyval.del !== "function"
    ) {
      throw new Error("IndexedDB storage is unavailable.");
    }

    const storedIndex = await storedIndexPromise;
    if (storedIndex !== undefined && !Array.isArray(storedIndex)) {
      throw new Error("The saved question-deck index is invalid.");
    }

    if (Array.isArray(storedIndex)) {
      const subjects = [
        ...new Set(
          storedIndex
            .map((subject) => String(subject || "").trim())
            .filter(Boolean),
        ),
      ];
      const database = [];
      const retainedSubjects = [];
      let indexChanged = subjects.length !== storedIndex.length;
      for (const subject of subjects) {
        const storageKey = getQuestionDeckStorageKey(subject);
        if (lockedSubjects.has(subject)) {
          await idbKeyval.del(storageKey);
          indexChanged = true;
          continue;
        }
        const storedDeck = await idbKeyval.get(storageKey);
        if (!Array.isArray(storedDeck)) {
          indexChanged = true;
          continue;
        }
        if (storedDeck.length === 0) {
          await idbKeyval.del(storageKey);
          indexChanged = true;
          continue;
        }
        retainedSubjects.push(subject);
        database.push(...storedDeck);
      }
      if (indexChanged) {
        await idbKeyval.set(QUESTION_DATABASE_INDEX_KEY, retainedSubjects);
      }
      const legacyDatabase = await idbKeyval.get(LEGACY_QUESTION_DATABASE_KEY);
      if (legacyDatabase !== undefined) {
        if (Array.isArray(legacyDatabase)) {
          const sanitizedLegacyDatabase = legacyDatabase.filter(
            (question) =>
              !lockedSubjects.has(
                String(normalizeQuestionRecord(question).Subject || "").trim(),
              ),
          );
          if (sanitizedLegacyDatabase.length !== legacyDatabase.length) {
            await idbKeyval.set(
              LEGACY_QUESTION_DATABASE_KEY,
              sanitizedLegacyDatabase,
            );
            const verifiedLegacyDatabase = await idbKeyval.get(
              LEGACY_QUESTION_DATABASE_KEY,
            );
            if (
              !Array.isArray(verifiedLegacyDatabase) ||
              verifiedLegacyDatabase.some((question) =>
                lockedSubjects.has(
                  String(
                    normalizeQuestionRecord(question).Subject || "",
                  ).trim(),
                ),
              )
            ) {
              throw new Error(
                "Password-protected questions remain in IndexedDB.",
              );
            }
          }
        }
        await idbKeyval.del(LEGACY_QUESTION_DATABASE_KEY);
        if ((await idbKeyval.get(LEGACY_QUESTION_DATABASE_KEY)) !== undefined) {
          throw new Error("Unable to remove the legacy question database.");
        }
      }
      return database;
    }

    const legacyDatabase = await idbKeyval.get(LEGACY_QUESTION_DATABASE_KEY);
    const savedDatabase = Array.isArray(legacyDatabase) ? legacyDatabase : [];
    const decks = new Map();
    let removedLockedQuestions = false;
    for (const question of savedDatabase) {
      const subject = String(
        normalizeQuestionRecord(question).Subject || "",
      ).trim();
      if (!subject) continue;
      if (lockedSubjects.has(subject)) {
        removedLockedQuestions = true;
        continue;
      }
      if (!decks.has(subject)) decks.set(subject, []);
      decks.get(subject).push(question);
    }

    let migrationSource = savedDatabase;
    if (removedLockedQuestions) {
      migrationSource = savedDatabase.filter(
        (question) =>
          !lockedSubjects.has(
            String(normalizeQuestionRecord(question).Subject || "").trim(),
          ),
      );
      await idbKeyval.set(LEGACY_QUESTION_DATABASE_KEY, migrationSource);
      const verifiedLegacyDatabase = await idbKeyval.get(
        LEGACY_QUESTION_DATABASE_KEY,
      );
      if (
        !Array.isArray(verifiedLegacyDatabase) ||
        verifiedLegacyDatabase.some((question) =>
          lockedSubjects.has(
            String(normalizeQuestionRecord(question).Subject || "").trim(),
          ),
        )
      ) {
        throw new Error("Password-protected questions remain in IndexedDB.");
      }
    }

    const subjects = [...decks.keys()];
    for (const subject of subjects) {
      await idbKeyval.set(
        getQuestionDeckStorageKey(subject),
        decks.get(subject),
      );
    }
    await idbKeyval.set(QUESTION_DATABASE_INDEX_KEY, subjects);
    if (legacyDatabase !== undefined) {
      await idbKeyval.del(LEGACY_QUESTION_DATABASE_KEY);
      if ((await idbKeyval.get(LEGACY_QUESTION_DATABASE_KEY)) !== undefined) {
        throw new Error("Unable to remove the legacy question database.");
      }
    }
    return migrationSource;
  }

  /** @typedef {{Subject?: string, ID?: string, Question?: string, Answer?: string}} MrhQuestion */
  /** @typedef {{db: MrhQuestion[], categorySummary: object[], accessMetadata: object, prefs: object, stats: object, session: object, currentPath: string[]}} MrhState */

  /**
   * Shared application state object used by the runtime and persisted to storage.
   * This module intentionally keeps the state contract explicit to avoid implicit
   * global lookups during startup and reload.
   *
   * @type {MrhState}
   */

  /** @type {MrhState} */
  const state = {
    db: [],
    categorySummary: [],
    accessMetadata: {},
    subjectIndex: {
      bySubject: new Map(),
      byId: new Map(),
    },
    stats: {
      totalAnswered: 0,
      correct: 0,
      mistakes: [],
      subjectAccuracy: {},
      completedQs: [],
      srsMap: {},
    },
    prefs: {
      darkMode: true,
      activeRecall: false,
      shuffleChoices: true,
      shuffleQuestions: true,
      hideABCD: true,
      quizHideABCD: true,
      deckSessionSettings: {},
      showWrongChoices: true,
      clozeEnabled: false,
      srsEnabled: false,
      archivedDecks: [],
      expandedArchivedPaths: [],
      databaseUpdateMode: "immediate",
      quizNavigationPosition: "top",
      quizNavigationMode: "manual",
      reviewNavigationPosition: "top",
      studySingleNavigationPosition: "top",
      studyScrollNavigationPosition: "both",
      deckNavigationOverrides: {},
      deckSortBy: "letters",
      deckSortDirection: "asc",
      deckNameMode: "wrap",
      textAlignment: "left",
      favoriteDecks: [],
      pinnedDecks: [],
      favoriteQuestions: [],
      studyFilterMode: "all",
      recentDecks: [],
      deletedDecks: [],
      localDownloadDeletedDecks: [],
      localDeckPayloadVersions: {},
      pendingDeckCachePurges: [],
      lastActivity: null,
    },
    session: {
      active: false,
      questions: [],
      currentIndex: 0,
      userAnswers: {},
      autoNextTimeout: null,
      revealedCloze: false,
    },
    currentPath: [],
    unlockedFolders: {},
  };
  function getStoredItem(key, fallback = null) {
    return StorageUtils.getStoredItem(key, fallback);
  }

  function getAnyNamespaceStoredItem(key, fallback = null) {
    return StorageUtils.getAnyNamespaceStoredItem(key, fallback);
  }

  function hasLockedDeckQuestions(value) {
    const session =
      typeof value === "string"
        ? StorageUtils.safeParseJSON(value, null)
        : value;
    if (!Array.isArray(session?.questions)) return false;
    const lockedSubjects = new Set(
      (state.categorySummary || [])
        .filter(isSummaryDeckLocked)
        .map((deck) => String(deck.Subject || "").trim())
        .filter(Boolean),
    );
    return session.questions.some((question) =>
      lockedSubjects.has(String(question?.Subject || "").trim()),
    );
  }

  function rejectLockedDeckSessionWrite(key, value) {
    if (key !== "saved_session" || !hasLockedDeckQuestions(value)) {
      return null;
    }
    if (!StorageUtils.removeStoredItem(key)) {
      DebugUtils.error(
        "Unable to remove saved progress containing password-protected deck questions.",
      );
      globalScope.showToast?.(
        "Unable to remove locally saved progress for a password-protected deck.",
        "error",
      );
      return false;
    }
    return true;
  }

  function setStoredItem(key, value) {
    const lockedWriteResult = rejectLockedDeckSessionWrite(key, value);
    if (lockedWriteResult !== null) return lockedWriteResult;
    return StorageUtils.setStoredItem(key, value);
  }

  function removeStoredItem(key) {
    return StorageUtils.removeStoredItem(key);
  }

  function getStoredJSON(key, fallback = null) {
    return StorageUtils.getStoredJSON(key, fallback);
  }

  function setStoredJSON(key, value) {
    const lockedWriteResult = rejectLockedDeckSessionWrite(key, value);
    if (lockedWriteResult !== null) return lockedWriteResult;
    try {
      return StorageUtils.setStoredJSON(key, value);
    } catch (error) {
      return false;
    }
  }

  function encodeNavigationSegment(value) {
    return encodeURIComponent(String(value || "")).replace(/%20/g, "+");
  }

  function decodeNavigationSegment(value) {
    return decodeURIComponent(String(value || "").replace(/\+/g, " "));
  }

  function getAppBasePath() {
    const configuredPath =
      rootScope.MRH_CONFIG?.appBasePath || rootScope.__MRH_APP_BASE_PATH || "/";
    const rawPath = String(configuredPath).trim() || "/";
    const pathOnly = rawPath.split(/[?#]/, 1)[0] || "/";
    const withLeadingSlash = pathOnly.startsWith("/")
      ? pathOnly
      : `/${pathOnly}`;
    const normalized = withLeadingSlash.replace(/\/+/g, "/");
    return normalized === "/" ? "/" : `${normalized.replace(/\/+$/, "")}/`;
  }

  function getHashNavigationSegments() {
    const hash = String(window.location.hash || "");
    if (!hash.startsWith("#/")) return [];
    return hash.slice(2).split("/").filter(Boolean);
  }

  function getQueryNavigationSegments() {
    const search = String(window.location.search || "").replace(/^\?/, "");
    if (!search) return null;
    const searchParams = new URLSearchParams(search);
    const legacyRoute = searchParams.get("mrhRoute");
    const firstParameter = search.split("&", 1)[0];
    const isBareRoute =
      firstParameter.length > 0 &&
      (!firstParameter.includes("=") ||
        (firstParameter.endsWith("=") &&
          Array.from(searchParams.values()).every((value) => value === "")));
    const route =
      legacyRoute !== null
        ? legacyRoute
        : isBareRoute
          ? firstParameter.replace(/=$/, "")
          : null;
    if (route === null) return null;
    let segments;
    try {
      const decodedRoute =
        legacyRoute === null
          ? decodeURIComponent(route.replace(/\+/g, " "))
          : route;
      segments = decodedRoute
        .split("/")
        .filter(Boolean)
        .map((segment) =>
          legacyRoute === null ? segment : decodeNavigationSegment(segment),
        );
    } catch (error) {
      console.warn("Invalid legacy navigation route.", error);
      segments = [];
    }

    searchParams.delete("mrhRoute");
    const remainingParameters = [];
    searchParams.forEach((value, key) => {
      if (value !== "") remainingParameters.push([key, value]);
    });
    const remainingSearch = new URLSearchParams(remainingParameters).toString();
    const usesDynamicPath = window.location.protocol !== "file:";
    const basePath = getAppBasePath();
    const routePath = segments
      .map((segment) => encodeNavigationSegment(segment))
      .join("/");
    const pathname = usesDynamicPath
      ? routePath
        ? `${basePath}${routePath}`
        : basePath
      : window.location.pathname;
    const queryParts = remainingSearch ? [remainingSearch] : [];
    const hash = String(window.location.hash || "");
    const nextUrl = `${pathname}${
      queryParts.length ? `?${queryParts.join("&")}` : ""
    }${hash.startsWith("#/") ? "" : hash}`;
    try {
      window.history.replaceState(
        {
          ...(window.history.state && typeof window.history.state === "object"
            ? window.history.state
            : {}),
          mrhPath: segments,
        },
        "",
        nextUrl,
      );
    } catch (error) {
      if (window.location.protocol !== "file:") throw error;
      try {
        window.sessionStorage.setItem(
          "mrhNavigationPath",
          JSON.stringify(segments),
        );
      } catch (storageError) {
        console.warn(
          "Unable to persist legacy local-file navigation state.",
          storageError,
        );
        throw error;
      }
      window.location.href = nextUrl;
    }
    return segments;
  }

  function getNavigationUrlSegments() {
    if (typeof window === "undefined" || !window.location) return [];

    const querySegments = getQueryNavigationSegments();
    if (querySegments !== null) return querySegments.slice();

    if (Array.isArray(rootScope.__MRH_INITIAL_NAVIGATION_PATH)) {
      const initialSegments = rootScope.__MRH_INITIAL_NAVIGATION_PATH;
      rootScope.__MRH_INITIAL_NAVIGATION_PATH = null;
      return initialSegments.filter(
        (segment) => typeof segment === "string" && segment.trim(),
      );
    }

    const historySegments = window.history?.state?.mrhPath;
    if (Array.isArray(historySegments)) {
      return historySegments.filter(
        (segment) => typeof segment === "string" && segment.trim(),
      );
    }

    const isLocalFile = window.location.protocol === "file:";
    const source = isLocalFile
      ? window.location.hash.replace(/^#\/?/, "")
      : window.location.pathname;
    const segments = source.split("/").filter(Boolean);
    if (isLocalFile) {
      try {
        return segments
          .map((segment) => decodeNavigationSegment(segment))
          .filter(Boolean);
      } catch (error) {
        console.warn("Invalid navigation URL segment.", error);
        return null;
      }
    }

    const basePath = getAppBasePath();
    const baseSegments = basePath.split("/").filter(Boolean);
    const baseMatches = baseSegments.every(
      (segment, index) => segments[index] === segment,
    );
    if (!baseMatches) return [];
    segments.splice(0, baseSegments.length);
    if (segments[0] === "index.html" || segments[0] === "index.htm") {
      segments.shift();
    }
    if (segments.length === 0) segments.push(...getHashNavigationSegments());
    if (["index.html", "index.htm"].includes(segments.at(-1)?.toLowerCase())) {
      segments.pop();
    }

    try {
      return segments
        .map((segment) => decodeNavigationSegment(segment))
        .filter(Boolean);
    } catch (error) {
      console.warn("Invalid navigation URL segment.", error);
      return null;
    }
  }

  function getNavigationPathFromUrl() {
    const segments = getNavigationUrlSegments();
    if (segments === null) return null;

    const finalSegment = String(segments.at(-1) || "").toLowerCase();
    if (finalSegment === "study" || finalSegment === "quiz") {
      segments.pop();
      if (segments.length > 0) segments.pop();
    }
    if (
      segments.length === 1 &&
      ["dashboard", "materials", "portal", "resources"].includes(
        segments[0].toLowerCase(),
      )
    ) {
      segments[0] = "resources";
    }
    return segments;
  }

  function getSessionNavigationFromUrl() {
    const segments = getNavigationUrlSegments();
    if (!Array.isArray(segments)) return null;
    const finalSegment = String(segments.at(-1) || "").toLowerCase();
    if (finalSegment !== "study" && finalSegment !== "quiz") return null;
    return {
      mode: finalSegment,
      subject: segments.slice(0, -1).join("::"),
    };
  }

  function updateNavigationUrl(path, options = {}) {
    if (typeof window === "undefined" || !window.history) return;

    const normalized = Array.isArray(path)
      ? path.filter((entry) => typeof entry === "string" && entry.trim())
      : [];
    const basePath = getAppBasePath();
    const routeSegments =
      normalized.length === 1 &&
      ["resources", "dashboard"].includes(normalized[0].toLowerCase())
        ? normalized[0].toLowerCase() === "resources"
          ? ["materials"]
          : []
        : normalized;
    const usesDynamicPath = window.location.protocol !== "file:";
    const route = routeSegments
      .map((entry) => encodeNavigationSegment(entry.trim()))
      .join("/");
    const rawSearch = String(window.location.search || "").replace(/^\?/, "");
    const searchParams = new URLSearchParams(rawSearch);
    searchParams.delete("mrhRoute");
    const remainingParameters = [];
    searchParams.forEach((value, key) => {
      if (value !== "") remainingParameters.push([key, value]);
    });
    const remainingSearch = new URLSearchParams(remainingParameters).toString();
    const pathname = usesDynamicPath
      ? route
        ? `${basePath}${route}`
        : basePath
      : window.location.pathname;
    const queryParts = remainingSearch.split("&").filter(Boolean);
    const nextUrl = `${pathname}${
      queryParts.length ? `?${queryParts.join("&")}` : ""
    }`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const currentPath = window.history.state?.mrhPath;
    const pathChanged =
      !Array.isArray(currentPath) ||
      currentPath.length !== routeSegments.length ||
      currentPath.some((segment, index) => segment !== routeSegments[index]);

    if (nextUrl !== currentUrl || pathChanged) {
      if (!usesDynamicPath) {
        try {
          window.sessionStorage.setItem(
            "mrhNavigationPath",
            JSON.stringify(routeSegments),
          );
        } catch (error) {
          console.warn(
            "Unable to persist local-file navigation state for refresh.",
            error,
          );
        }
      }
      const updateHistory = options.replace
        ? window.history.replaceState
        : window.history.pushState;
      const nextState = {
        ...(window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : {}),
        mrhPath: routeSegments,
      };
      try {
        updateHistory.call(window.history, nextState, "", nextUrl);
      } catch (error) {
        if (window.location.protocol !== "file:") throw error;
        try {
          window.sessionStorage.setItem(
            "mrhNavigationPath",
            JSON.stringify(routeSegments),
          );
        } catch (storageError) {
          console.warn(
            "Unable to persist local-file navigation state.",
            storageError,
          );
          throw error;
        }
        window.location.href = new URL(nextUrl, window.location.href).href;
      }
    }
  }

  function updateSessionNavigationUrl(subject, mode, options = {}) {
    const requestedMode = String(mode || "").toLowerCase();
    const normalizedMode =
      requestedMode === "study" || requestedMode === "review"
        ? "study"
        : "quiz";
    const currentPath = Array.isArray(state.currentPath)
      ? state.currentPath.filter(
          (entry) => typeof entry === "string" && entry.trim(),
        )
      : [];
    const subjectSegments = String(subject || "")
      .split("::")
      .map((segment) => segment.trim())
      .filter(Boolean);

    let sessionPath;
    if (subjectSegments.length > 0) {
      const currentPathMatchesSubject = currentPath.every(
        (segment, index) => subjectSegments[index] === segment,
      );
      sessionPath =
        currentPathMatchesSubject || subjectSegments.length > 1
          ? subjectSegments
          : [...currentPath, subjectSegments.at(-1)];
    } else {
      sessionPath = [...currentPath, "session"];
    }
    updateNavigationUrl([...sessionPath, normalizedMode], options);
  }

  let navigationChangeInFlight = false;

  async function handleNavigationUrlChange() {
    if (navigationChangeInFlight) return;

    const urlPath = getNavigationPathFromUrl();
    if (urlPath === null) return;
    const sessionRoute = getSessionNavigationFromUrl();
    if (sessionRoute) {
      const activeView =
        typeof document !== "undefined"
          ? document.querySelector(".view-section.active")?.id
          : "";
      const isActiveSessionView =
        sessionRoute.mode === "quiz"
          ? activeView === "view-practice" && state.session?.active
          : activeView === "view-deck-review";
      if (isActiveSessionView) {
        state.currentPath = urlPath;
      }
      return;
    }
    const isSettingsRoute =
      urlPath.length === 1 && urlPath[0].toLowerCase() === "settings";
    const isLibraryRoute =
      urlPath.length === 1 && urlPath[0].toLowerCase() === "library";
    const isProfileRoute =
      urlPath.length === 1 && urlPath[0].toLowerCase() === "profile";
    const isResourcesRoute =
      urlPath.length === 1 && urlPath[0].toLowerCase() === "resources";
    const isPortalRoute = isLibraryRoute || isProfileRoute || isResourcesRoute;
    const isSpecialRoute = isSettingsRoute || isPortalRoute;
    const targetPortalMode = isLibraryRoute
      ? "academic"
      : isProfileRoute
        ? "profile"
        : isResourcesRoute
          ? "student"
          : null;
    const targetView = isSettingsRoute
      ? "settings"
      : isPortalRoute
        ? isLibraryRoute
          ? "library"
          : "resources"
        : "dashboard";
    const activePortalMode =
      typeof document !== "undefined"
        ? document.querySelector(".resource-dashboard-layout")?.dataset
            .portalMode || "student"
        : "student";
    const previousView =
      typeof document !== "undefined"
        ? document
            .querySelector(".view-section.active")
            ?.id.replace(/^view-/, "")
        : "";
    const previousPath = Array.isArray(state.currentPath)
      ? [...state.currentPath]
      : [];
    const previousRoute =
      previousView === "settings"
        ? ["settings"]
        : previousView === "resources"
          ? [
              activePortalMode === "academic"
                ? "library"
                : activePortalMode === "profile"
                  ? "profile"
                  : "resources",
            ]
          : previousPath;

    if (
      previousView === targetView &&
      (!targetPortalMode || targetPortalMode === activePortalMode)
    ) {
      if (!isSpecialRoute) {
        state.currentPath = urlPath;
        globalScope.renderCategoryProgress?.();
      }
      return;
    }

    if (typeof globalScope.navigate !== "function") return;

    navigationChangeInFlight = true;
    try {
      const navigationId = isProfileRoute ? "profile" : targetView;
      const navigated = await globalScope.navigate(navigationId);
      if (navigated !== true) {
        if (previousView === "practice" && state.session?.active) {
          const subject =
            state.session.questions?.[state.session.currentIndex]?.Subject;
          updateSessionNavigationUrl(subject, "quiz", { replace: true });
        } else if (previousView === "deck-review") {
          updateSessionNavigationUrl(
            state.prefs?.lastActivity?.subject,
            "study",
            { replace: true },
          );
        } else {
          updateNavigationUrl(previousRoute, { replace: true });
        }
        return;
      }

      state.currentPath = isSettingsRoute
        ? []
        : isPortalRoute
          ? previousPath
          : urlPath;
      if (!isSpecialRoute) globalScope.renderCategoryProgress?.();
    } finally {
      navigationChangeInFlight = false;
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("hashchange", handleNavigationUrlChange);
    window.addEventListener("popstate", handleNavigationUrlChange);
  }

  function getSessionStoredItem(key, fallback = null) {
    return StorageUtils.getSessionStoredItem(key, fallback);
  }

  function setSessionStoredItem(key, value) {
    return StorageUtils.setSessionStoredItem(key, value);
  }

  function removeSessionStoredItem(key) {
    return StorageUtils.removeSessionStoredItem(key);
  }

  function getSessionStoredJSON(key, fallback = null) {
    return StorageUtils.getSessionStoredJSON(key, fallback);
  }

  function setSessionStoredJSON(key, value) {
    return StorageUtils.setSessionStoredJSON(key, value);
  }

  function migrateLegacyStorageKeys() {
    return StorageUtils.migrateLegacyStorageKeys();
  }

  function purgeOrphanedStorage(identityToKeep = null) {
    return StorageUtils.purgeOrphanedStorage(identityToKeep);
  }

  function firstAvailableValue(...values) {
    for (const value of values) {
      if (value === null || value === undefined) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      return value;
    }
    return "";
  }

  function normalizeQuestionRecord(question, subjectOverride = null) {
    if (!question || typeof question !== "object") return {};

    const source = Array.isArray(question)
      ? {
          i: question[0],
          q: question[1],
          c: question[2],
          a: question[3],
          t: question[4],
          ...(question[5] != null ? { e: question[5] } : {}),
          ...(question[6] != null ? { u: question[6] } : {}),
        }
      : question;
    const choices = Array.isArray(source.c) ? source.c : null;
    const normalized = {
      Subject: firstAvailableValue(subjectOverride, source.Subject, source.s),
      ID: firstAvailableValue(source.ID, source.i),
      Question: firstAvailableValue(source.Question, source.q),
      ChoiceA: firstAvailableValue(source.ChoiceA, choices?.[0]),
      ChoiceB: firstAvailableValue(source.ChoiceB, choices?.[1]),
      ChoiceC: firstAvailableValue(source.ChoiceC, choices?.[2]),
      ChoiceD: firstAvailableValue(source.ChoiceD, choices?.[3]),
      ChoiceE: firstAvailableValue(source.ChoiceE, choices?.[4]),
      Answer: firstAvailableValue(source.Answer, source.a),
      Explanation: firstAvailableValue(source.Explanation, source.e),
      ImageURL: firstAvailableValue(source.ImageURL, source.u),
      QuestionType: firstAvailableValue(source.QuestionType, source.t),
    };

    if (typeof normalized.Answer === "number") {
      normalized.Answer = ["A", "B", "C", "D", "E"][normalized.Answer] || "";
    }

    if (normalized.Answer) {
      normalized.Answer = String(normalized.Answer).trim().toUpperCase();
    }

    return normalized;
  }

  function rebuildQuestionIndex() {
    const index = { bySubject: new Map(), byId: new Map() };
    for (const question of state.db || []) {
      addQuestionToIndex(question, index);
    }
    state.subjectIndex = index;
    return state.subjectIndex;
  }

  function addQuestionToIndex(question, index) {
    if (!question || typeof question !== "object") return;

    // The database is normalized on load. Re-normalize only legacy/unshaped
    // records instead of allocating a new object for every indexed question.
    const normalized =
      question.Subject !== undefined && question.ID !== undefined
        ? question
        : normalizeQuestionRecord(question);

    const subject = String(normalized.Subject || "").trim();
    const id = String(normalized.ID || "").trim();

    if (subject) {
      let subjectList = index.bySubject.get(subject);
      if (!subjectList) {
        subjectList = [];
        index.bySubject.set(subject, subjectList);
      }
      if (id) subjectList.push(id);
    }

    if (id) index.byId.set(id, normalized);
  }

  const DATABASE_INITIALIZATION_BATCH_SIZE = 300;
  let databaseReady = false;
  let databaseReadyPromise = Promise.resolve(false);

  function getPerformanceNow() {
    return globalScope.performance?.now?.() ?? Date.now();
  }

  function yieldToMainThread() {
    return new Promise((resolve) => {
      lifecycle.setTimeout(resolve, 0);
    });
  }

  async function processDatabaseInBatches(items, processItem) {
    for (let index = 0; index < items.length; index += 1) {
      processItem(items[index], index);
      if (
        index > 0 &&
        (index + 1) % DATABASE_INITIALIZATION_BATCH_SIZE === 0 &&
        index + 1 < items.length
      ) {
        await yieldToMainThread();
      }
    }
  }

  function ensureQuestionIndex() {
    if (!state.subjectIndex || !state.subjectIndex.bySubject) {
      return rebuildQuestionIndex();
    }
    return state.subjectIndex;
  }

  function getQuestionsForSubject(subject, customFilter = null) {
    const index = ensureQuestionIndex();
    const targetSubject = String(subject || "").trim();
    if (!targetSubject) return [];

    const ids = index.bySubject.get(targetSubject) || [];
    const questions = ids
      .map((id) => index.byId.get(String(id)))
      .filter(Boolean);

    if (typeof customFilter === "function") {
      return questions.filter(customFilter);
    }

    return questions;
  }

  function normalizeCacheVersion(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function cloneStoredValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function storedValuesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function mergeSetArray(base, local, remote) {
    const keyOf = (value) => JSON.stringify(value);
    const baseKeys = new Set(base.map(keyOf));
    const localKeys = new Set(local.map(keyOf));
    const localRemoved = new Set(
      base.filter((value) => !localKeys.has(keyOf(value))).map(keyOf),
    );
    const merged = remote.filter((value) => !localRemoved.has(keyOf(value)));
    const mergedKeys = new Set(merged.map(keyOf));

    local.forEach((value) => {
      const key = keyOf(value);
      if (!baseKeys.has(key) && !mergedKeys.has(key)) {
        merged.push(value);
        mergedKeys.add(key);
      }
    });
    return merged;
  }

  function mergeStoredStateValue(key, base, local, remote, path = key) {
    if (storedValuesEqual(local, base)) return cloneStoredValue(remote);
    if (storedValuesEqual(remote, base)) return cloneStoredValue(local);

    const isRecord =
      local !== null &&
      typeof local === "object" &&
      !Array.isArray(local) &&
      remote !== null &&
      typeof remote === "object" &&
      !Array.isArray(remote);
    const timestampOf = (value, field) => {
      const timestamp = Number(value?.[field]);
      return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
    };
    const selectNewerRecord = (field) => {
      const localTimestamp = timestampOf(local, field);
      const remoteTimestamp = timestampOf(remote, field);
      if (localTimestamp !== remoteTimestamp) {
        return cloneStoredValue(
          localTimestamp > remoteTimestamp ? local : remote,
        );
      }
      return cloneStoredValue(
        JSON.stringify(local) >= JSON.stringify(remote) ? local : remote,
      );
    };

    // Conflicting whole-record updates use their event time; a stable tie-break
    // makes tabs converge even when both edits share the same millisecond.
    if (isRecord && key === "stats" && path.startsWith("stats.srsMap.")) {
      return selectNewerRecord("lastAnsweredAt");
    }
    if (
      isRecord &&
      key === "prefs" &&
      path.startsWith("prefs.studyProgress.")
    ) {
      return selectNewerRecord("updatedAt");
    }

    if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
      if (
        key === "stats" &&
        ["stats.mistakes", "stats.completedQs"].includes(path)
      ) {
        return mergeSetArray(base, local, remote);
      }
      return cloneStoredValue(local);
    }

    const isStatsCounter =
      key === "stats" &&
      (["stats.totalAnswered", "stats.correct"].includes(path) ||
        /^stats\.subjectAccuracy\.[^.]+\.(total|correct)$/.test(path));
    if (isStatsCounter) {
      const baseNumber = Number.isFinite(Number(base)) ? Number(base) : 0;
      const delta = Number(local) - baseNumber;
      if (Number.isFinite(delta) && Number.isFinite(Number(remote))) {
        return Math.max(0, Number(remote) + delta);
      }
    }

    const baseIsObject =
      base !== null && typeof base === "object" && !Array.isArray(base);
    const localIsObject =
      local !== null && typeof local === "object" && !Array.isArray(local);
    const remoteIsObject =
      remote !== null && typeof remote === "object" && !Array.isArray(remote);

    if (
      localIsObject &&
      remoteIsObject &&
      (baseIsObject || base === null || base === undefined)
    ) {
      const baseObject = baseIsObject ? base : {};
      const merged = {};
      const keys = new Set([
        ...Object.keys(baseObject),
        ...Object.keys(local),
        ...Object.keys(remote),
      ]);
      keys.forEach((childKey) => {
        const childPath = `${path}.${childKey}`;
        const value = mergeStoredStateValue(
          key,
          baseObject[childKey],
          local[childKey],
          remote[childKey],
          childPath,
        );
        if (value !== undefined) merged[childKey] = value;
      });
      return merged;
    }

    return cloneStoredValue(local);
  }

  function coerceBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off"].includes(normalized)) return false;
    }
    return fallback;
  }

  function normalizeCategorySummary(rawSummary) {
    if (!Array.isArray(rawSummary)) return [];
    return rawSummary
      .filter((entry) => entry && typeof entry === "object")
      .slice(0, MAX_CATEGORY_SUMMARY_ENTRIES);
  }

  function isSummaryDeckLocked(deck) {
    return (
      deck?.Locked === true ||
      String(deck?.Locked || "")
        .trim()
        .toLowerCase() === "true"
    );
  }

  function normalizeStats(rawStats) {
    const source =
      rawStats && typeof rawStats === "object" && !Array.isArray(rawStats)
        ? rawStats
        : {};

    const subjectAccuracy = Object.create(null);
    const rawSubjectAccuracy =
      source.subjectAccuracy &&
      typeof source.subjectAccuracy === "object" &&
      !Array.isArray(source.subjectAccuracy)
        ? source.subjectAccuracy
        : {};

    for (const [key, value] of Object.entries(rawSubjectAccuracy)) {
      if (!key) continue;

      if (value && typeof value === "object" && !Array.isArray(value)) {
        subjectAccuracy[key] = {
          total: Math.max(0, Number(value.total) || 0),
          correct: Math.max(0, Number(value.correct) || 0),
        };
      } else if (typeof value === "number" || typeof value === "string") {
        // Backward compatibility for older percentage/number-shaped data.
        const numeric = Math.max(0, Number(value) || 0);
        subjectAccuracy[key] = { total: 0, correct: numeric };
      }
    }

    return {
      totalAnswered: Number.isFinite(Number(source.totalAnswered))
        ? Math.max(0, Number(source.totalAnswered))
        : 0,
      correct: Number.isFinite(Number(source.correct))
        ? Math.max(0, Number(source.correct))
        : 0,
      mistakes: Array.isArray(source.mistakes)
        ? source.mistakes.filter(
            (entry) => entry !== null && entry !== undefined,
          )
        : [],
      subjectAccuracy,
      completedQs: Array.isArray(source.completedQs)
        ? source.completedQs.filter(
            (entry) => entry !== null && entry !== undefined,
          )
        : [],
      srsMap:
        source.srsMap &&
        typeof source.srsMap === "object" &&
        !Array.isArray(source.srsMap)
          ? Object.fromEntries(
              Object.entries(source.srsMap).filter(
                ([key]) => key !== "__proto__",
              ),
            )
          : {},
    };
  }

  function normalizePrefs(rawPrefs) {
    const source =
      rawPrefs && typeof rawPrefs === "object" && !Array.isArray(rawPrefs)
        ? rawPrefs
        : {};

    const normalized = {
      ...state.prefs,
      ...source,
    };

    normalized.darkMode = coerceBoolean(normalized.darkMode, true);
    normalized.activeRecall = coerceBoolean(normalized.activeRecall, false);
    normalized.shuffleChoices = coerceBoolean(normalized.shuffleChoices, true);
    normalized.shuffleQuestions = coerceBoolean(
      normalized.shuffleQuestions,
      true,
    );
    normalized.hideABCD = coerceBoolean(normalized.hideABCD, true);
    normalized.quizHideABCD = coerceBoolean(normalized.quizHideABCD, true);
    normalized.showWrongChoices = coerceBoolean(
      normalized.showWrongChoices,
      true,
    );
    normalized.clozeEnabled = coerceBoolean(normalized.clozeEnabled, false);
    normalized.srsEnabled = coerceBoolean(normalized.srsEnabled, false);
    normalized.deckSessionSettings =
      normalized.deckSessionSettings &&
      typeof normalized.deckSessionSettings === "object" &&
      !Array.isArray(normalized.deckSessionSettings)
        ? Object.fromEntries(
            Object.entries(normalized.deckSessionSettings)
              .filter(
                ([deck, settings]) =>
                  deck !== "__proto__" &&
                  settings &&
                  typeof settings === "object" &&
                  !Array.isArray(settings),
              )
              .map(([deck, settings]) => [
                deck,
                Object.fromEntries(
                  ["quiz", "study"]
                    .filter(
                      (mode) =>
                        settings[mode] &&
                        typeof settings[mode] === "object" &&
                        !Array.isArray(settings[mode]),
                    )
                    .map((mode) => [
                      mode,
                      Object.fromEntries(
                        Object.entries(settings[mode]).filter(
                          ([key]) => key !== "__proto__",
                        ),
                      ),
                    ]),
                ),
              ]),
          )
        : {};
    delete normalized.layoutMode;
    delete normalized.treeCollapsedPaths;
    normalized.deckSourceFilter = ["all", "favorites", "archived"].includes(
      normalized.deckSourceFilter,
    )
      ? normalized.deckSourceFilter
      : "all";
    normalized.textAlignment = ["left", "center", "right", "justify"].includes(
      normalized.textAlignment,
    )
      ? normalized.textAlignment
      : "left";

    normalized.archivedDecks = Array.isArray(normalized.archivedDecks)
      ? normalized.archivedDecks.filter((entry) => typeof entry === "string")
      : [];
    normalized.expandedArchivedPaths = Array.isArray(
      normalized.expandedArchivedPaths,
    )
      ? normalized.expandedArchivedPaths.filter(
          (entry) => typeof entry === "string",
        )
      : [];
    normalized.favoriteDecks = Array.isArray(normalized.favoriteDecks)
      ? normalized.favoriteDecks.filter((entry) => typeof entry === "string")
      : [];
    normalized.pinnedDecks = Array.isArray(normalized.pinnedDecks)
      ? normalized.pinnedDecks.filter((entry) => typeof entry === "string")
      : [];
    normalized.favoriteQuestions = Array.isArray(normalized.favoriteQuestions)
      ? normalized.favoriteQuestions.filter(
          (entry) => typeof entry === "string",
        )
      : [];
    normalized.recentDecks = Array.isArray(normalized.recentDecks)
      ? normalized.recentDecks.filter((entry) => typeof entry === "string")
      : [];
    normalized.deletedDecks = Array.isArray(normalized.deletedDecks)
      ? normalized.deletedDecks.filter((entry) => typeof entry === "string")
      : [];
    normalized.localDownloadDeletedDecks = Array.isArray(
      normalized.localDownloadDeletedDecks,
    )
      ? normalized.localDownloadDeletedDecks.filter(
          (entry) => typeof entry === "string",
        )
      : [];
    normalized.localDeckPayloadVersions =
      normalized.localDeckPayloadVersions &&
      typeof normalized.localDeckPayloadVersions === "object" &&
      !Array.isArray(normalized.localDeckPayloadVersions)
        ? Object.fromEntries(
            Object.entries(normalized.localDeckPayloadVersions).filter(
              ([subject, version]) =>
                subject !== "__proto__" &&
                typeof subject === "string" &&
                /^[a-f0-9]{64}$/i.test(String(version || "")),
            ),
          )
        : {};

    const canonicalDeckNameMode = ["wrap", "clip"].includes(
      normalized.deckNameMode,
    )
      ? normalized.deckNameMode
      : ["wrap", "clip"].includes(normalized.titleMode)
        ? normalized.titleMode
        : "wrap";

    normalized.deckNameMode = canonicalDeckNameMode;
    normalized.titleMode = canonicalDeckNameMode;
    normalized.databaseUpdateMode = ["idle", "immediate"].includes(
      normalized.databaseUpdateMode,
    )
      ? normalized.databaseUpdateMode
      : "idle";
    normalized.quizNavigationPosition = ["top", "bottom", "auto"].includes(
      normalized.quizNavigationPosition,
    )
      ? normalized.quizNavigationPosition
      : "top";
    normalized.reviewNavigationPosition = ["top", "bottom"].includes(
      normalized.reviewNavigationPosition,
    )
      ? normalized.reviewNavigationPosition
      : "top";
    normalized.quizNavigationMode = ["manual", "auto"].includes(
      normalized.quizNavigationMode,
    )
      ? normalized.quizNavigationMode
      : "manual";
    normalized.studySingleNavigationPosition = [
      "top",
      "bottom",
      "auto",
    ].includes(normalized.studySingleNavigationPosition)
      ? normalized.studySingleNavigationPosition
      : "top";
    normalized.studyScrollNavigationPosition = [
      "top",
      "bottom",
      "both",
    ].includes(normalized.studyScrollNavigationPosition)
      ? normalized.studyScrollNavigationPosition
      : "both";
    normalized.lastActivity =
      normalized.lastActivity && typeof normalized.lastActivity === "object"
        ? normalized.lastActivity
        : null;
    const pendingDeckCachePurges = Array.isArray(
      normalized.pendingDeckCachePurges,
    )
      ? normalized.pendingDeckCachePurges
          .map((subject) => String(subject || "").trim())
          .filter(Boolean)
      : [];
    normalized.pendingDeckCachePurges = [...new Set(pendingDeckCachePurges)];

    return normalized;
  }

  function syncPreferenceControls() {
    if (typeof document === "undefined") return;
    const isStudyActive = document
      .getElementById("view-deck-review")
      ?.classList.contains("active");
    const isQuizActive = Boolean(state.session?.active);
    const isSettingsPage = document
      .getElementById("view-settings")
      ?.classList.contains("active");
    const sessionMode = isStudyActive ? "study" : isQuizActive ? "quiz" : null;
    const deckSubject = sessionMode
      ? sessionMode === "study"
        ? globalScope.getCurrentReviewSubject?.() || ""
        : state.session.questions?.[state.session.currentIndex]?.Subject || ""
      : "";
    
    // On settings page, always use global preferences. In sessions, use deck-specific if available.
    const getSessionValue = (key) =>
      isSettingsPage
        ? state.prefs[key] // Settings page - ALWAYS show global
        : sessionMode
          ? (globalScope.getDeckSessionSetting?.(sessionMode, key, deckSubject) ??
            state.prefs[key]) // Session - use deck-specific or fall back to global
          : state.prefs[key]; // Not in session - use global

    const textAlignment = ["left", "center", "right", "justify"].includes(
      state.prefs.textAlignment,
    )
      ? state.prefs.textAlignment
      : "left";
    const textAlignmentSelect = document.getElementById(
      "text-alignment-select",
    );
    if (textAlignmentSelect) textAlignmentSelect.value = textAlignment;
    globalScope.applyTextAlignment?.(textAlignment);

    const controls = {
      "toggle-active-recall": getSessionValue("activeRecall") === true,
      "toggle-shuffle-choices": getSessionValue("shuffleChoices") !== false,
      "toggle-modal-shuffle-choices":
        getSessionValue("shuffleChoices") !== false,
      "toggle-shuffle-questions": getSessionValue("shuffleQuestions") !== false,
      "toggle-hide-abcd": getSessionValue("hideABCD") !== true,
      "toggle-quiz-hide-abcd": getSessionValue("quizHideABCD") !== true,
      "toggle-cloze-mode": getSessionValue("clozeEnabled") === true,
      "toggle-main-cloze-mode": getSessionValue("clozeEnabled") === true,
      "toggle-srs-mode": getSessionValue("srsEnabled") === true,
      "toggle-main-srs-mode": getSessionValue("srsEnabled") === true,
      "toggle-wrong-choices": getSessionValue("showWrongChoices") !== false,
      "toggle-study-show-answers":
        getSessionValue("studyShowAnswers") !== false,
      "toggle-quiz-show-explanations": getSessionValue("quizShowExplanations") !== false,
      "toggle-study-show-explanations": getSessionValue("studyShowExplanations") !== false,
      "toggle-show-explanations": getSessionValue("studyShowExplanations") !== false,
      "toggle-show-abcd": getSessionValue("hideABCD") === false,
      globalModeToggle: state.prefs.lastActivity?.mode === "review",
    };

    Object.entries(controls).forEach(([id, checked]) => {
      const control = document.getElementById(id);
      if (control) control.checked = checked;
    });

    globalScope.syncNavigationButtonLabels?.();

    const databaseUpdateMode = document.getElementById("database-update-mode");
    if (databaseUpdateMode) {
      databaseUpdateMode.value = state.prefs.databaseUpdateMode || "idle";
    }

    const deckNameMode = document.getElementById("deck-name-mode");
    if (deckNameMode) {
      deckNameMode.value = ["wrap", "clip"].includes(state.prefs.deckNameMode)
        ? state.prefs.deckNameMode
        : "wrap";
    }

    const modeLabel = document.getElementById("modeLabel");
    if (modeLabel) {
      modeLabel.textContent = controls.globalModeToggle ? "Study" : "Quiz";
    }

    const navigationSelect = document.getElementById(
      "navigation-position-select",
    );
    if (navigationSelect) {
      const reviewIsActive = document
        .getElementById("view-deck-review")
        ?.classList.contains("active");
      const navigationPosition = reviewIsActive
        ? globalScope.getStudyNavigationPosition?.(
            getSessionValue("studyLayout") || "scroll",
          )
        : globalScope.getQuizNavigationPosition?.();
      if (navigationPosition) navigationSelect.value = navigationPosition;
    }

    const sortBy = state.prefs.deckSortBy || "letters";
    const sortDirection =
      state.prefs.deckSortDirection === "desc" ? "desc" : "asc";
    const deckSortIcon = document.getElementById("deck-sort-icon");
    if (deckSortIcon) {
      deckSortIcon.className = `fa-solid fa-arrow-${sortDirection === "desc" ? "down" : "up"}`;
    }
    document
      .querySelectorAll(".deck-sort-option[data-sort-value]")
      .forEach((option) => {
        const check = option.querySelector(".sort-check");
        if (check)
          check.style.opacity = option.dataset.sortValue === sortBy ? "1" : "0";
      });
    document
      .querySelectorAll(".deck-sort-option[data-sort-direction]")
      .forEach((option) => {
        const check = option.querySelector(".sort-direction-check");
        if (check) {
          check.style.opacity =
            option.dataset.sortDirection === sortDirection ? "1" : "0";
        }
      });

    // Sync deck source filter
    const deckSourceFilter = state.prefs.deckSourceFilter || "all";
    const sourceLabels = {
      all: "All",
      favorites: "Favorites",
      archived: "Archived",
    };
    const deckSourceLabel = document.getElementById("deck-source-label");
    if (deckSourceLabel) {
      deckSourceLabel.innerText = sourceLabels[deckSourceFilter] || "All";
    }
    document.querySelectorAll(".deck-source-option").forEach((btn) => {
      const check = btn.querySelector(".source-check");
      const isSelected = btn.dataset.sourceValue === deckSourceFilter;
      if (check) check.style.opacity = isSelected ? "1" : "0";
    });

    const warning = document.getElementById("shuffle-warning");
    if (warning) {
      const shouldShowWarning =
        getSessionValue("shuffleChoices") === false ||
        getSessionValue("shuffleQuestions") === false;
      warning.classList.toggle("hidden", !shouldShowWarning);
      warning.setAttribute("aria-hidden", String(!shouldShowWarning));
    }
    
    // Sync question type dropdown
    const questionTypeSelect = document.getElementById("toggle-question-type");
    if (questionTypeSelect) {
      const qTypeValue = getSessionValue("qTypeOverride") || "auto";
      questionTypeSelect.value = qTypeValue;
    }
    
    globalScope.PreferencesCore?.syncSessionHeaderVisibility?.();
  }

  function updateDashboard() {
    if (typeof document === "undefined") return;

    const statTotal = document.getElementById("stat-total");
    if (statTotal) statTotal.textContent = String(state.stats.totalAnswered);

    const statCorrect = document.getElementById("stat-correct");
    if (statCorrect) statCorrect.textContent = String(state.stats.correct);

    const dbSize = document.getElementById("db-size-display");
    if (dbSize) dbSize.textContent = String(state.db.length);

    if (
      typeof globalScope.checkSavedSession === "function" &&
      typeof globalScope.SessionCore?.checkSavedSession === "function"
    ) {
      globalScope.checkSavedSession();
    }
    if (typeof globalScope.renderCategoryProgress === "function") {
      globalScope.renderCategoryProgress();
    }
  }

  async function initializeQuestionDatabase(
    savedDbPromise,
    lockedSubjects,
    initializationStartedAt,
    retrievalStartedAt,
    retrievalStartError,
  ) {
    const metrics = { initializationStartedAt };
    let savedDb = [];
    let retrievalError =
      retrievalStartError ||
      (typeof idbKeyval === "undefined"
        ? new Error("IndexedDB support is unavailable.")
        : null);
    if (savedDbPromise) {
      try {
        const storedValue = await savedDbPromise;
        savedDb = Array.isArray(storedValue) ? storedValue : [];
      } catch (error) {
        retrievalError = error;
        DebugUtils.error("Error loading DB from IndexedDB", error);
      }
    }
    metrics.indexedDbRetrievalMs = getPerformanceNow() - retrievalStartedAt;
    if (retrievalError) {
      if (typeof globalScope.emitDebugState === "function") {
        globalScope.emitDebugState("load_state:database_error", {
          stage: "indexedDbRetrieval",
          durationMs: metrics.indexedDbRetrievalMs,
        });
      }
      globalScope.showToast?.(
        "The saved question database could not be read. Review actions remain unavailable to protect local progress.",
        "error",
      );
      return false;
    }

    const normalizationStartedAt = getPerformanceNow();
    const database = [];
    await processDatabaseInBatches(savedDb, (question) => {
      const normalized = normalizeQuestionRecord(question);
      if (normalized.ID && !String(normalized.ID).includes("::")) {
        const cleanId = String(normalized.ID).replace(/^[a-zA-Z]+[-\s]?/, "");
        normalized.ID = `${normalized.Subject}::${cleanId}`;
      }
      if (lockedSubjects.has(String(normalized.Subject || "").trim())) {
        return;
      }
      database.push(normalized);
    });
    metrics.questionNormalizationMs =
      getPerformanceNow() - normalizationStartedAt;

    const indexStartedAt = getPerformanceNow();
    const subjectIndex = { bySubject: new Map(), byId: new Map() };
    await processDatabaseInBatches(database, (question) => {
      addQuestionToIndex(question, subjectIndex);
    });
    metrics.indexConstructionMs = getPerformanceNow() - indexStartedAt;

    state.db = database;
    state.subjectIndex = subjectIndex;
    databaseReady = true;
    const dbSizeEl =
      typeof document !== "undefined"
        ? document.getElementById("db-size-display")
        : null;
    if (dbSizeEl) dbSizeEl.textContent = String(database.length);
    if (typeof globalScope.emitDebugState === "function") {
      globalScope.emitDebugState("load_state:database_ready", {
        ...metrics,
        dbCount: database.length,
        indexedQuestionCount: subjectIndex.byId.size,
        totalInitializationMs:
          getPerformanceNow() - metrics.initializationStartedAt,
      });
    }
    return true;
  }

  async function loadState(options = {}) {
    const initializationStartedAt = getPerformanceNow();
    databaseReady = false;
    if (typeof globalScope.emitDebugState === "function") {
      globalScope.emitDebugState("load_state:start");
    }

    const localStorageStartedAt = getPerformanceNow();
    globalScope.migrateLegacyStorageKeys?.();

    // Start IndexedDB immediately so its async I/O overlaps the synchronous
    // local-storage parsing below.
    const indexedDbRetrievalStartedAt = getPerformanceNow();
    let savedDbPromise = null;
    let storedQuestionDeckIndexPromise = null;
    let indexedDbStartError = null;
    if (typeof idbKeyval !== "undefined") {
      try {
        storedQuestionDeckIndexPromise = idbKeyval.get(
          QUESTION_DATABASE_INDEX_KEY,
        );
      } catch (err) {
        indexedDbStartError = err;
        DebugUtils.error("Error starting DB load from IndexedDB", err);
      }
    }

    const savedStats = getStoredItem("stats");
    const savedPrefs = getStoredItem("prefs");
    const savedSummary =
      getStoredItem("summary") || getAnyNamespaceStoredItem("summary");
    const savedPath =
      typeof globalScope.readStoredNavigationPath === "function"
        ? globalScope.readStoredNavigationPath()
        : [];

    if (savedSummary) {
      const parsedSummary = StorageUtils.safeParseJSON(savedSummary, null);
      if (Array.isArray(parsedSummary)) {
        state.categorySummary = normalizeCategorySummary(parsedSummary);
      } else {
        DebugUtils.error("Summary corrupted, resetting.");
        state.categorySummary = [];
      }
    }

    if (savedStats) {
      const parsedStats = StorageUtils.safeParseJSON(savedStats, null);
      if (parsedStats && typeof parsedStats === "object") {
        state.stats = normalizeStats(parsedStats);
      } else {
        DebugUtils.error("Stats corrupted, resetting to default.");
        state.stats = {
          totalAnswered: 0,
          correct: 0,
          mistakes: [],
          subjectAccuracy: {},
          completedQs: [],
          srsMap: {},
        };
      }
    }

    if (savedPrefs) {
      const parsedPrefs = StorageUtils.safeParseJSON(savedPrefs, null);
      if (parsedPrefs && typeof parsedPrefs === "object") {
        state.prefs = normalizePrefs({
          ...state.prefs,
          ...parsedPrefs,
        });
      } else {
        DebugUtils.error("Invalid preferences.");
      }
    }

    const lockedSubjects = new Set(
      state.categorySummary
        .filter(isSummaryDeckLocked)
        .map((deck) => String(deck.Subject || "").trim())
        .filter(Boolean),
    );
    if (storedQuestionDeckIndexPromise) {
      savedDbPromise = loadQuestionDatabaseFromIndexedDB(
        lockedSubjects,
        storedQuestionDeckIndexPromise,
      );
    }
    const savedSession = getStoredItem("saved_session");
    if (savedSession && lockedSubjects.size > 0) {
      const parsedSession = StorageUtils.safeParseJSON(savedSession, null);
      const containsLockedDeck = (parsedSession?.questions || []).some(
        (question) =>
          lockedSubjects.has(String(question?.Subject || "").trim()),
      );
      if (containsLockedDeck && !removeStoredItem("saved_session")) {
        DebugUtils.error(
          "Unable to remove saved progress containing password-protected deck questions.",
        );
        globalScope.showToast?.(
          "Unable to remove locally saved progress for a password-protected deck.",
          "error",
        );
      }
    }

    const localStorageParsingMs = getPerformanceNow() - localStorageStartedAt;
    if (typeof globalScope.emitDebugState === "function") {
      globalScope.emitDebugState("load_state:stage", {
        stage: "localStorageParsing",
        durationMs: localStorageParsingMs,
      });
    }
    databaseReadyPromise = initializeQuestionDatabase(
      savedDbPromise,
      lockedSubjects,
      initializationStartedAt,
      indexedDbRetrievalStartedAt,
      indexedDbStartError,
    ).then(
      (ready) => {
        if (typeof globalScope.emitDebugState === "function") {
          globalScope.emitDebugState("load_state:complete", {
            dbCount: state.db.length,
            summaryCount: state.categorySummary.length,
            indexedQuestionCount: state.subjectIndex.byId.size,
            localStorageParsingMs,
            totalInitializationMs:
              getPerformanceNow() - initializationStartedAt,
          });
        }
        return ready;
      },
      (error) => {
        databaseReady = false;
        DebugUtils.error("Question database initialization failed.", error);
        globalScope.showToast?.(
          "The saved question database could not be initialized. Reload the app or reconnect to restore review actions.",
          "error",
        );
        return false;
      },
    );

    if (
      !["top", "bottom", "auto"].includes(state.prefs.quizNavigationPosition)
    ) {
      state.prefs.quizNavigationPosition = "top";
    }
    if (!["top", "bottom"].includes(state.prefs.reviewNavigationPosition)) {
      state.prefs.reviewNavigationPosition = "top";
    }
    if (state.prefs.lastActivity?.mode) {
      globalScope.currentAppMode = state.prefs.lastActivity.mode;
    }

    persistedStateBaseline = {
      stats: cloneStoredValue(state.stats),
      prefs: cloneStoredValue(state.prefs),
    };

    if (!state.stats.subjectAccuracy) state.stats.subjectAccuracy = {};
    if (!["idle", "immediate"].includes(state.prefs.databaseUpdateMode)) {
      state.prefs.databaseUpdateMode = "idle";
    }
    if (typeof document !== "undefined" && document.documentElement) {
      const darkMode = state.prefs?.darkMode !== false;
      document.documentElement.classList.toggle("dark", darkMode);
      document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
    }

    const sessionRoute = getSessionNavigationFromUrl();
    const urlPath = getNavigationPathFromUrl();
    const hasInvalidUrl = urlPath === null;
    const isSettingsRoute =
      !hasInvalidUrl &&
      urlPath.length === 1 &&
      urlPath[0].toLowerCase() === "settings";
    const isLibraryRoute =
      !hasInvalidUrl &&
      urlPath.length === 1 &&
      urlPath[0].toLowerCase() === "library";
    const isProfileRoute =
      !hasInvalidUrl &&
      urlPath.length === 1 &&
      urlPath[0].toLowerCase() === "profile";
    const isResourcesRoute =
      !hasInvalidUrl &&
      urlPath.length === 1 &&
      urlPath[0].toLowerCase() === "resources";
    if (isSettingsRoute) {
      state.currentPath = [];
    } else if (isResourcesRoute || isLibraryRoute || isProfileRoute) {
      state.currentPath = savedPath;
    } else if (sessionRoute || (!hasInvalidUrl && urlPath.length > 0)) {
      state.currentPath = urlPath;
    } else {
      state.currentPath = savedPath;
    }
    if (isSettingsRoute) {
      await globalScope.navigate?.("settings");
    } else if (isLibraryRoute) {
      await globalScope.navigate?.("library");
    } else if (isProfileRoute) {
      await globalScope.navigate?.("profile");
    } else if (isResourcesRoute) {
      await globalScope.navigate?.("resources");
    } else if (!hasInvalidUrl && !sessionRoute) {
      updateNavigationUrl(state.currentPath, { replace: true });
    }

    if (typeof globalScope.populateFilters === "function") {
      globalScope.populateFilters();
    }
    if (typeof globalScope.updateDashboard === "function") {
      globalScope.updateDashboard();
    }
    if (typeof globalScope.updateThemeButton === "function") {
      globalScope.updateThemeButton();
    }
    syncPreferenceControls();

    if (typeof globalScope.emitDebugState === "function") {
      globalScope.emitDebugState("load_state:shell_ready", {
        localStorageParsingMs,
        databaseReady,
        summaryCount: state.categorySummary.length,
      });
    }
    if (options.deferDatabase !== true) await databaseReadyPromise;
  }

  function waitForDatabaseReady() {
    return databaseReadyPromise;
  }

  let stateSavePromise = null;
  let resolveStateSave = null;
  let stateSaveQueued = false;
  let stateSaveFlushing = false;
  let stateSaveSucceeded = true;
  let statePersistenceStopped = false;
  let pendingSaveMask = 0;

  const SAVE_STATS = 1;
  const SAVE_PREFS = 2;
  const SAVE_SUMMARY = 4;
  const SAVE_PATH = 8;
  const SAVE_ALL = SAVE_STATS | SAVE_PREFS | SAVE_SUMMARY | SAVE_PATH;
  let persistedStateBaseline = {
    stats: cloneStoredValue(state.stats),
    prefs: cloneStoredValue(state.prefs),
  };

  async function persistMergedState(key) {
    const baseline = persistedStateBaseline[key];
    const localValue = cloneStoredValue(state[key]);
    const result = await StorageUtils.mergeStoredJSON(
      key,
      localValue,
      (storedValue) =>
        mergeStoredStateValue(
          key,
          baseline,
          localValue,
          storedValue ?? baseline,
        ),
    );

    if (result.saved) {
      const latestLocalValue = state[key];
      state[key] = storedValuesEqual(latestLocalValue, localValue)
        ? result.value
        : mergeStoredStateValue(
            key,
            localValue,
            latestLocalValue,
            result.value,
          );
      persistedStateBaseline[key] = cloneStoredValue(result.value);
    }
    return result.saved;
  }

  async function flushStateSave() {
    if (stateSaveFlushing || !stateSaveQueued || !stateSavePromise) return;
    stateSaveQueued = false;
    stateSaveFlushing = true;
    const saveMask = pendingSaveMask || SAVE_ALL;
    pendingSaveMask = 0;
    let saveSucceeded = true;

    try {
      if (typeof globalScope.emitDebugState === "function") {
        globalScope.emitDebugState("save_state:begin", {
          dbCount: state.db.length,
          summaryCount: state.categorySummary.length,
          saveMask,
        });
      }

      // State is normalized at load/mutation boundaries. Avoid re-walking large
      // arrays and rebuilding objects every time a small statistic changes.
      if (saveMask & SAVE_STATS) {
        if (!(await persistMergedState("stats"))) {
          saveSucceeded = false;
          DebugUtils.warn("Unable to persist application stats.");
        }
      }
      if (saveMask & SAVE_PREFS) {
        if (!(await persistMergedState("prefs"))) {
          saveSucceeded = false;
          DebugUtils.warn("Unable to persist application preferences.");
        }
      }
      if (
        saveMask & SAVE_SUMMARY &&
        !setStoredJSON("summary", state.categorySummary || [])
      ) {
        saveSucceeded = false;
        DebugUtils.warn("Unable to persist category summary.");
      }
      if (saveMask & SAVE_PATH) {
        if (typeof globalScope.persistNavigationPath === "function") {
          if (
            globalScope.persistNavigationPath(state.currentPath || [], {
              updateUrl: false,
            }) === false
          ) {
            saveSucceeded = false;
            DebugUtils.warn("Unable to persist navigation path.");
          }
        } else {
          if (
            !setStoredItem(
              "mrh_navigation_path",
              JSON.stringify(
                Array.isArray(state.currentPath) ? state.currentPath : [],
              ),
            )
          ) {
            saveSucceeded = false;
            DebugUtils.warn("Unable to persist navigation path.");
          }
        }
      }
    } catch (e) {
      saveSucceeded = false;
      DebugUtils.error(e);
    }

    if (typeof globalScope.emitDebugState === "function") {
      globalScope.emitDebugState("save_state:complete", {
        dbCount: state.db.length,
        summaryCount: state.categorySummary.length,
        saveMask,
        saveSucceeded,
      });
    }

    stateSaveSucceeded = stateSaveSucceeded && saveSucceeded;
    stateSaveFlushing = false;
    if (pendingSaveMask && !statePersistenceStopped) {
      queueStateSave();
      return;
    }
    pendingSaveMask = 0;

    const resolve = resolveStateSave;
    stateSavePromise = null;
    resolveStateSave = null;
    if (resolve) resolve(stateSaveSucceeded);
  }

  function queueStateSave() {
    if (stateSaveQueued || stateSaveFlushing) return;
    stateSaveQueued = true;
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(flushStateSave, { timeout: 300 });
    } else if (typeof setTimeout === "function") {
      lifecycle.setTimeout(flushStateSave, 100);
    } else if (typeof queueMicrotask === "function") {
      queueMicrotask(flushStateSave);
    } else {
      Promise.resolve().then(flushStateSave);
    }
  }

  function saveState(dirty = "all") {
    if (statePersistenceStopped) return Promise.resolve(false);

    if (!stateSavePromise) {
      stateSaveSucceeded = true;
      stateSavePromise = new Promise((resolve) => {
        resolveStateSave = resolve;
      });
    }

    if (dirty === "stats") pendingSaveMask |= SAVE_STATS;
    else if (dirty === "prefs") pendingSaveMask |= SAVE_PREFS;
    else if (dirty === "summary") pendingSaveMask |= SAVE_SUMMARY;
    else if (dirty === "path") pendingSaveMask |= SAVE_PATH;
    else pendingSaveMask |= SAVE_ALL;

    queueStateSave();

    return stateSavePromise;
  }

  async function importTransferredState(transfer, replaceSettings = false) {
    if (
      !transfer ||
      typeof transfer !== "object" ||
      !transfer.stats ||
      typeof transfer.stats !== "object" ||
      !transfer.progress ||
      typeof transfer.progress !== "object"
    ) {
      throw new TypeError("The transfer does not contain valid progress data.");
    }
    if (state.session?.active) {
      throw new Error("End the active quiz before importing progress.");
    }

    if (!(await saveState("all"))) {
      throw new Error(
        "Unable to save this device's current state before import.",
      );
    }

    const importedStats = normalizeStats(transfer.stats);
    const previousPrefs = state.prefs;
    const progressKeys = new Set(["studyProgress", "qToggles", "lastActivity"]);
    const localOnlyPreferenceKeys = new Set([
      "localDownloadDeletedDecks",
      "localDeckPayloadVersions",
    ]);
    const allowedSettingKeys = Object.keys(state.prefs).filter(
      (key) => !progressKeys.has(key) && !localOnlyPreferenceKeys.has(key),
    );
    const importedSettings = {};
    if (
      replaceSettings &&
      transfer.settings &&
      typeof transfer.settings === "object"
    ) {
      for (const key of allowedSettingKeys) {
        if (Object.prototype.hasOwnProperty.call(transfer.settings, key)) {
          importedSettings[key] = transfer.settings[key];
        }
      }
    }
    const importedProgress = {
      studyProgress:
        transfer.progress.studyProgress &&
        typeof transfer.progress.studyProgress === "object" &&
        !Array.isArray(transfer.progress.studyProgress)
          ? transfer.progress.studyProgress
          : {},
      qToggles:
        transfer.progress.qToggles &&
        typeof transfer.progress.qToggles === "object" &&
        !Array.isArray(transfer.progress.qToggles)
          ? transfer.progress.qToggles
          : {},
      lastActivity:
        transfer.progress.lastActivity &&
        typeof transfer.progress.lastActivity === "object"
          ? transfer.progress.lastActivity
          : null,
    };
    const importedPrefs = normalizePrefs({
      ...state.prefs,
      ...(replaceSettings ? importedSettings : {}),
      ...importedProgress,
      localDownloadDeletedDecks: previousPrefs.localDownloadDeletedDecks,
      localDeckPayloadVersions: previousPrefs.localDeckPayloadVersions,
    });
    const importedSession = transfer.savedSession
      ? { ...transfer.savedSession, autoNextTimeout: null }
      : null;
    const keysToWrite = [
      ["stats", importedStats],
      ["prefs", importedPrefs],
      ["saved_session", importedSession],
    ];
    const previousValues = new Map(
      keysToWrite.map(([key]) => [key, getStoredItem(key)]),
    );

    for (const [key, value] of keysToWrite) {
      const succeeded =
        value === null ? removeStoredItem(key) : setStoredJSON(key, value);
      if (succeeded) continue;

      for (const [rollbackKey, previousValue] of previousValues) {
        const restored =
          previousValue === null
            ? removeStoredItem(rollbackKey)
            : setStoredItem(rollbackKey, previousValue);
        if (!restored) {
          DebugUtils.error(
            `Unable to roll back ${rollbackKey} after a failed progress import.`,
          );
        }
      }
      throw new Error(`Unable to save imported ${key.replace("_", " ")}.`);
    }

    state.stats = importedStats;
    state.prefs = importedPrefs;
    persistedStateBaseline.prefs = cloneStoredValue(importedPrefs);
    persistedStateBaseline.stats = cloneStoredValue(importedStats);

    if (replaceSettings && typeof document !== "undefined") {
      document.documentElement.classList.toggle(
        "dark",
        Boolean(importedPrefs.darkMode),
      );
    }
    globalScope.syncPreferenceControls?.();
    globalScope.updateThemeButton?.();

    globalScope.SessionCore?.checkSavedSession?.();
    if (
      typeof globalScope.SessionCore?.checkSavedSession !== "function" &&
      transfer.savedSession?.active
    ) {
      if (typeof document !== "undefined") {
        document.getElementById("resume-container")?.classList.remove("hidden");
      }
    }
    globalScope.updateDashboard?.();
    return true;
  }

  function stopStatePersistence() {
    statePersistenceStopped = true;
    if (stateSaveQueued && !stateSaveFlushing) {
      void flushStateSave();
    }
    return stateSavePromise || Promise.resolve(stateSaveSucceeded);
  }

  function resumeStatePersistence() {
    statePersistenceStopped = false;
  }

  globalScope.state = state;
  globalScope.persistNavigationPath =
    typeof globalScope.persistNavigationPath === "function"
      ? globalScope.persistNavigationPath
      : (path, options = {}) => {
          const normalized = Array.isArray(path)
            ? path
                .filter((entry) => typeof entry === "string" && entry.trim())
                .map((entry) => String(entry).trim())
            : [];
          if (globalScope.state) globalScope.state.currentPath = normalized;
          if (options.updateUrl !== false) updateNavigationUrl(normalized);
          try {
            const saved = setStoredItem(
              "mrh_navigation_path",
              JSON.stringify(normalized),
            );
            if (!saved) {
              DebugUtils.warn("Unable to persist navigation path.");
            }
            return saved;
          } catch (e) {
            DebugUtils.warn("Unable to persist navigation path.", e);
            return false;
          }
        };
  globalScope.readStoredNavigationPath =
    typeof globalScope.readStoredNavigationPath === "function"
      ? globalScope.readStoredNavigationPath
      : () => {
          try {
            const raw = getStoredItem("mrh_navigation_path", "");
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
              .filter((entry) => typeof entry === "string" && entry.trim())
              .map((entry) => String(entry).trim());
          } catch (e) {
            return [];
          }
        };
  globalScope.getNavigationPathFromUrl = getNavigationPathFromUrl;
  globalScope.getSessionNavigationFromUrl = getSessionNavigationFromUrl;
  globalScope.updateNavigationUrl = updateNavigationUrl;
  globalScope.updateSessionNavigationUrl = updateSessionNavigationUrl;
  globalScope.getStoredItem = getStoredItem;
  globalScope.getAnyNamespaceStoredItem = getAnyNamespaceStoredItem;
  globalScope.setStoredItem = setStoredItem;
  globalScope.removeStoredItem = removeStoredItem;
  globalScope.getStoredJSON = getStoredJSON;
  globalScope.setStoredJSON = setStoredJSON;
  globalScope.getSessionStoredItem = getSessionStoredItem;
  globalScope.setSessionStoredItem = setSessionStoredItem;
  globalScope.removeSessionStoredItem = removeSessionStoredItem;
  globalScope.getSessionStoredJSON = getSessionStoredJSON;
  globalScope.setSessionStoredJSON = setSessionStoredJSON;
  globalScope.migrateLegacyStorageKeys = migrateLegacyStorageKeys;
  globalScope.purgeOrphanedStorage = purgeOrphanedStorage;
  globalScope.normalizeQuestionRecord = normalizeQuestionRecord;
  globalScope.rebuildQuestionIndex = rebuildQuestionIndex;
  globalScope.ensureQuestionIndex = ensureQuestionIndex;
  globalScope.getQuestionsForSubject = getQuestionsForSubject;
  globalScope.syncPreferenceControls = syncPreferenceControls;
  globalScope.updateDashboard = updateDashboard;

  const AppState = {
    state,
    getStoredItem,
    getAnyNamespaceStoredItem,
    setStoredItem,
    removeStoredItem,
    getStoredJSON,
    setStoredJSON,
    getSessionStoredItem,
    setSessionStoredItem,
    removeSessionStoredItem,
    getSessionStoredJSON,
    setSessionStoredJSON,
    migrateLegacyStorageKeys,
    purgeOrphanedStorage,
    normalizeQuestionRecord,
    rebuildQuestionIndex,
    ensureQuestionIndex,
    getQuestionsForSubject,
    get databaseReady() {
      return databaseReady;
    },
    waitForDatabaseReady,
    syncPreferenceControls: function syncPreferenceControlsAlias() {
      return syncPreferenceControls();
    },
    normalizeCacheVersion,
    updateDashboard: function updateDashboardAlias() {
      return updateDashboard();
    },
    loadState: async function loadStateAlias(options = {}) {
      return loadState(options);
    },
    saveState: async function saveStateAlias(dirty = "all") {
      return saveState(dirty);
    },
    importTransferredState,
    stopStatePersistence,
    resumeStatePersistence,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AppState;
  }

  globalScope.AppState = AppState;
})(typeof window !== "undefined" ? window : globalThis);
