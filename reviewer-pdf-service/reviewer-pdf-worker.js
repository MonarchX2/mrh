"use strict";

importScripts("./vendor/cantoo-pdf-lib-2.11.1.min.js");

self.postMessage({ status: "ready" });

const MAX_PAGES = 80;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 46 * 1024 * 1024;
const WATERMARK_FONT_ASSETS = {
  latin: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-latin.js",
  latinExt: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-latinExt.js",
  cyrillic: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-cyrillic.js",
  cyrillicExt: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-cyrillicExt.js",
  greek: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-greek.js",
  greekExt: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-greekExt.js",
  devanagari: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-devanagari.js",
  vietnamese: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-vietnamese.js",
  bengali: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-bengali.js",
  gujarati: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-gujarati.js",
  gurmukhi: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-gurmukhi.js",
  kannada: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-kannada.js",
  malayalam: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-malayalam.js",
  tamil: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-tamil.js",
  telugu: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-telugu.js",
  oriya: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-oriya.js",
  khmer: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-khmer.js",
  lao: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-lao.js",
  myanmar: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-myanmar.js",
  georgian: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-georgian.js",
  armenian: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-armenian.js",
  ethiopic: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-ethiopic.js",
  arabic: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-arabic.js",
  arabicSymbols: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-arabicSymbols.js",
  hebrew: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-hebrew.js",
  thai: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-thai.js",
  symbols: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-symbols.js",
  symbols2: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-symbols2.js",
  chineseSimplified: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-chineseSimplified.js",
  traditionalChinese: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-traditionalChinese.js",
  japanese: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-japanese.js",
  korean: "./vendor/watermark-fonts/reviewer-pdf-watermark-font-korean.js",
};
const CJK_WATERMARK_FONT_IDS = new Set([
  "chineseSimplified",
  "traditionalChinese",
  "japanese",
  "korean",
]);

function hasPdfEncryptionDictionary(bytes) {
  const marker = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74];
  for (let start = 0; start <= bytes.length - marker.length; start += 1) {
    if (marker.every((byte, offset) => bytes[start + offset] === byte))
      return true;
  }
  return false;
}

const WATERMARK_SCRIPT_FONT_IDS = {
  latin: ["latin", "latinExt", "vietnamese"],
  cyrillic: ["cyrillic", "cyrillicExt", "latinExt"],
  greek: ["greek", "greekExt", "latinExt"],
  arabic: ["arabic", "arabicSymbols"],
  hebrew: ["hebrew"],
  devanagari: ["devanagari"],
  bengali: ["bengali"],
  gujarati: ["gujarati"],
  gurmukhi: ["gurmukhi"],
  kannada: ["kannada"],
  malayalam: ["malayalam"],
  tamil: ["tamil"],
  telugu: ["telugu"],
  oriya: ["oriya"],
  khmer: ["khmer"],
  lao: ["lao"],
  myanmar: ["myanmar"],
  georgian: ["georgian"],
  armenian: ["armenian"],
  ethiopic: ["ethiopic"],
  thai: ["thai"],
};
const CJK_UNICODE_RANGES = [
  [0x2e80, 0x2fff],
  [0x3000, 0x30ff],
  [0x3100, 0x312f],
  [0x31a0, 0x31bf],
  [0x3400, 0x9fff],
  [0xac00, 0xd7af],
  [0xf900, 0xfaff],
  [0xff00, 0xffef],
  [0x20000, 0x3134f],
];
let activeOperationId = null;
let cancelledOperationId = null;
let watermarkBidi = null;
let unicodeWatermarkSupportLoaded = false;
const pendingOperations = [];
const watermarkFontSources = new Map();
const watermarkFontData = new Map();
const loadedWatermarkFontIds = new Set();
const watermarkGraphemeSegmenter = new Intl.Segmenter("und", {
  granularity: "grapheme",
});
const watermarkScriptPatterns = [
  ["latin", /^\p{Script=Latin}$/u],
  ["cyrillic", /^\p{Script=Cyrillic}$/u],
  ["greek", /^\p{Script=Greek}$/u],
  ["arabic", /^\p{Script=Arabic}$/u],
  ["hebrew", /^\p{Script=Hebrew}$/u],
  ["devanagari", /^\p{Script=Devanagari}$/u],
  ["bengali", /^\p{Script=Bengali}$/u],
  ["gujarati", /^\p{Script=Gujarati}$/u],
  ["gurmukhi", /^\p{Script=Gurmukhi}$/u],
  ["kannada", /^\p{Script=Kannada}$/u],
  ["malayalam", /^\p{Script=Malayalam}$/u],
  ["tamil", /^\p{Script=Tamil}$/u],
  ["telugu", /^\p{Script=Telugu}$/u],
  ["oriya", /^\p{Script=Oriya}$/u],
  ["khmer", /^\p{Script=Khmer}$/u],
  ["lao", /^\p{Script=Lao}$/u],
  ["myanmar", /^\p{Script=Myanmar}$/u],
  ["georgian", /^\p{Script=Georgian}$/u],
  ["armenian", /^\p{Script=Armenian}$/u],
  ["ethiopic", /^\p{Script=Ethiopic}$/u],
  ["thai", /^\p{Script=Thai}$/u],
  ["han", /^\p{Script=Han}$/u],
  ["hiragana", /^\p{Script=Hiragana}$/u],
  ["katakana", /^\p{Script=Katakana}$/u],
  ["hangul", /^\p{Script=Hangul}$/u],
  ["bopomofo", /^\p{Script=Bopomofo}$/u],
];
const watermarkDefaultIgnorablePattern =
  /^\p{Default_Ignorable_Code_Point}$/u;
const watermarkBidiControlPattern = /\p{Bidi_Control}/u;

function decodeWatermarkFont(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function canEncodeStandardWatermarkText(font, text) {
  if (
    !/^[\x20-\x7e\u00a0-\u00ff\u0192\u02c6\u02dc\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]*$/.test(
      text,
    )
  )
    return false;
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

function createStandardFontWatermarkFallback(font, text) {
  return Array.from(
    String(text).normalize("NFKD").replace(/\p{M}/gu, ""),
    (character) =>
      canEncodeStandardWatermarkText(font, character) ? character : "?",
  ).join("");
}

function ensureUnicodeWatermarkSupport() {
  if (unicodeWatermarkSupportLoaded) return;
  importScripts(
    "./vendor/runtime/reviewer-pdf-regenerator-runtime-0.14.1.js",
    "./vendor/runtime/reviewer-pdf-bidi-1.1.0.min.js",
    "./vendor/runtime/reviewer-pdf-fontkit-2.0.12.min.js",
  );
  watermarkBidi = bidi_js();
  unicodeWatermarkSupportLoaded = true;
}

function isCjkCodePoint(codePoint) {
  return CJK_UNICODE_RANGES.some(
    ([minimum, maximum]) => codePoint >= minimum && codePoint <= maximum,
  );
}

function ensureWatermarkFont(fontId) {
  if (loadedWatermarkFontIds.has(fontId)) return;
  const assetPath = WATERMARK_FONT_ASSETS[fontId];
  if (!assetPath)
    throw new Error(
      "A required bundled Unicode watermark font is unavailable. Reload the Reviewer page and retry; no PDF was produced.",
    );
  importScripts(assetPath);
  loadedWatermarkFontIds.add(fontId);
}

function preferredCjkFontIds(text) {
  const codePoints = Array.from(text, (character) => character.codePointAt(0));
  if (codePoints.some((codePoint) => codePoint >= 0xac00 && codePoint <= 0xd7af))
    return ["korean", ...CJK_WATERMARK_FONT_IDS];
  if (
    codePoints.some(
      (codePoint) =>
        (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
        (codePoint >= 0x31f0 && codePoint <= 0x31ff),
    )
  )
    return ["japanese", ...CJK_WATERMARK_FONT_IDS];
  if (codePoints.some((codePoint) => codePoint >= 0x3100 && codePoint <= 0x312f))
    return ["traditionalChinese", ...CJK_WATERMARK_FONT_IDS];
  return CJK_WATERMARK_FONT_IDS;
}

function getWatermarkFontSource(fontId) {
  if (watermarkFontSources.has(fontId))
    return watermarkFontSources.get(fontId);
  ensureWatermarkFont(fontId);
  const sourceData = self.MRH_PDF_WATERMARK_FONTS?.[fontId];
  if (typeof sourceData !== "string")
    throw new Error(
      "A required bundled Unicode watermark font is unavailable. Reload the Reviewer page and retry; no PDF was produced.",
    );
  const source = watermarkFontkit.create(decodeWatermarkFont(sourceData));
  watermarkFontSources.set(fontId, source);
  return source;
}

function getWatermarkFontBytes(fontId) {
  if (watermarkFontData.has(fontId)) return watermarkFontData.get(fontId);
  ensureWatermarkFont(fontId);
  const sourceData = self.MRH_PDF_WATERMARK_FONTS?.[fontId];
  if (typeof sourceData !== "string")
    throw new Error(
      "A required bundled Unicode watermark font is unavailable. Reload the Reviewer page and retry; no PDF was produced.",
    );
  const bytes = decodeWatermarkFont(sourceData);
  watermarkFontData.set(fontId, bytes);
  return bytes;
}

function guardMissingWatermarkAnchors(font) {
  const processor = font._layoutEngine?.engine?.GPOSProcessor;
  if (!processor || typeof processor.applyAnchor !== "function") return;
  const applyAnchor = processor.applyAnchor;
  processor.applyAnchor = function (markRecord, baseAnchor, baseGlyphIndex) {
    // Skip an absent GPOS attachment; Noto Gurmukhi contains optional anchors.
    if (!markRecord?.markAnchor || !baseAnchor) return;
    return applyAnchor.call(this, markRecord, baseAnchor, baseGlyphIndex);
  };
}

const watermarkFontkit = {
  create(fontData, postscriptName) {
    const font = fontkit.create(fontData, postscriptName);
    guardMissingWatermarkAnchors(font);
    return font;
  },
};

function appendGlyphOutlineOperators(
  operators,
  path,
  transform,
  outlineOperatorCache,
) {
  if (!path?.commands?.length) return;
  let outlineOperators = outlineOperatorCache.get(path);
  if (!outlineOperators) {
    outlineOperators = [];
    let currentX = 0;
    let currentY = 0;
    for (const { command, args } of path.commands) {
      if (command === "moveTo") {
        outlineOperators.push(PDFLib.moveTo(args[0], args[1]));
        currentX = args[0];
        currentY = args[1];
      } else if (command === "lineTo") {
        outlineOperators.push(PDFLib.lineTo(args[0], args[1]));
        currentX = args[0];
        currentY = args[1];
      } else if (command === "quadraticCurveTo") {
        const [controlX, controlY, x, y] = args;
        outlineOperators.push(
          PDFLib.appendBezierCurve(
            currentX + ((controlX - currentX) * 2) / 3,
            currentY + ((controlY - currentY) * 2) / 3,
            x + ((controlX - x) * 2) / 3,
            y + ((controlY - y) * 2) / 3,
            x,
            y,
          ),
        );
        currentX = x;
        currentY = y;
      } else if (command === "bezierCurveTo") {
        outlineOperators.push(PDFLib.appendBezierCurve(...args));
        currentX = args[4];
        currentY = args[5];
      } else if (command === "closePath") {
        outlineOperators.push(PDFLib.closePath());
      } else {
        throw new Error(
          "The PDF worker encountered an unsupported embedded-font outline. No PDF was produced.",
        );
      }
    }
    outlineOperatorCache.set(path, outlineOperators);
  }
  operators.push(
    PDFLib.pushGraphicsState(),
    PDFLib.concatTransformationMatrix(...transform),
  );
  outlineOperators.forEach((operator) => operators.push(operator));
  operators.push(PDFLib.fill(), PDFLib.popGraphicsState());
}

function getWatermarkFontCandidates(codePoint, cjkFontOrder, preferredScript) {
  if (codePoint <= 0x7e) return ["latin"];
  if (isCjkCodePoint(codePoint))
    return [
      ...(cjkFontOrder ||
        ["japanese", "chineseSimplified", "traditionalChinese", "korean"]),
      "symbols",
      "symbols2",
    ];
  const characterScript = getWatermarkScript(
    String.fromCodePoint(codePoint),
  );
  return [
    ...(WATERMARK_SCRIPT_FONT_IDS[characterScript] ||
      WATERMARK_SCRIPT_FONT_IDS[preferredScript] ||
      ["latinExt"]),
    "symbols",
    "symbols2",
  ];
}

function getWatermarkScript(text) {
  for (const character of text) {
    for (const [script, pattern] of watermarkScriptPatterns) {
      if (pattern.test(character)) return script;
    }
  }
  return "common";
}

function chooseWatermarkFontId(cluster, cjkFontOrder, previousFontId) {
  const preferredScript = getWatermarkScript(cluster);
  const codePoints = Array.from(cluster, (character) =>
    watermarkDefaultIgnorablePattern.test(character)
      ? null
      : character.codePointAt(0),
  ).filter((codePoint) => codePoint !== null);
  if (!codePoints.length) return previousFontId || "latin";
  const candidates = getWatermarkFontCandidates(
    codePoints.find((codePoint) => codePoint > 0x7e) || codePoints[0],
    cjkFontOrder,
    preferredScript,
  );
  const orderedCandidates = previousFontId && candidates.includes(previousFontId)
    ? [previousFontId, ...candidates.filter((fontId) => fontId !== previousFontId)]
    : candidates;
  return (
    orderedCandidates.find((fontId) => {
      const characterSet = getWatermarkFontSource(fontId).characterSet;
      return codePoints.every((codePoint) => characterSet.includes(codePoint));
    }) || null
  );
}

function reorderWatermarkRuns(runs) {
  const orderedRuns = [...runs];
  const highestLevel = Math.max(...orderedRuns.map(({ level }) => level));
  const lowestOddLevel = orderedRuns
    .map(({ level }) => level)
    .filter((level) => level % 2 === 1)
    .reduce((lowest, level) => Math.min(lowest, level), Infinity);
  if (!Number.isFinite(lowestOddLevel)) return orderedRuns;
  for (let level = highestLevel; level >= lowestOddLevel; level -= 1) {
    let start = 0;
    while (start < orderedRuns.length) {
      if (orderedRuns[start].level < level) {
        start += 1;
        continue;
      }
      let end = start + 1;
      while (
        end < orderedRuns.length &&
        orderedRuns[end].level >= level
      )
        end += 1;
      orderedRuns.splice(start, end - start, ...orderedRuns
        .slice(start, end)
        .reverse());
      start = end;
    }
  }
  return orderedRuns;
}

async function createWatermarkTextLayout(pdf, text, standardFont) {
  const font =
    standardFont || (await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold));
  if (canEncodeStandardWatermarkText(font, text)) {
    return {
      widthOfTextAtSize(size) {
        return font.widthOfTextAtSize(text, size);
      },
      runs: [
        {
          font,
          isRightToLeft: false,
          code: font.encodeText(text),
          advanceWidth: font.widthOfTextAtSize(text, 1),
          unitsPerEm: 1,
        },
      ],
    };
  }
  ensureUnicodeWatermarkSupport();
  const cjkFontOrder = preferredCjkFontIds(text);
  const embeddedFonts = new Map();

  const getEmbeddedFont = async (fontId) => {
    if (embeddedFonts.has(fontId)) return embeddedFonts.get(fontId);
    const embeddedFont = await pdf.embedFont(getWatermarkFontBytes(fontId), {
      subset: true,
    });
    embeddedFonts.set(fontId, embeddedFont);
    return embeddedFont;
  };

  const embeddingLevels = watermarkBidi.getEmbeddingLevels(text);
  const clusters = Array.from(
    watermarkGraphemeSegmenter.segment(text),
    ({ segment, index }) => {
      let clusterOffset = index;
      let visualText = "";
      for (const character of segment) {
        const mirroredCharacter =
          embeddingLevels.levels[clusterOffset] % 2
            ? watermarkBidi.getMirroredCharacter(character)
            : null;
        visualText += mirroredCharacter || character;
        clusterOffset += character.length;
      }
      return {
        text: visualText,
        index,
        level: embeddingLevels.levels[index],
        script: getWatermarkScript(segment),
      };
    },
  );
  let previousFontId = null;
  for (const cluster of clusters) {
    cluster.fontId = chooseWatermarkFontId(
      cluster.text,
      cjkFontOrder,
      previousFontId,
    );
    if (!cluster.fontId) {
      throw new Error(
        "The account name or email contains a character unavailable in the bundled PDF watermark fonts. Update the identity to supported characters or contact support; no PDF was produced.",
      );
    }
    previousFontId = cluster.fontId;
  }

  for (let index = 0; index < clusters.length; index += 1) {
    if (clusters[index].script !== "common") continue;
    clusters[index].script =
      clusters[index - 1]?.script ||
      clusters
        .slice(index + 1)
        .find(({ script }) => script !== "common")?.script ||
      "latin";
  }

  const logicalRuns = [];
  for (const cluster of clusters) {
    const lastRun = logicalRuns[logicalRuns.length - 1];
    if (
      lastRun &&
      lastRun.fontId === cluster.fontId &&
      lastRun.script === cluster.script &&
      lastRun.level === cluster.level
    ) {
      lastRun.text += cluster.text;
    } else {
      logicalRuns.push({
        text: cluster.text,
        fontId: cluster.fontId,
        script: cluster.script,
        level: cluster.level,
      });
    }
  }

  const visualRuns = reorderWatermarkRuns(logicalRuns);
  const shapedRuns = await Promise.all(
    visualRuns.map(async (run) => ({
      run,
      font: await getEmbeddedFont(run.fontId),
      shaped: null,
    })),
  );
  const glyphIdsByFont = new Map();
  for (const shapedRun of shapedRuns) {
    const { run, font } = shapedRun;
    const shaped = font.embedder.font.layout(run.text);
    if (shaped.glyphs.some(({ id }) => id === 0)) {
      throw new Error(
        "The account name or email contains a character unavailable in the bundled PDF watermark fonts. Update the identity to supported characters or contact support; no PDF was produced.",
      );
    }
    shapedRun.shaped = shaped;
    if (!glyphIdsByFont.has(font)) glyphIdsByFont.set(font, new Set());
    const glyphIds = glyphIdsByFont.get(font);
    shaped.glyphs.forEach(({ id }) => glyphIds.add(id));
  }
  for (const [font, glyphIds] of glyphIdsByFont) {
    const subset = font.embedder.subset;
    if (!subset) continue;
    if (typeof subset.includeGlyph !== "function") {
      throw new Error(
        "Unicode watermark font subsetting could not be prepared safely. Reload the Reviewer page and retry; no PDF was produced.",
      );
    }
    Array.from(glyphIds)
      .sort((left, right) => left - right)
      .forEach((glyphId) => subset.includeGlyph(glyphId));
  }
  const fontRuns = [];
  for (const { run, font, shaped } of shapedRuns) {
    const encodedGlyphIds = font
      .encodeText(run.text)
      .asString()
      .match(/.{4}/g);
    if (!encodedGlyphIds || encodedGlyphIds.length !== shaped.glyphs.length) {
      throw new Error(
        "The account name or email could not be shaped for the PDF watermark. Update the identity to supported characters or contact support; no PDF was produced.",
      );
    }
    const expectedDirection = run.level % 2 ? "rtl" : "ltr";
    const needsReverse =
      shaped.direction &&
      shaped.direction !== expectedDirection;
    const glyphIndexes = shaped.glyphs.map((_, index) => index);
    if (needsReverse) glyphIndexes.reverse();
    const glyphs = glyphIndexes.map((index) => ({
      code: PDFLib.PDFHexString.of(encodedGlyphIds[index]),
      codePoints: shaped.glyphs[index].codePoints,
      path: shaped.glyphs[index].path,
      position: shaped.positions[index],
    }));
    const unitsPerEm = font.embedder.font.unitsPerEm;
    const advanceWidth = shaped.positions.reduce(
      (total, { xAdvance }) => total + xAdvance,
      0,
    );
    fontRuns.push({
      text: run.text,
      font,
      fontId: run.fontId,
      isRightToLeft: run.level % 2 === 1,
      glyphs,
      unitsPerEm,
      advanceWidth,
    });
  }

  return {
    widthOfTextAtSize(size) {
      return fontRuns.reduce(
        (width, { advanceWidth, unitsPerEm }) =>
          width + (advanceWidth / unitsPerEm) * size,
        0,
      );
    },
    runs: fontRuns,
  };
}

function throwIfCancelled(operationId) {
  if (cancelledOperationId === operationId) {
    const error = new Error("PDF preview processing was cancelled.");
    error.name = "AbortError";
    throw error;
  }
}

function decodeBase64Pdf(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function timingNow() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function sanitizeWatermarkText(value, maxLength) {
  if (typeof value !== "string")
    throw new Error(
      "Verified account details are invalid. Refresh the Reviewer session and try again.",
    );
  const rawText = value;
  if (watermarkBidiControlPattern.test(rawText))
    throw new Error(
      "Account details contain unsupported direction controls. Update the profile and retry.",
    );
  for (let index = 0; index < rawText.length; index += 1) {
    const codeUnit = rawText.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = rawText.charCodeAt(index + 1);
      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff))
        throw new Error(
          "Account details contain malformed Unicode. Update the profile and retry.",
        );
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error(
        "Account details contain malformed Unicode. Update the profile and retry.",
      );
    }
  }
  const sanitized = rawText
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (Array.from(sanitized).length > maxLength)
    throw new Error(
      "Account details exceed the supported PDF length. Shorten the profile name and retry.",
    );
  return sanitized;
}

async function createWatermarkedPdf(
  sourceBuffer,
  sourceBase64,
  identity,
  operationId,
) {
  const startedAt = timingNow();
  throwIfCancelled(operationId);
  if (typeof PDFLib === "undefined" || !PDFLib.PDFDocument)
    throw new Error("The PDF processor could not be loaded.");
  if (
    (typeof sourceBase64 === "string" &&
      sourceBase64.length > Math.ceil(MAX_SOURCE_BYTES / 3) * 4) ||
    (typeof sourceBase64 !== "string" &&
      (!sourceBuffer || sourceBuffer.byteLength > MAX_SOURCE_BYTES))
  )
    throw new Error("The source PDF exceeds the 16 MiB processing limit.");
  const decodeStartedAt = timingNow();
  const source =
    typeof sourceBase64 === "string"
      ? decodeBase64Pdf(sourceBase64)
      : new Uint8Array(sourceBuffer);
  const decodeMs = timingNow() - decodeStartedAt;
  throwIfCancelled(operationId);
  if (source.byteLength > MAX_SOURCE_BYTES)
    throw new Error("The source PDF exceeds the 16 MiB processing limit.");
  const hasPdfHeader = source
    .subarray(0, 1024)
    .some(
      (byte, index, header) =>
        byte === 0x25 &&
        header[index + 1] === 0x50 &&
        header[index + 2] === 0x44 &&
        header[index + 3] === 0x46 &&
        header[index + 4] === 0x2d,
    );
  if (!source.byteLength || !hasPdfHeader)
    throw new Error("The source PDF is invalid.");

  const fullName = sanitizeWatermarkText(identity?.fullName, 160);
  const email = sanitizeWatermarkText(identity?.email, 254);
  if (
    typeof identity?.downloadFileName !== "string" ||
    !identity.downloadFileName.trim()
  )
    throw new Error(
      "The required backend filename is missing or invalid. Refresh the Reviewer session and retry.",
    );
  const downloadFileName = sanitizeWatermarkText(
    identity?.downloadFileName,
    255,
  );
  const issuanceReference = sanitizeWatermarkText(
    identity?.issuanceReference,
    48,
  );
  if (!fullName)
    throw new Error(
      "The verified account name is empty. Update the Reviewer profile and retry.",
    );
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error(
      "The verified account email is invalid. Sign in again or update the profile before retrying.",
    );
  if (email.length > 254)
    throw new Error(
      "The verified account email exceeds the supported length. Update the profile and retry.",
    );
  if (
    !/^MRH-[0-9]{4}-[0-9]{4}$/.test(issuanceReference) ||
    downloadFileName.length > 255 ||
    !/^[^<>:"/\\|?*\u0000-\u001f]{1,255}\.pdf$/i.test(downloadFileName)
  )
    throw new Error(
      "Required protected PDF details are invalid. Refresh the Reviewer session and retry.",
    );

  let pdf;
  const parseStartedAt = timingNow();
  try {
    pdf = await PDFLib.PDFDocument.load(source, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch {
    throw new Error("The source PDF could not be safely processed.");
  }
  throwIfCancelled(operationId);
  const pdfParseMs = timingNow() - parseStartedAt;

  const pages = pdf.getPages();
  if (!pages.length) throw new Error("The PDF has no pages.");
  if (pages.length > MAX_PAGES)
    throw new Error("The PDF exceeds the 80-page processing limit.");

  const watermarkStartedAt = timingNow();
  const font = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  let lines = [fullName, email];
  const hasUnicodeIdentity = lines.some(
    (line) => !canEncodeStandardWatermarkText(font, line),
  );
  let unicodeFallbackReason = "";
  if (hasUnicodeIdentity) {
    try {
      ensureUnicodeWatermarkSupport();
      if (
        typeof fontkit === "undefined" ||
        typeof pdf.registerFontkit !== "function"
      )
        throw new Error("Unicode font support is unavailable.");
      pdf.registerFontkit(watermarkFontkit);
    } catch (error) {
      unicodeFallbackReason = String(error?.message || error);
      lines = lines.map((line) =>
        createStandardFontWatermarkFallback(font, line),
      );
    }
  }
  const encodedPattern = font.encodeText("MRH");
  const createTextLayouts = async () => {
    const layouts = new Map();
    for (const line of [...lines, issuanceReference]) {
      if (!layouts.has(line))
        layouts.set(line, await createWatermarkTextLayout(pdf, line, font));
    }
    return layouts;
  };
  let textLayouts;
  try {
    textLayouts = await createTextLayouts();
  } catch (error) {
    if (!hasUnicodeIdentity || unicodeFallbackReason) throw error;
    unicodeFallbackReason = String(error?.message || error);
    lines = lines.map((line) =>
      createStandardFontWatermarkFallback(font, line),
    );
    textLayouts = await createTextLayouts();
  }
  const actualTextPropertiesByLine = new Map();
  for (const line of [...lines, issuanceReference]) {
    if (actualTextPropertiesByLine.has(line)) continue;
    const properties = PDFLib.PDFDict.withContext(pdf.context);
    properties.set(
      PDFLib.PDFName.of("ActualText"),
      PDFLib.PDFHexString.fromText(line),
    );
    actualTextPropertiesByLine.set(line, properties);
  }
  const widthCache = new Map();
  const textWidth = (text, size) => {
    const key = `${size}\n${text}`;
    if (!widthCache.has(key))
      widthCache.set(
        key,
        textLayouts.get(text).widthOfTextAtSize(size),
      );
    return widthCache.get(key);
  };

  const watermarkGlyphOutlineOperatorCache = new WeakMap();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    throwIfCancelled(operationId);
    const page = pages[pageIndex];
    const size = page.getSize();
    const shortSide = Math.min(size.width, size.height);
    const watermarkTextLines = [];
    let fontSize = Math.max(
      6,
      Math.min(12, Math.min(size.width, size.height) * 0.02),
    );
    const getFontSize = (maxWidth, maximum = fontSize, minimum = 3.5) => {
      let selectedFontSize = maximum;
      while (
        lines.some((line) => textWidth(line, selectedFontSize) > maxWidth) &&
        selectedFontSize > minimum
      )
        selectedFontSize = Math.max(minimum, selectedFontSize - 0.5);
      if (lines.some((line) => textWidth(line, selectedFontSize) > maxWidth))
        throw new Error("Account details exceed the supported PDF limits.");
      return selectedFontSize;
    };
    const drawBlock = (centerX, centerY, angle, blockFontSize) => {
      const emailFontSize = blockFontSize * 0.8;
      const lineGap = blockFontSize * 0.82;
      const radians = (angle * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      [
        { line: lines[0], size: blockFontSize, lineCenterY: lineGap / 2 },
        { line: lines[1], size: emailFontSize, lineCenterY: -lineGap / 2 },
      ].forEach(({ line, size, lineCenterY }) => {
        const localX = -textWidth(line, size) / 2;
        const localY = lineCenterY - size * 0.35;
        watermarkTextLines.push({
          line,
          size,
          matrix: [
            cos,
            sin,
            -sin,
            cos,
            centerX + localX * cos - localY * sin,
            centerY + localX * sin + localY * cos,
          ],
        });
      });
      const accountBlockWidth = Math.max(
        ...lines.map((line) => textWidth(line, blockFontSize)),
      );
      const referenceSizeLimit = emailFontSize * 0.5;
      const referenceFontSize = Math.min(
        referenceSizeLimit,
        (accountBlockWidth * 0.92) / textWidth(issuanceReference, 1),
      );
      const referenceLocalX =
        -textWidth(issuanceReference, referenceFontSize) / 2;
      const referenceLocalY =
        -lineGap / 2 -
        (emailFontSize + referenceFontSize) * 0.55 -
        referenceFontSize * 0.35;
      watermarkTextLines.push({
        line: issuanceReference,
        size: referenceFontSize,
        matrix: [
          cos,
          sin,
          -sin,
          cos,
          centerX + referenceLocalX * cos - referenceLocalY * sin,
          centerY + referenceLocalX * sin + referenceLocalY * cos,
        ],
      });
    };

    const interiorFontSize = getFontSize(
      shortSide * 0.4,
      fontSize,
      5.5,
    );
    const perimeterFontSize = getFontSize(
      Math.min(size.width * 0.32, size.height * 0.32),
      interiorFontSize * 0.8,
      3.5,
    );
    const smallFontSize = getFontSize(
      Math.min(size.width * 0.32, size.height * 0.32),
      perimeterFontSize * 0.7,
      2.5,
    );
    const edgeFontSize = getFontSize(
      shortSide * 0.3,
      perimeterFontSize * 0.55,
      1.5,
    );
    const perimeterMargin = perimeterFontSize * 2.5;
    [0.17, 0.5, 0.83].forEach((x) => {
      drawBlock(
        size.width * x,
        size.height - perimeterMargin,
        0,
        perimeterFontSize,
      );
      drawBlock(size.width * x, perimeterMargin, 0, perimeterFontSize);
    });
    [0.17, 0.5, 0.83].forEach((y) => {
      drawBlock(
        perimeterMargin,
        size.height * y,
        90,
        perimeterFontSize,
      );
      drawBlock(
        size.width - perimeterMargin,
        size.height * y,
        90,
        perimeterFontSize,
      );
    });

    const drawEdgeRun = (length, centerX, centerY, angle) => {
      const labels = [];
      let runLength = 0;
      let labelIndex = 0;
      while (runLength < length) {
        const line = lines[labelIndex % 2];
        const lineWidth = textWidth(line, edgeFontSize);
        if (
          labels.length > 0 &&
          runLength + edgeFontSize * 0.8 + lineWidth > length
        )
          break;
        labels.push({ line, width: lineWidth });
        runLength += lineWidth + edgeFontSize * 0.8;
        labelIndex += 1;
      }
      if (!labels.length) return;
      runLength -= edgeFontSize * 0.8;
      let cursor = (length - runLength) / 2;
      labels.forEach(({ line, width }) => {
        const labelCenter = cursor + width / 2;
        const horizontal = angle === 0;
        const textCenterX = horizontal ? centerX + labelCenter : centerX;
        const textCenterY = horizontal ? centerY : centerY + labelCenter;
        const radians = (angle * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const localX = -width / 2;
        const localY = -edgeFontSize * 0.35;
        watermarkTextLines.push({
          line,
          size: edgeFontSize,
          matrix: [
            cos,
            sin,
            -sin,
            cos,
            textCenterX + localX * cos - localY * sin,
            textCenterY + localX * sin + localY * cos,
          ],
        });
        cursor += width + edgeFontSize * 0.8;
      });
    };
    const edgeTextInset = edgeFontSize * 0.8;
    drawEdgeRun(
      size.width,
      0,
      size.height - edgeFontSize * 0.4,
      0,
    );
    drawEdgeRun(size.width, 0, edgeFontSize * 0.6, 0);
    drawEdgeRun(
      size.height,
      edgeTextInset - edgeFontSize * 0.35,
      0,
      90,
    );
    drawEdgeRun(
      size.height,
      size.width - edgeTextInset + edgeFontSize * 0.35,
      0,
      -90,
    );
    const referenceFooterFontSize = Math.max(
      1,
      Math.min(
        2,
        smallFontSize * 0.7,
        (size.width - 24) / textWidth(issuanceReference, 1),
      ),
    );
    watermarkTextLines.push({
      line: issuanceReference,
      size: referenceFooterFontSize,
      matrix: [
        1,
        0,
        0,
        1,
        (size.width - textWidth(issuanceReference, referenceFooterFontSize)) /
          2,
        referenceFooterFontSize * 1.5,
      ],
    });

    const interiorTextWidth = Math.max(
      ...lines.map((line) => textWidth(line, interiorFontSize)),
    );
    const interiorLineHeight = interiorFontSize * 1.15;
    const diagonalAngle = -25;
    const diagonalRadians = (diagonalAngle * Math.PI) / 180;
    const diagonalHeight =
      interiorTextWidth * Math.abs(Math.sin(diagonalRadians)) +
      interiorLineHeight * Math.abs(Math.cos(diagonalRadians));
    const targetRowSpacing = Math.max(
      shortSide * 0.18,
      diagonalHeight * 1.3,
    );
    const firstRowY = size.height * 0.12;
    const lastRowY = size.height * 0.88;
    const rowCount = Math.max(
      2,
      Math.floor((lastRowY - firstRowY) / targetRowSpacing) + 1,
    );
    const rowSpacing = (lastRowY - firstRowY) / (rowCount - 1);

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const y = firstRowY + rowIndex * rowSpacing;
      [0.23, 0.77].forEach((x) => {
        drawBlock(
          size.width * x,
          y,
          diagonalAngle,
          interiorFontSize,
        );
      });
      if (rowIndex < rowCount - 1) {
        const centerY = y + rowSpacing / 2;
        drawBlock(size.width * 0.5, centerY, 0, interiorFontSize);
        [0.12, 0.88].forEach((x) => {
          drawBlock(size.width * x, centerY, 0, smallFontSize);
        });
      }
      drawBlock(size.width * 0.5, y, 0, smallFontSize);
    }
    page.setFont(font);
    const patternFontSize = Math.max(2.2, Math.min(3, shortSide * 0.005));
    const patternOperators = [
      PDFLib.pushGraphicsState(),
      PDFLib.setGraphicsState(
        page.maybeEmbedGraphicsState({ opacity: 0.025 }),
      ),
      PDFLib.beginText(),
      PDFLib.setFontAndSize(page.getFont()[1], patternFontSize),
      PDFLib.setFillingColor(PDFLib.rgb(0.28, 0.28, 0.28)),
    ];
    const patternRows = Math.ceil(size.height / 104);
    const patternColumns = Math.ceil(size.width / 116);
    for (let patternRow = 0; patternRow < patternRows; patternRow += 1) {
      for (
        let patternColumn = 0;
        patternColumn < patternColumns;
        patternColumn += 1
      ) {
        const patternSeedIndex =
          (patternRow * patternColumns + patternColumn) %
          issuanceReference.length;
        const patternSeed = issuanceReference.charCodeAt(patternSeedIndex);
        patternOperators.push(
          PDFLib.setTextMatrix(
            1,
            0,
            0,
            1,
            12 + patternColumn * 116 + (patternSeed % 13),
            12 + patternRow * 104 + (patternSeed % 9),
          ),
          PDFLib.showText(encodedPattern),
        );
      }
    }
    patternOperators.push(PDFLib.endText(), PDFLib.popGraphicsState());
    page.pushOperators(...patternOperators);

    const pageFontKeys = new Map([[font, page.getFont()[1]]]);
    const getPageFontKey = (watermarkFont) => {
      if (!pageFontKeys.has(watermarkFont)) {
        page.setFont(watermarkFont);
        pageFontKeys.set(watermarkFont, page.getFont()[1]);
      }
      return pageFontKeys.get(watermarkFont);
    };
    const opacityKey = page.maybeEmbedGraphicsState({ opacity: 0.18 });
    const operators = [
      PDFLib.pushGraphicsState(),
      PDFLib.setGraphicsState(opacityKey),
      PDFLib.setFillingColor(PDFLib.rgb(0.24, 0.24, 0.24)),
    ];
    watermarkTextLines.forEach(({ line, size: blockFontSize, matrix }) => {
      let offset = 0;
      textLayouts.get(line).runs.forEach((run) => {
        const fontScale = blockFontSize / run.unitsPerEm;
        let glyphOffsetX = offset;
        let glyphOffsetY = 0;
        if (run.isRightToLeft) {
          run.glyphs.forEach(({ path, position }) => {
            const glyphX = glyphOffsetX + position.xOffset * fontScale;
            const glyphY = glyphOffsetY + position.yOffset * fontScale;
            const localX =
              glyphX * matrix[0] + glyphY * matrix[2];
            const localY =
              glyphX * matrix[1] + glyphY * matrix[3];
            appendGlyphOutlineOperators(
              operators,
              path,
              [
                matrix[0] * fontScale,
                matrix[1] * fontScale,
                matrix[2] * fontScale,
                matrix[3] * fontScale,
                matrix[4] + localX,
                matrix[5] + localY,
              ],
              watermarkGlyphOutlineOperatorCache,
            );
            glyphOffsetX += position.xAdvance * fontScale;
            glyphOffsetY += position.yAdvance * fontScale;
          });
        }
        offset +=
          (run.advanceWidth / run.unitsPerEm) * blockFontSize;
      });
    });
    operators.push(PDFLib.beginText());
    watermarkTextLines.forEach(({ line, size: blockFontSize, matrix }) => {
      let offset = 0;
      operators.push(
        PDFLib.PDFOperator.of(
          PDFLib.PDFOperatorNames.BeginMarkedContentSequence,
          [
            PDFLib.PDFName.of("Span"),
            actualTextPropertiesByLine.get(line),
          ],
        ),
      );
      const lineLayout = textLayouts.get(line);
      lineLayout.runs.forEach((run) => {
        const fontScale = blockFontSize / run.unitsPerEm;
        let glyphOffsetX = offset;
        let glyphOffsetY = 0;
        const fontKey = getPageFontKey(run.font);
        operators.push(PDFLib.setTextRenderingMode(run.isRightToLeft ? 3 : 0));
        if (run.code) {
          operators.push(
            PDFLib.setFontAndSize(fontKey, blockFontSize),
            PDFLib.setTextMatrix(
              matrix[0],
              matrix[1],
              matrix[2],
              matrix[3],
              matrix[4] + glyphOffsetX * fontScale,
              matrix[5] + glyphOffsetY * fontScale,
            ),
            PDFLib.showText(run.code),
          );
          offset +=
            (run.advanceWidth / run.unitsPerEm) * blockFontSize;
          return;
        }
        run.glyphs.forEach(({ code, position }) => {
          const glyphX =
            glyphOffsetX + position.xOffset * fontScale;
          const glyphY =
            glyphOffsetY + position.yOffset * fontScale;
          const localX =
            glyphX * matrix[0] + glyphY * matrix[2];
          const localY =
            glyphX * matrix[1] + glyphY * matrix[3];
          operators.push(
            PDFLib.setFontAndSize(fontKey, blockFontSize),
            PDFLib.setTextMatrix(
              matrix[0],
              matrix[1],
              matrix[2],
              matrix[3],
              matrix[4] + localX,
              matrix[5] + localY,
            ),
            PDFLib.showText(code),
          );
          glyphOffsetX += position.xAdvance * fontScale;
          glyphOffsetY += position.yAdvance * fontScale;
        });
        offset += (run.advanceWidth / run.unitsPerEm) * blockFontSize;
      });
      operators.push(PDFLib.endMarkedContent());
    });
    operators.push(PDFLib.endText(), PDFLib.popGraphicsState());
    for (
      let operatorIndex = 0;
      operatorIndex < operators.length;
      operatorIndex += 4096
    ) {
      page.pushOperators(
        ...operators.slice(operatorIndex, operatorIndex + 4096),
      );
    }
    if (pageIndex % 2 === 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      throwIfCancelled(operationId);
    }
  }

  pdf.setAuthor(fullName);
  pdf.setTitle(downloadFileName);
  pdf.setSubject(email);
  pdf.setKeywords([fullName, email, issuanceReference]);
  if (identity.downloadPassword !== undefined) {
    const downloadPassword = String(identity.downloadPassword);
    if (!/^\d{4}$/.test(downloadPassword))
      throw new Error("The PDF download password is invalid.");
    if (
      typeof crypto === "undefined" ||
      typeof crypto.getRandomValues !== "function"
    )
      throw new Error("Secure PDF encryption is unavailable in this browser.");
    const ownerPasswordBytes = crypto.getRandomValues(new Uint8Array(32));
    const ownerPassword = Array.from(
      ownerPasswordBytes,
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    pdf.encrypt({
      userPassword: downloadPassword,
      ownerPassword,
    });
  }
  const watermarkLayoutMs = timingNow() - watermarkStartedAt;
  const serializeStartedAt = timingNow();
  const watermarkedBytes = await pdf.save({
    useObjectStreams: true,
    objectsPerTick: 1000,
  });
  throwIfCancelled(operationId);
  const pdfSerializeMs = timingNow() - serializeStartedAt;
  if (watermarkedBytes.byteLength > MAX_OUTPUT_BYTES)
    throw new Error("The prepared PDF exceeds the 46 MiB processing limit.");
  if (
    watermarkedBytes.byteLength < 5 ||
    String.fromCharCode(...watermarkedBytes.slice(0, 5)) !== "%PDF-"
  )
    throw new Error("The prepared PDF is invalid.");
  if (
    identity.downloadPassword !== undefined &&
    !hasPdfEncryptionDictionary(watermarkedBytes)
  )
    throw new Error("The protected PDF download was not encrypted.");
  return {
    bytes: watermarkedBytes,
    sourceBuffer: source.buffer,
    metrics: {
      sourceByteLength: source.byteLength,
      decodeMs: decodeMs,
      outputByteLength: watermarkedBytes.byteLength,
      pageCount: pages.length,
      pdfParseMs: pdfParseMs,
      watermarkLayoutMs: watermarkLayoutMs,
      watermarkFontFallback: Boolean(unicodeFallbackReason),
      watermarkFontFallbackReason: unicodeFallbackReason,
      pdfSerializeMs: pdfSerializeMs,
      workerTotalMs: timingNow() - startedAt,
    },
  };
}

async function processOperation(data) {
  const operationId = data.operationId;
  activeOperationId = operationId;
  cancelledOperationId = null;
  try {
    const result =
      data.type === "encrypt"
        ? await createEncryptedPdf(
            data.sourceBuffer,
            data.identity?.downloadPassword,
            operationId,
          )
        : await createWatermarkedPdf(
            data.sourceBuffer,
            data.sourceBase64,
            data.identity,
            operationId,
          );
    const bytes = result.bytes;
    const resultBuffer =
      bytes.buffer instanceof ArrayBuffer &&
      bytes.byteOffset === 0 &&
      bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer
        : bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          );
    const sourceBuffer =
      data.type === "watermark" ? result.sourceBuffer : null;
    const transferables = [resultBuffer];
    if (sourceBuffer instanceof ArrayBuffer)
      transferables.push(sourceBuffer);
    self.postMessage(
      {
        status: "success",
        operationId,
        resultBuffer,
        sourceBuffer,
        metrics: result.metrics,
      },
      transferables,
    );
  } catch (error) {
    self.postMessage(
      cancelledOperationId === operationId
        ? { status: "cancelled", operationId }
        : {
            status: "error",
            operationId,
            message: String(error?.message || "The PDF could not be prepared."),
          },
    );
  } finally {
    activeOperationId = null;
    cancelledOperationId = null;
    const nextOperation = pendingOperations.shift();
    if (nextOperation) void processOperation(nextOperation);
  }
}

async function createEncryptedPdf(sourceBuffer, password, operationId) {
  const startedAt = timingNow();
  throwIfCancelled(operationId);
  if (typeof PDFLib === "undefined" || !PDFLib.PDFDocument)
    throw new Error("The PDF processor could not be loaded.");
  if (!(sourceBuffer instanceof ArrayBuffer) || sourceBuffer.byteLength < 5)
    throw new Error("The prepared PDF is invalid.");
  if (sourceBuffer.byteLength > MAX_OUTPUT_BYTES)
    throw new Error("The prepared PDF exceeds the 46 MiB processing limit.");
  const downloadPassword = String(password || "");
  if (!/^\d{4}$/.test(downloadPassword))
    throw new Error("The PDF download password is invalid.");
  if (
    typeof crypto === "undefined" ||
    typeof crypto.getRandomValues !== "function"
  )
    throw new Error("Secure PDF encryption is unavailable in this browser.");
  const source = new Uint8Array(sourceBuffer);
  if (
    String.fromCharCode(...source.subarray(0, 5)) !== "%PDF-"
  )
    throw new Error("The prepared PDF is invalid.");
  let pdf;
  const parseStartedAt = timingNow();
  try {
    pdf = await PDFLib.PDFDocument.load(source, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch {
    throw new Error("The prepared PDF could not be safely encrypted.");
  }
  const pdfParseMs = timingNow() - parseStartedAt;
  throwIfCancelled(operationId);
  const ownerPasswordBytes = crypto.getRandomValues(new Uint8Array(32));
  const ownerPassword = Array.from(
    ownerPasswordBytes,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const encryptionStartedAt = timingNow();
  pdf.encrypt({ userPassword: downloadPassword, ownerPassword });
  const encryptionMs = timingNow() - encryptionStartedAt;
  const serializeStartedAt = timingNow();
  const bytes = await pdf.save({
    useObjectStreams: true,
    objectsPerTick: 1000,
  });
  throwIfCancelled(operationId);
  if (bytes.byteLength > MAX_OUTPUT_BYTES)
    throw new Error("The prepared PDF exceeds the 46 MiB processing limit.");
  if (
    bytes.byteLength < 5 ||
    String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-"
  )
    throw new Error("The encrypted PDF is invalid.");
  if (!hasPdfEncryptionDictionary(bytes))
    throw new Error("The protected PDF download was not encrypted.");
  const pdfSerializeMs = timingNow() - serializeStartedAt;
  return {
    bytes,
    metrics: {
      sourceByteLength: source.byteLength,
      outputByteLength: bytes.byteLength,
      pageCount: pdf.getPageCount(),
      pdfParseMs,
      watermarkLayoutMs: 0,
      encryptionMs,
      pdfSerializeMs,
      workerTotalMs: timingNow() - startedAt,
    },
  };
}

self.onmessage = (event) => {
  const data = event.data || {};
  if (data.type === "cancel") {
    if (activeOperationId === data.operationId) {
      cancelledOperationId = data.operationId;
      return;
    }
    const pendingIndex = pendingOperations.findIndex(
      (operation) => operation.operationId === data.operationId,
    );
    if (pendingIndex >= 0) {
      pendingOperations.splice(pendingIndex, 1);
      self.postMessage({
        status: "cancelled",
        operationId: data.operationId,
      });
    }
    return;
  }
  if (!Number.isSafeInteger(data.operationId) || data.operationId < 1) {
    self.postMessage({
      status: "error",
      operationId: data.operationId,
      message: "The PDF processing request is invalid.",
    });
    return;
  }
  if (activeOperationId !== null) {
    pendingOperations.push(data);
    return;
  }
  void processOperation(data);
};
