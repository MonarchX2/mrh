(function (globalScope) {
  "use strict";

  const choiceKeys = ["A", "B", "C", "D", "E"];

  function getMode(question, override) {
    const isForcedIdent = override === "ident";
    const isForcedMCQ = override === "mcq";

    let isIdent;
    let validChoicesCount = 0;

    if (isForcedIdent) {
      isIdent = true;
    } else if (isForcedMCQ) {
      isIdent = false;
    } else if (question && question.QuestionType) {
      isIdent = question.QuestionType === "ID";
    } else {
      for (const key of choiceKeys) {
        const choiceText = question?.[`Choice${key}`];
        if (
          choiceText &&
          String(choiceText).trim() !== "" &&
          String(choiceText).toLowerCase() !== "undefined"
        ) {
          validChoicesCount += 1;
        }
      }
      isIdent = validChoicesCount <= 1;
    }

    return { isIdent, validChoicesCount };
  }

  function getDisplayName(mode) {
    const normalizedMode = String(mode || "auto").toLowerCase();
    const displayNames = {
      auto: "Auto (Mixed)",
      ident: "Identification",
      mcq: "Multiple Choices",
    };
    return displayNames[normalizedMode] || "Auto (Mixed)";
  }

  const QuestionTypeCore = Object.freeze({ getMode, getDisplayName });
  globalScope.QuestionTypeCore = QuestionTypeCore;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = QuestionTypeCore;
  }
})(typeof window !== "undefined" ? window : globalThis);
