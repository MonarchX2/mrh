(function (globalScope) {
  "use strict";

  function create({ repository } = {}) {
    if (typeof repository?.runWrite !== "function") {
      throw new TypeError("A deck repository is required.");
    }

    async function clearQuestionDatabase() {
      return repository.runWrite(
        async (storage) => {
          if (typeof storage.keys !== "function") {
            throw new Error("IndexedDB key enumeration is unavailable.");
          }
          const indexKey = repository.getIndexKey();
          const keys = await storage.keys();
          const databaseKeys = keys.filter(
            (key) =>
              String(key).startsWith("mrh_deck:") ||
              key === "mrh_db" ||
              key === indexKey,
          );
          await Promise.all(databaseKeys.map((key) => storage.del(key)));
          for (const key of databaseKeys) {
            if ((await storage.get(key)) !== undefined) {
              throw new Error(`Unable to remove IndexedDB entry "${key}".`);
            }
          }
        },
        { allowWhileClearing: true },
      );
    }

    return Object.freeze({ clearQuestionDatabase });
  }

  globalScope.DeckDatabaseLifecycleCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
