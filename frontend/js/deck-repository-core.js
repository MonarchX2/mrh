(function (globalScope) {
  "use strict";

  const INDEX_KEY = "mrh_deck_index_v1";

  function create({
    getStorage = () => globalScope.idbKeyval,
    isDeckLocked = () => false,
    shouldPauseWrites = () => false,
  } = {}) {
    let persistenceQueue = Promise.resolve();
    const inFlightWrites = new Set();

    function runWrite(operation, { allowWhileClearing = false } = {}) {
      if (shouldPauseWrites() && !allowWhileClearing) {
        throw new Error("Deck persistence is paused while app data is cleared.");
      }
      const storage = getStorage();
      if (!storage) throw new Error("IndexedDB storage is unavailable.");
      const write = persistenceQueue
        .catch(() => {})
        .then(() => operation(storage));
      persistenceQueue = write;
      inFlightWrites.add(write);
      return write.finally(() => inFlightWrites.delete(write));
    }

    async function readIndex(storage) {
      const storedIndex = await storage.get(INDEX_KEY);
      if (storedIndex !== undefined && !Array.isArray(storedIndex)) {
        throw new Error("The saved question-deck index is invalid.");
      }
      return new Set(
        (storedIndex || [])
          .map((entry) => String(entry || "").trim())
          .filter(Boolean),
      );
    }

    function validateSubject(subject, action) {
      const normalized = String(subject || "").trim();
      if (!normalized) {
        throw new TypeError(`A subject is required to ${action} a deck.`);
      }
      return normalized;
    }

    async function saveDeck(subject, questions) {
      const normalizedSubject = validateSubject(subject, "persist");
      if (!Array.isArray(questions)) {
        throw new TypeError("Deck questions must be an array.");
      }
      const hasMismatchedSubject = questions.some((question) => {
        const questionSubject = String(question?.Subject || "").trim();
        return (
          !isDeckLocked(questionSubject) && questionSubject !== normalizedSubject
        );
      });
      if (hasMismatchedSubject) {
        throw new Error("A deck persistence request contains another subject.");
      }

      return runWrite(async (storage) => {
        const subjects = await readIndex(storage);
        const unlockedQuestions = questions.filter(
          (question) => !isDeckLocked(String(question?.Subject || "").trim()),
        );
        const storageKey = `mrh_deck:${normalizedSubject}`;
        if (unlockedQuestions.length > 0) {
          subjects.add(normalizedSubject);
          await storage.set(INDEX_KEY, [...subjects]);
          await storage.set(storageKey, unlockedQuestions);
        } else {
          await storage.del(storageKey);
          subjects.delete(normalizedSubject);
          await storage.set(INDEX_KEY, [...subjects]);
        }
      });
    }

    async function deleteDeck(subject) {
      const normalizedSubject = validateSubject(subject, "delete");
      return runWrite(async (storage) => {
        const subjects = await readIndex(storage);
        await storage.del(`mrh_deck:${normalizedSubject}`);
        subjects.delete(normalizedSubject);
        await storage.set(INDEX_KEY, [...subjects]);
      });
    }

    async function waitForWrites() {
      while (inFlightWrites.size > 0) {
        await Promise.all([...inFlightWrites]);
      }
    }

    async function settleWrites() {
      while (inFlightWrites.size > 0) {
        await Promise.allSettled([...inFlightWrites]);
      }
    }

    return Object.freeze({
      deleteDeck,
      getIndexKey: () => INDEX_KEY,
      getPendingWriteCount: () => inFlightWrites.size,
      runWrite,
      saveDeck,
      settleWrites,
      waitForWrites,
    });
  }

  globalScope.DeckRepositoryCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
