(function (globalScope) {
  "use strict";

  function create({
    canFetchDeck,
    hasPendingPayloadUpdate,
    getClearGeneration,
    isClearGenerationCurrent,
    getNetwork = () => globalScope.AppNetwork,
    isDeckLocked,
    onLockedDeck,
    onFailure,
    logger = globalScope.DebugUtils || console,
  } = {}) {
    if (
      typeof canFetchDeck !== "function" ||
      typeof hasPendingPayloadUpdate !== "function" ||
      typeof getClearGeneration !== "function" ||
      typeof isClearGenerationCurrent !== "function" ||
      typeof isDeckLocked !== "function" ||
      typeof onLockedDeck !== "function" ||
      typeof onFailure !== "function"
    ) {
      throw new TypeError("Deck loader dependencies are required.");
    }

    const inFlight = new Map();
    const inFlightGenerations = new Map();
    const generations = new Map();

    function normalizeSubject(subject) {
      return String(subject || "").trim();
    }

    function getGeneration(subject) {
      return generations.get(normalizeSubject(subject)) || 0;
    }

    function invalidate(subject) {
      const key = normalizeSubject(subject);
      if (!key) return;
      generations.set(key, getGeneration(key) + 1);
    }

    function isCurrentForSubject(subject, generation) {
      return canFetchDeck(subject) && getGeneration(subject) === generation;
    }

    function makeKey(subject, pass, customFilter) {
      const filterKey = typeof customFilter === "function" ? "custom" : "all";
      return `${normalizeSubject(subject)}::${String(pass || "")}::${filterKey}`;
    }

    async function fetch({
      subject,
      pass = null,
      customFilter = null,
      loaderElement = null,
      expectedQuestionCount = null,
      suppressRender = false,
      processResponse,
    } = {}) {
      if (typeof processResponse !== "function") {
        throw new TypeError("Deck response processing is required.");
      }
      if (!canFetchDeck(subject)) return [];

      const subjectKey = makeKey(subject, pass, customFilter);
      const currentDeckGeneration = getGeneration(subject);
      const existingRequest = inFlight.get(subjectKey);
      if (
        existingRequest &&
        inFlightGenerations.get(subjectKey) === currentDeckGeneration
      ) {
        return existingRequest;
      }
      if (hasPendingPayloadUpdate(subject) && !existingRequest) {
        invalidate(subject);
      }

      const clearGeneration = getClearGeneration();
      const deckGeneration = getGeneration(subject);
      const isCurrent = () =>
        isClearGenerationCurrent(clearGeneration) &&
        isCurrentForSubject(subject, deckGeneration);
      const request = (async () => {
        if (loaderElement) {
          loaderElement.classList.remove("hidden");
          loaderElement.classList.add("flex");
        }
        try {
          if (isDeckLocked(subject) && !pass) {
            onLockedDeck(subject);
            return [];
          }
          const network = getNetwork();
          if (typeof network?.getDeck !== "function") {
            throw new Error("AppNetwork deck API is unavailable.");
          }
          const response = await network.getDeck(subject, pass || "", {
            timeoutMs: 15000,
          });
          if (!isCurrent()) return [];
          if (response && response.error) {
            const errorText = String(response.error || "").toLowerCase();
            if (
              errorText.includes("incorrect password") ||
              errorText.includes("requires a password") ||
              errorText.includes("not available")
            ) {
              if (!pass) onLockedDeck(subject);
              else if (errorText.includes("incorrect password")) {
                throw new Error("Incorrect password.");
              }
              return [];
            }
            throw new Error(response.error);
          }
          if (!Array.isArray(response)) {
            throw new Error(
              "Unexpected backend response format while loading deck.",
            );
          }
          return await processResponse(response, {
            clearGeneration,
            deckGeneration,
            expectedQuestionCount,
            isCurrent,
          });
        } catch (error) {
          if (
            pass &&
            (/incorrect password/i.test(String(error?.message || "")) ||
              String(error?.code || "").toUpperCase() === "PASSWORD_REQUIRED")
          ) {
            throw error;
          }
          logger.warn("Network fetch failed.", error);
          onFailure(subject, error, { suppressRender });
          return [];
        } finally {
          if (loaderElement) {
            loaderElement.classList.add("hidden");
            loaderElement.classList.remove("flex");
          }
        }
      })();

      inFlight.set(subjectKey, request);
      inFlightGenerations.set(subjectKey, deckGeneration);
      try {
        return await request;
      } finally {
        if (inFlight.get(subjectKey) === request) {
          inFlight.delete(subjectKey);
          inFlightGenerations.delete(subjectKey);
        }
      }
    }

    return Object.freeze({
      fetch,
      getGeneration,
      getKey: makeKey,
      invalidate,
      isCurrentForSubject,
    });
  }

  globalScope.DeckLoaderCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
