(function (globalScope) {
  "use strict";

  function create({
    state,
    fallbackScope = globalScope,
    normalizeAccessFlag,
    getAccessMetadata = () => state?.accessMetadata || {},
    getSummary = () => state?.categorySummary || [],
    saveState = () => undefined,
  } = {}) {
    if (typeof normalizeAccessFlag !== "function") {
      throw new TypeError("Deck access state dependencies are required.");
    }

    function ensureUnlockedFolderState() {
      if (!state || typeof state !== "object") {
        if (
          !fallbackScope.__mrhUnlockedFolders ||
          typeof fallbackScope.__mrhUnlockedFolders !== "object"
        ) {
          fallbackScope.__mrhUnlockedFolders = {};
        }
        return fallbackScope.__mrhUnlockedFolders;
      }
      if (
        !state.unlockedFolders ||
        typeof state.unlockedFolders !== "object"
      ) {
        state.unlockedFolders = {};
      }
      return state.unlockedFolders;
    }

    function setFolderUnlocked(subject, unlocked = true) {
      const subjectName = String(subject || "").trim();
      if (!subjectName) return false;
      ensureUnlockedFolderState()[subjectName] = Boolean(unlocked);
      saveState();
      return true;
    }

    function isFolderUnlocked(subject) {
      const subjectName = String(subject || "").trim();
      if (!subjectName) return false;
      return Boolean(ensureUnlockedFolderState()[subjectName]);
    }

    function resolveSubjectAccess(
      subject,
      accessMap = {},
      summaryEntries = [],
    ) {
      const subjectName = String(subject || "").trim();
      if (!subjectName) return { Hidden: false, Password: "", Locked: false };

      const directEntry = accessMap?.[subjectName] || {};
      const summaryEntry =
        Object.keys(directEntry).length > 0
          ? {}
          : (Array.isArray(summaryEntries)
              ? summaryEntries.find(
                  (item) => String(item?.Subject || "") === subjectName,
                )
              : null) || {};
      const hidden =
        normalizeAccessFlag(directEntry.Hidden) ||
        normalizeAccessFlag(summaryEntry.Hidden);
      const password = String(
        directEntry.Password ||
          summaryEntry.Password ||
          summaryEntry.password ||
          "",
      ).trim();
      const locked =
        !isFolderUnlocked(subjectName) &&
        (normalizeAccessFlag(directEntry.Locked) ||
          normalizeAccessFlag(summaryEntry.Locked) ||
          password !== "");

      return { Hidden: hidden, Password: password, Locked: locked };
    }

    function buildAccessMetadataMap(accessData) {
      const map = {};
      const rows = Array.isArray(accessData) ? accessData : [];
      rows.forEach((entry) => {
        if (!entry || !entry.Subject) return;
        const subject = String(entry.Subject).trim();
        if (!subject) return;
        const normalizedLocked =
          entry.Locked === true ||
          String(entry.Locked || "").toLowerCase() === "true";
        const normalizedHidden =
          entry.Hidden === true ||
          String(entry.Hidden || "").toLowerCase() === "true";
        const password = String(entry.Password || entry.password || "").trim();
        map[subject] = {
          Subject: subject,
          Password: password,
          Hidden: normalizedHidden,
          Locked: normalizedLocked || password !== "",
        };
      });
      return map;
    }

    function getAccess(subject) {
      return resolveSubjectAccess(subject, getAccessMetadata(), getSummary());
    }

    return Object.freeze({
      buildAccessMetadataMap,
      ensureUnlockedFolderState,
      isDeckHidden: (subject) => Boolean(getAccess(subject).Hidden),
      isDeckLocked: (subject) => {
        const access = getAccess(subject);
        return Boolean(access.Locked) || Boolean(access.Password);
      },
      isDeckPasswordProtected: (subject) => {
        const access = getAccess(subject);
        return Boolean(access.Password) || Boolean(access.Locked);
      },
      isFolderUnlocked,
      resolveSubjectAccess,
      setFolderUnlocked,
    });
  }

  globalScope.DeckAccessStateCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
