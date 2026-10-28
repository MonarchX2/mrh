(function (globalScope) {
  "use strict";

  function create({ normalizeAccessFlag } = {}) {
    if (typeof normalizeAccessFlag !== "function") {
      throw new TypeError("Summary access normalization is required.");
    }

    const arraySignatureCache = new WeakMap();
    const subjectListSignatureCache = new WeakMap();

    function stripAccessMetadata(summaryData) {
      if (!Array.isArray(summaryData)) return summaryData;
      return summaryData.map((deck) => {
        if (!deck || typeof deck !== "object") return deck;
        const {
          Subject,
          QuestionCount,
          QuestionType,
          Locked,
          HasExplanations,
          PayloadVersion,
        } = deck;
        return {
          Subject,
          QuestionCount,
          QuestionType,
          Locked,
          HasExplanations,
          PayloadVersion,
        };
      });
    }

    function normalizeSummaryData(summaryData) {
      if (
        summaryData &&
        !Array.isArray(summaryData) &&
        summaryData.v === 1 &&
        Array.isArray(summaryData.p) &&
        Array.isArray(summaryData.d)
      ) {
        if (
          !Array.isArray(summaryData.h) ||
          summaryData.h.length !== summaryData.d.length ||
          summaryData.p.some((prefix) => typeof prefix !== "string") ||
          summaryData.h.some(
            (fingerprint) => !/^[a-f0-9]{64}$/i.test(String(fingerprint || "")),
          )
        ) {
          throw new Error("Backend compact summary fingerprints are malformed.");
        }
        summaryData = summaryData.d.map((row, index) => {
          if (
            !Array.isArray(row) ||
            row.length < 5 ||
            row.length > 6 ||
            typeof row[0] !== "number" ||
            !Number.isInteger(row[0]) ||
            row[0] < 0 ||
            row[0] >= summaryData.p.length ||
            typeof row[1] !== "string" ||
            !row[1].trim() ||
            typeof row[2] !== "number" ||
            !Number.isInteger(row[2]) ||
            row[2] < 0 ||
            typeof row[3] !== "string" ||
            !row[3].trim() ||
            (row[4] !== 0 && row[4] !== 1) ||
            (row.length === 6 && row[5] !== 1)
          ) {
            throw new Error("Backend compact summary row is malformed.");
          }
          const prefix = summaryData.p[row[0]];
          const suffix = row[1];
          return {
            s: prefix ? `${prefix}::${suffix}` : suffix,
            c: row[2],
            t: row[3],
            ...(row[4] ? { l: "t" } : {}),
            ...(row.length > 5 ? { e: "t" } : {}),
            h: String(summaryData.h[index] || ""),
          };
        });
      }

      if (!Array.isArray(summaryData)) return summaryData;

      return summaryData.map((deck) => {
        if (!deck || typeof deck !== "object") return deck;
        const subject = deck.s !== undefined ? deck.s : deck.Subject;
        const questionCount = deck.c !== undefined ? deck.c : deck.QuestionCount;
        const questionType = deck.t !== undefined ? deck.t : deck.QuestionType;
        const locked = deck.l !== undefined ? deck.l : deck.Locked;
        const hasExplanations =
          Object.prototype.hasOwnProperty.call(deck, "e") ||
          (typeof deck.HasExplanations === "boolean"
            ? deck.HasExplanations
            : normalizeAccessFlag(deck.HasExplanations));

        return {
          Subject: subject,
          QuestionCount: Number(questionCount || 0),
          QuestionType: questionType || "ID",
          Locked: normalizeAccessFlag(locked),
          HasExplanations: hasExplanations,
          PayloadVersion: String(deck.h ?? deck.PayloadVersion ?? ""),
        };
      });
    }

    function getSummarySignature(summaryData) {
      if (!Array.isArray(summaryData)) return "";
      const cached = arraySignatureCache.get(summaryData);
      if (cached !== undefined) return cached;

      const signature = summaryData
        .map((deck) =>
          [
            deck?.Subject,
            deck?.QuestionCount,
            deck?.QuestionType,
            deck?.Locked,
            deck?.HasExplanations,
            deck?.PayloadVersion,
            deck?.Hidden,
            deck?.IsFolder,
            deck?.Downloaded,
            deck?.IsDownloaded,
            deck?.LocalQuestionCount,
          ]
            .map((value) => String(value ?? ""))
            .join("\u001f"),
        )
        .join("\u001e");

      arraySignatureCache.set(summaryData, signature);
      return signature;
    }

    function getSubjectListSignature(summaryData) {
      if (!Array.isArray(summaryData)) return "";
      const cached = subjectListSignatureCache.get(summaryData);
      if (cached !== undefined) return cached;

      const signature = [
        ...new Set(
          summaryData
            .map((deck) => String(deck?.Subject || "").trim())
            .filter(Boolean),
        ),
      ]
        .sort()
        .join("\u001e");

      subjectListSignatureCache.set(summaryData, signature);
      return signature;
    }

    return Object.freeze({
      getSubjectListSignature,
      getSummarySignature,
      normalizeSummaryData,
      stripAccessMetadata,
    });
  }

  globalScope.DeckSummaryMapperCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
