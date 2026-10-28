(function (globalScope) {
  "use strict";

  const HTML_ENTITY_MAP = Object.freeze({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  });
  const HTML_ESCAPE_RE = /[&<>'"]/g;
  const TEX_COMMAND_RE =
    /\\(?:text|mathrm|mathbf|frac|sqrt|cdot|times|div|pm|leq|geq|pi|theta|alpha|beta|gamma|sin|cos|tan)\b/;
  const TEX_UNIT_WITH_EXPONENT_RE =
    /\\text\{[^{}]+\}\s*\^\s*(?:\{[^{}]+\}|\d+)/g;
  const CLOZE_RE = /\{\{c\d+::([^{}]+)\}\}/g;
  // Only break on the first five explicit Roman-numeral list markers.
  const LIST_RE = /(?:\s|^)((?:IV|III|II|I|V)\.)\s/gi;
  const QUESTION_NUMBER_RE = /^\s*\d+[\).\-:]\s*/;
  const QUESTION_NUMBER_DOT_RE = /^\s*\d+\.\s*/;
  const NATURAL_SORT_COLLATOR =
    typeof Intl !== "undefined" && typeof Intl.Collator === "function"
      ? new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
      : null;
  const MATH_CACHE_LIMIT = 128;
  const FORMAT_CACHE_LIMIT = 256;
  const mathRenderCache = new Map();
  const formatTextCache = new Map();

  function memoizeBounded(cache, key, producer, limit) {
    if (cache.has(key)) {
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return value;
    }
    const value = producer();
    cache.set(key, value);
    if (cache.size > limit) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    return value;
  }

  function escapeHTML(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(HTML_ESCAPE_RE, (c) => HTML_ENTITY_MAP[c]);
  }

  function scrambleWords(value) {
    let wordIndex = 0;
    return String(value ?? "").replace(/[\p{L}]+/gu, (word) => {
      const letters = Array.from(word);
      if (letters.length < 2) return word;

      let seed = 2166136261;
      const seedText = `${wordIndex++}:${word.toLowerCase()}`;
      for (const character of seedText) {
        seed = Math.imul(seed ^ character.codePointAt(0), 16777619);
      }

      for (let index = letters.length - 1; index > 0; index--) {
        seed = Math.imul(seed ^ (seed >>> 13), 0x5bd1e995);
        const swapIndex = (seed >>> 0) % (index + 1);
        [letters[index], letters[swapIndex]] = [
          letters[swapIndex],
          letters[index],
        ];
      }

      const scrambled = letters.join("");
      return scrambled === word
        ? `${word.slice(1)}${word[0]}`
        : scrambled;
    });
  }

  function renderMathExpression(rawExpression, displayMode) {
    const expr = String(rawExpression || "").trim();
    if (!expr) return "";

    const katexAvailable =
      typeof globalScope.katex?.renderToString === "function";
    const key = `${displayMode ? "1" : "0"}|${katexAvailable ? "1" : "0"}|${expr}`;
    return memoizeBounded(
      mathRenderCache,
      key,
      () => {
        const katexApi = globalScope.katex;
        if (katexApi && typeof katexApi.renderToString === "function") {
          try {
            return katexApi.renderToString(expr, {
              throwOnError: false,
              displayMode: Boolean(displayMode),
              strict: "ignore",
            });
          } catch (error) {
            return `<code class="math-fallback" data-math-display="${displayMode ? "true" : "false"}">${escapeHTML(expr)}</code>`;
          }
        }

        return `<code class="math-fallback" data-math-display="${displayMode ? "true" : "false"}">${escapeHTML(expr)}</code>`;
      },
      MATH_CACHE_LIMIT,
    );
  }

  function refreshMathFallbacks() {
    const documentApi = globalScope.document;
    if (
      !documentApi ||
      typeof documentApi.querySelectorAll !== "function" ||
      typeof globalScope.katex?.renderToString !== "function"
    ) {
      return;
    }

    documentApi.querySelectorAll("code.math-fallback").forEach((element) => {
      const rendered = renderMathExpression(
        element.textContent,
        element.dataset.mathDisplay === "true",
      );
      if (!rendered.includes('class="math-fallback"')) {
        element.outerHTML = rendered;
      }
    });
  }

  function handleScriptLoad(event) {
    const script = event.target;
    if (
      script?.tagName === "SCRIPT" &&
      /\/katex(?:\.min)?\.js(?:[?#]|$)/i.test(script.src || "")
    ) {
      refreshMathFallbacks();
    }
  }

  if (typeof globalScope.addEventListener === "function") {
    globalScope.addEventListener("load", handleScriptLoad, true);
  }

  function isSafeImageURL(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return false;

    try {
      const base = globalScope.location?.href || "https://localhost/";
      const url = new URL(raw, base);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch (error) {
      return false;
    }
  }

  function stripQuestionNumberPrefix(value) {
    const raw = String(value ?? "");
    if (!raw.trim()) return raw;

    return raw
      .replace(/^\s*\d+[\).\-:]\s*/, "")
      .replace(/^\s*\d+\.\s*/, "")
      .trim();
  }

  function isEscapedCharacter(text, index) {
    let backslashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) {
      backslashCount++;
    }
    return backslashCount % 2 === 1;
  }

  function findTexUnitEnd(text, start) {
    TEX_UNIT_WITH_EXPONENT_RE.lastIndex = start;
    const match = TEX_UNIT_WITH_EXPONENT_RE.exec(text);
    TEX_UNIT_WITH_EXPONENT_RE.lastIndex = 0;
    return match ? match.index + match[0].length : -1;
  }

  function unescapeCurrencyMarkers(text) {
    return text.replace(/(\\*)\$/g, (match, backslashes) => {
      if (backslashes.length % 2 === 0) return match;
      return `${backslashes.slice(0, -1)}$`;
    });
  }

  function findMathSegments(text) {
    const segments = [];
    let textStart = 0;
    let index = 0;

    while (index < text.length) {
      if (text[index] !== "$") {
        index++;
        continue;
      }

      const escaped = isEscapedCharacter(text, index);
      const delimiterLength =
        !escaped && text[index + 1] === "$" ? 2 : 1;
      let closingIndex = -1;

      for (
        let candidate = index + delimiterLength;
        candidate < text.length;
        candidate++
      ) {
        if (
          text[candidate] !== "$" ||
          isEscapedCharacter(text, candidate)
        ) {
          continue;
        }

        const isDoubleDelimiter = text[candidate + 1] === "$";
        if (
          (delimiterLength === 2 && isDoubleDelimiter) ||
          (delimiterLength === 1 && !isDoubleDelimiter)
        ) {
          closingIndex = candidate;
          break;
        }
      }

      const escapedOpening = escaped && delimiterLength === 1;
      let expressionEnd = closingIndex;
      if (
        escapedOpening &&
        expressionEnd < 0 &&
        TEX_COMMAND_RE.test(text.slice(index + 1))
      ) {
        expressionEnd = findTexUnitEnd(text, index + 1);
      }

      if (expressionEnd < 0) {
        index++;
        continue;
      }

      const expression = text.slice(index + delimiterLength, expressionEnd);
      if (escapedOpening && !TEX_COMMAND_RE.test(expression)) {
        index++;
        continue;
      }

      const openingStart =
        escapedOpening && isEscapedCharacter(text, index) ? index - 1 : index;
      segments.push({ text: text.slice(textStart, openingStart) });
      segments.push({
        expression,
        displayMode: delimiterLength === 2,
      });
      textStart =
        expressionEnd === closingIndex
          ? closingIndex + delimiterLength
          : expressionEnd;
      index = textStart;
    }

    segments.push({ text: text.slice(textStart) });
    return segments;
  }

  function naturalSortStrings(left, right) {
    const normalize = (value) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
    const a = normalize(left);
    const b = normalize(right);
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;

    const aParts = a.match(/\d+|\D+/g) || [a];
    const bParts = b.match(/\d+|\D+/g) || [b];
    const length = Math.max(aParts.length, bParts.length);

    for (let index = 0; index < length; index++) {
      const aPart = aParts[index] || "";
      const bPart = bParts[index] || "";
      const aIsNum = /^\d+$/.test(aPart);
      const bIsNum = /^\d+$/.test(bPart);

      if (aIsNum && bIsNum) {
        const diff = Number(aPart) - Number(bPart);
        if (diff !== 0) return diff;
        continue;
      }
      if (aIsNum !== bIsNum) return aIsNum ? -1 : 1;

      const textDiff = aPart.localeCompare(bPart, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (textDiff !== 0) return textDiff;
    }

    return NATURAL_SORT_COLLATOR
      ? NATURAL_SORT_COLLATOR.compare(a, b)
      : a.localeCompare(b);
  }

  function formatQuestionText(text, options = {}) {
    if (!text) return "";

    const revealCloze = Boolean(options.revealCloze);
    const formatLists = options.formatLists !== false;
    const clozeEnabled =
      options.clozeEnabled ?? globalScope.state?.prefs?.clozeEnabled !== false;
    const katexAvailable =
      typeof globalScope.katex?.renderToString === "function";
    const normalizedText = stripQuestionNumberPrefix(text);
    const cacheKey = `${clozeEnabled ? "1" : "0"}|${revealCloze ? "1" : "0"}|${formatLists ? "1" : "0"}|${katexAvailable ? "1" : "0"}|${normalizedText}`;

    return memoizeBounded(
      formatTextCache,
      cacheKey,
      () => {
        function formatNonMathSegment(segment) {
          let safeSegment = escapeHTML(unescapeCurrencyMarkers(segment));

          if (clozeEnabled) {
            safeSegment = safeSegment.replace(
              CLOZE_RE,
              function (_match, innerText) {
                const safeInner = escapeHTML(String(innerText || "").trim());
                const safeInnerValue = safeInner || "••••";
                const clozeVisual = revealCloze
                  ? `<span class="cloze-answer text-brand-700 dark:text-brand-300">${safeInnerValue}</span>`
                  : `<span class="cloze-answer hidden">${safeInnerValue}</span>`;

                return `<span class="cloze-token inline-flex items-center">
        <button type="button" class="cloze-trigger rounded border border-dashed border-brand-500 px-2 py-0.5 text-xs font-bold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-200 ${revealCloze ? "cloze-visible" : ""}" data-action="revealClozeAnswer" data-action-args='[{"__mrhActionArgument":"element"}]' data-action-prevent-default="true" data-action-stop-propagation="true">
          <span class="cloze-mask">${revealCloze ? safeInnerValue : "□ □ □"}</span>
          ${clozeVisual}
        </button>
      </span>`;
              },
            );
          }

          if (formatLists) {
            safeSegment = safeSegment.replace(LIST_RE, "<br><br>$1 ");
            if (safeSegment.startsWith("<br><br>")) {
              safeSegment = safeSegment.substring(8);
            }
          }
          return safeSegment;
        }

        return findMathSegments(String(normalizedText))
          .map((segment) =>
            Object.prototype.hasOwnProperty.call(segment, "expression")
              ? renderMathExpression(segment.expression, segment.displayMode)
              : formatNonMathSegment(segment.text),
          )
          .join("");
      },
      FORMAT_CACHE_LIMIT,
    );
  }

  function encodeHandlerValue(value) {
    return encodeURIComponent(String(value ?? "")).replace(/'/g, "%27");
  }

  function decodeHandlerValue(value) {
    try {
      return decodeURIComponent(String(value ?? ""));
    } catch (error) {
      return String(value ?? "");
    }
  }

  const TextUtils = {
    escapeHTML,
    scrambleWords,
    renderMathExpression,
    isSafeImageURL,
    stripQuestionNumberPrefix,
    naturalSortStrings,
    formatQuestionText,
    encodeHandlerValue,
    decodeHandlerValue,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = TextUtils;
  }

  globalScope.TextUtils = TextUtils;
})(typeof window !== "undefined" ? window : globalThis);
