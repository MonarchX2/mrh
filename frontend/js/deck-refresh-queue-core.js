(function (globalScope) {
  "use strict";

  const DEFAULT_OPTIONS = Object.freeze({
    concurrency: 2,
    batchSize: 4,
    continuationDelayMs: 1000,
    retryBaseDelayMs: 5000,
    retryMaxDelayMs: 60000,
  });

  function create(options = {}) {
    const {
      state,
      lifecycle = globalScope,
      logger = globalScope.DebugUtils || console,
      waitForLocalDatabaseReady,
      isSessionActive,
      isReviewViewActive,
      getCurrentReviewSubject,
      getSummary,
      getQuestionsForSubject,
      getLocalDeckVersion,
      isDeckFetchCurrentForSubject,
      getDeckFetchGeneration,
      removeDeckFromLocalDatabase,
      fetchDeck,
      saveState,
      concurrency = DEFAULT_OPTIONS.concurrency,
      batchSize = DEFAULT_OPTIONS.batchSize,
      continuationDelayMs = DEFAULT_OPTIONS.continuationDelayMs,
      retryBaseDelayMs = DEFAULT_OPTIONS.retryBaseDelayMs,
      retryMaxDelayMs = DEFAULT_OPTIONS.retryMaxDelayMs,
    } = options;
    const requiredCallbacks = {
      waitForLocalDatabaseReady,
      isSessionActive,
      isReviewViewActive,
      getCurrentReviewSubject,
      getSummary,
      getQuestionsForSubject,
      getLocalDeckVersion,
      isDeckFetchCurrentForSubject,
      getDeckFetchGeneration,
      removeDeckFromLocalDatabase,
      fetchDeck,
      saveState,
    };
    for (const [name, callback] of Object.entries(requiredCallbacks)) {
      if (typeof callback !== "function") {
        throw new TypeError(`${name} is required for the deck refresh queue.`);
      }
    }
    if (!state?.prefs) {
      throw new TypeError("Application preferences are required.");
    }

    const pendingSubjects = new Set();
    const retryAttempts = new Map();
    let refreshPromise = null;
    let refreshTimer = null;
    let disposed = false;

    function normalizeSubject(subject) {
      return String(subject || "").trim();
    }

    function add(subject) {
      const normalized = normalizeSubject(subject);
      if (normalized) pendingSubjects.add(normalized);
      return queue;
    }

    function deleteSubject(subject) {
      return pendingSubjects.delete(normalizeSubject(subject));
    }

    function clear() {
      pendingSubjects.clear();
      retryAttempts.clear();
      if (refreshTimer !== null) {
        lifecycle.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    }

    function clearRetry(subject) {
      retryAttempts.delete(normalizeSubject(subject));
    }

    function restore(subjects) {
      if (!Array.isArray(subjects)) return;
      subjects.forEach(add);
    }

    function isEligibleSubject(subject) {
      if (
        isReviewViewActive() &&
        getCurrentReviewSubject() === subject
      )
        return false;
      const entry = getSummary().find(
        (deck) => normalizeSubject(deck?.Subject) === subject,
      );
      return !entry || !entry.Locked;
    }

    function schedule(delayMs) {
      if (disposed || refreshTimer !== null || pendingSubjects.size === 0)
        return false;
      refreshTimer = lifecycle.setTimeout(() => {
        refreshTimer = null;
        refresh().catch((error) => {
          logger.error(
            "Unable to continue refreshing pending deck payloads.",
            error,
          );
        });
      }, delayMs);
      return true;
    }

    async function persistPendingSubjects() {
      const pending = [...pendingSubjects];
      if (
        JSON.stringify(state.prefs.pendingDeckPayloadRefreshes || []) ===
        JSON.stringify(pending)
      )
        return;
      state.prefs.pendingDeckPayloadRefreshes = pending;
      try {
        if ((await saveState("prefs")) === false) {
          logger.error("Unable to persist pending backend payload refreshes.");
        }
      } catch (error) {
        logger.error(
          "Unable to persist pending backend payload refreshes.",
          error,
        );
      }
    }

    function recordFailure(subject, failedSubjects, getNextDelay) {
      const attempts = (retryAttempts.get(subject) || 0) + 1;
      retryAttempts.set(subject, attempts);
      getNextDelay(
        Math.min(
          retryMaxDelayMs,
          retryBaseDelayMs * 2 ** Math.min(attempts - 1, 4),
        ),
      );
      failedSubjects.add(subject);
    }

    async function refresh() {
      if (disposed) return false;
      if (!(await waitForLocalDatabaseReady())) return false;
      if (isSessionActive()) return false;
      if (refreshPromise) return refreshPromise;
      if (refreshTimer !== null) {
        lifecycle.clearTimeout(refreshTimer);
        refreshTimer = null;
      }

      refreshPromise = (async () => {
        const subjects = [...pendingSubjects]
          .filter(isEligibleSubject)
          .slice(0, batchSize);
        const failedSubjects = new Set();
        let nextRetryDelayMs = continuationDelayMs;
        const noteRetryDelay = (delay) => {
          nextRetryDelayMs = Math.max(nextRetryDelayMs, delay);
        };
        const removeDeck = async (subject) => {
          const generation = getDeckFetchGeneration(subject);
          try {
            const removed = await removeDeckFromLocalDatabase(subject);
            if (
              removed !== false &&
              isDeckFetchCurrentForSubject(subject, generation)
            ) {
              deleteSubject(subject);
              clearRetry(subject);
            } else if (removed === false) {
              recordFailure(subject, failedSubjects, noteRetryDelay);
            }
          } catch (error) {
            logger.error(
              `Unable to persist removal of updated deck "${subject}".`,
              error,
            );
            recordFailure(subject, failedSubjects, noteRetryDelay);
          }
        };

        const networkSubjects = [];
        for (const subject of subjects) {
          if (isSessionActive()) break;
          const summaryEntry = getSummary().find(
            (deck) => normalizeSubject(deck?.Subject) === subject,
          );
          if (!summaryEntry) {
            await removeDeck(subject);
            continue;
          }
          if (summaryEntry.Locked) continue;
          const expectedQuestionCount = Math.max(
            0,
            Number(summaryEntry.QuestionCount) || 0,
          );
          if (expectedQuestionCount === 0) {
            await removeDeck(subject);
            continue;
          }
          const expectedPayloadVersion = String(
            summaryEntry.PayloadVersion || "",
          );
          const cachedQuestions = getQuestionsForSubject(subject);
          if (
            /^[a-f0-9]{64}$/i.test(expectedPayloadVersion) &&
            getLocalDeckVersion(subject).toLowerCase() ===
              expectedPayloadVersion.toLowerCase() &&
            cachedQuestions.length === expectedQuestionCount
          ) {
            deleteSubject(subject);
            clearRetry(subject);
            continue;
          }
          networkSubjects.push({ subject, expectedQuestionCount });
        }

        let nextNetworkSubjectIndex = 0;
        const workerCount = Math.min(concurrency, networkSubjects.length);
        await Promise.all(
          Array.from({ length: workerCount }, async () => {
            while (
              nextNetworkSubjectIndex < networkSubjects.length &&
              !isSessionActive()
            ) {
              const { subject, expectedQuestionCount } =
                networkSubjects[nextNetworkSubjectIndex];
              nextNetworkSubjectIndex += 1;
              if (!pendingSubjects.has(subject)) continue;

              let refreshed = [];
              try {
                refreshed = await fetchDeck(subject, expectedQuestionCount);
              } catch (error) {
                logger.warn(
                  `Unable to refresh changed deck "${subject}".`,
                  error,
                );
              }
              if (
                refreshed.length === expectedQuestionCount &&
                !pendingSubjects.has(subject)
              ) {
                clearRetry(subject);
                continue;
              }

              if (pendingSubjects.has(subject)) {
                recordFailure(subject, failedSubjects, noteRetryDelay);
              }
            }
          }),
        );

        for (const subject of failedSubjects) {
          if (deleteSubject(subject)) add(subject);
        }

        await persistPendingSubjects();
        const hasEligiblePendingSubject =
          !isSessionActive() && [...pendingSubjects].some(isEligibleSubject);
        if (hasEligiblePendingSubject) schedule(nextRetryDelayMs);
        return pendingSubjects.size === 0;
      })().finally(() => {
        refreshPromise = null;
      });

      return refreshPromise;
    }

    function cleanup() {
      disposed = true;
      if (refreshTimer !== null) {
        lifecycle.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
    }

    const queue = {
      add,
      clear,
      clearRetry,
      cleanup,
      delete: deleteSubject,
      has: (subject) => pendingSubjects.has(normalizeSubject(subject)),
      isRefreshing: () => refreshPromise !== null,
      refresh,
      restore,
      schedule,
      snapshot: () => [...pendingSubjects],
      [Symbol.iterator]: () => pendingSubjects[Symbol.iterator](),
    };
    Object.defineProperty(queue, "size", {
      enumerable: true,
      get: () => pendingSubjects.size,
    });
    return Object.freeze(queue);
  }

  globalScope.DeckRefreshQueueCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
