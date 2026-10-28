(function (globalScope) {
  "use strict";

  const COURSE_TITLES = {
    SEAM5: "SHIP HANDLING AND MANEUVERING",
    NGEC8: "ETHICS",
    NAV6: "OPERATIONAL USE OF ECDIS",
    NGEC10: "SOCIAL SCIENCE AND PHILOSOPHY",
    "SHIP'S AUDIT": "SHIP AUDITING SYSTEM",
    MARLAW: "MARITIME LAW",
    NGEC3: "THE CONTEMPORARY WORLD",
    "CME CA": "CME COURSE AUDIT",
    NAV7: "VOYAGE PLANNING",
    "SHIP OP.": "SHIP OPERATION AND SHIPYARD PRACTICE",
    SEAM6: "ADVANCED TRIM, STABILITY, AND STRESS",
    DWK: "DECKWATCHKEEPING WITH BRM",
    NGEC2: "READING IN PHILIPPINE HISTORY",
    NGEC11: "ART AND HUMANITIES",
    NGEC6: "ART APPRECIATION",
    NGEC1: "UNDERSTANDING THE SELF",
    MARCOM: "MARITIME COMMUNICATION",
    SEAM3: "CARGO HANDLING AND STOWAGE (NDG)",
    MARENV: "MARINE ENVIRONMENT",
    NAV3: "TERRESTRIAL AND COASTAL NAVIGATION 2",
    RESEARCH: "MARITIME RESEARCH",
    PATHFIT3: "OUTDOOR ACTIVITIES (BASIC SWIMMING)",
    PATHFIT4: "OUTDOOR ACTIVITIES (ADVANCE SWIMMING)",
    NAV4: "CELESTIAL NAVIGATION",
    MGMT: "LEADERSHIP AND TEAMWORK",
    RIZAL: "THE LIFE AND WORKS OF DR. JOSE RIZAL",
    NAV5: "OPERATIONAL USE OF RADAR AND ARPA",
    MARPOWER: "BASIC MARINE ENGINEERING",
    NGEC5: "PURPOSIVE COMMUNICATION",
    SEAM4: "CARGO HANDLING AND STOWAGE (DG)",
    ROTC1: "RESERVE OFFICERS' TRAINING CORPS 1",
    ICT1: "SOFTWARE APPLICATIONS",
    NAV1: "NAVIGATIONAL INSTRUMENTS WITH COMPASSES",
    SEAM1: "SHIP ROUTINES AND CONSTRUCTION",
    IC1: "DCLC IDENTITY, VALUES, AND WAY OF THINKING",
    NGEC9: "MATH, SCIENCE, AND TECHNOLOGY",
    PATHFIT1: "MOVEMENT COMPETENCY TRAINING",
    NGEC4: "MATHEMATICS IN THE MODERN WORLD",
    ROTC2: "RESERVE OFFICERS' TRAINING CORPS 2",
    METO: "METEOROLOGY AND OCEANOGRAPHY",
    IC2: "MARITIME ETHICS",
    NGEC7: "SCIENCE, TECHNOLOGY, AND SOCIETY",
    COLREGS: "COLLISION REGULATIONS",
    NAV2: "TERRESTRIAL AND COASTAL NAVIGATION 1",
    PATHFIT2: "EXERCISE-BASED FITNESS ACTIVITIES",
    SEAM2: "TRIM, STABILITY, AND STRESS",
  };

  const SUBJECT_CATALOG_TERMS = {
    IC1: { year: "1", semester: "1" },
    ICT1: { year: "1", semester: "1" },
    NGEC9: { year: "1", semester: "1" },
    PATHFIT1: { year: "1", semester: "1" },
    ROTC1: { year: "1", semester: "1" },
    PATHFIT2: { year: "1", semester: "2" },
    ROTC2: { year: "1", semester: "2" },
  };

  function getSubjectCatalogSeedEntries() {
    return Object.keys(COURSE_TITLES).map((course) => ({
      course,
      ...(SUBJECT_CATALOG_TERMS[course] || {}),
      categories: [],
      rowIndex: -1,
    }));
  }

  function getCourseCodeMatch(course) {
    const original = String(course || "").trim();
    const normalized = original.toLocaleUpperCase();
    const legacyCode =
      normalized === "ICT" ? "ICT1" : normalized.replace(/^NSTP(?=\d)/, "ROTC");
    const keys = Object.keys(COURSE_TITLES).sort(
      (left, right) => right.length - left.length,
    );
    const code = keys.find((key) =>
      new RegExp(
        `^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|\\s|\\()`,
        "i",
      ).test(legacyCode),
    );
    if (code) {
      const prefixLength =
        normalized === "ICT" && code === "ICT1"
          ? 3
          : code.length;
      return {
        code,
        suffix: original.slice(prefixLength),
      };
    }
    const legacyShipOperation = /^SHIP OPERATION(?=$|\s|\()/i.exec(original);
    if (legacyShipOperation)
      return {
        code: "SHIP OP.",
        suffix: original.slice(legacyShipOperation[0].length),
      };
    const legacyNstp = /^NSTP(\d+)(?=$|\s|\()/i.exec(original);
    if (legacyNstp)
      return {
        code: `ROTC${legacyNstp[1]}`,
        suffix: original.slice(legacyNstp[0].length),
      };
    return null;
  }

  function getCourseTitle(course) {
    const original = String(course || "").trim();
    const match = getCourseCodeMatch(original);
    return match
      ? `${COURSE_TITLES[match.code] || match.code}${match.suffix}`
      : original;
  }

  function cleanResourceDisplayName(name) {
    return String(name || "")
      .replace(/^\s*\d+(?:\.\d+)?\s*(?:#\s*|[-_]\s*|\.?\s+|$)/, "")
      .trim();
  }

  function buildCourseCatalogEntries(entries) {
    const catalog = new Map();
    entries.forEach((entry) => {
      const originalCourse = cleanResourceDisplayName(entry.course);
      const match = getCourseCodeMatch(originalCourse);
      const course = match?.code || cleanResourceDisplayName(originalCourse);
      const key = course.toLocaleUpperCase();
      let catalogEntry = catalog.get(key);
      if (!catalogEntry) {
        catalogEntry = {
          course,
          subject: match
            ? COURSE_TITLES[match.code] || match.code
            : getCourseTitle(originalCourse),
          suffixes: new Set(),
          terms: new Set(),
        };
        catalog.set(key, catalogEntry);
      }
      const suffix = String(match?.suffix || "").trim();
      if (suffix) catalogEntry.suffixes.add(suffix.toLocaleUpperCase());
      if (entry.year && entry.semester)
        catalogEntry.terms.add(`${entry.year}.${entry.semester}`);
    });
    return [...catalog.values()].map(({ course, subject, suffixes, terms }) => {
      const suffixList = [...suffixes];
      const termList = [...terms].sort((left, right) => {
        const [leftYear, leftSemester] = left.split(".").map(Number);
        const [rightYear, rightSemester] = right.split(".").map(Number);
        return leftYear - rightYear || leftSemester - rightSemester;
      });
      const combinedSuffix = suffixList.length
        ? suffixList.every((suffix) => /^\([^()]*\)$/.test(suffix))
          ? ` (${suffixList
              .map((suffix) => suffix.slice(1, -1))
              .join(" / ")})`
          : ` ${suffixList.join(" / ")}`
        : "";
      return {
        course,
        subject: `${subject}${combinedSuffix}`.toLocaleUpperCase(),
        year: [
          "NAV6",
          "SEAM5",
          "NGEC3",
          "NGEC8",
          "NGEC10",
          "CME CA",
          "MARLAW",
          "SHIP'S AUDIT",
        ].includes(course.toLocaleUpperCase())
          ? "3.1"
          : termList.join(" / "),
      };
    });
  }

  function getCourseHeading(course, useCourseNames = false) {
    const original = cleanResourceDisplayName(course);
    if (useCourseNames) return getCourseTitle(original);
    const match = getCourseCodeMatch(original);
    return match ? `${match.code}${match.suffix}` : original;
  }

  function getCourseCodeFromBreadcrumbs(breadcrumbs, fallback = "") {
    const trail = Array.isArray(breadcrumbs) ? breadcrumbs : [];
    for (const crumb of [...trail].reverse()) {
      const candidate = cleanResourceDisplayName(crumb?.name || "");
      const match = getCourseCodeMatch(candidate);
      if (match) return `${match.code}${match.suffix}`;
    }
    return cleanResourceDisplayName(fallback);
  }

  function extractLeadingOrderNumber(name) {
    const match = /^\s*(\d+)(?:\.(\d+))?(?=\s*(?:#|[-_]|\.?\s|$))/.exec(
      String(name || ""),
    );
    if (!match) return null;
    const major = Number(match[1]);
    const minor = match[2] === undefined ? 0 : Number(match[2]);
    return Number.isSafeInteger(major) && Number.isSafeInteger(minor)
      ? [major, minor]
      : null;
  }

  function compareResourceOrder(leftName, rightName) {
    const leftOrder = extractLeadingOrderNumber(leftName);
    const rightOrder = extractLeadingOrderNumber(rightName);
    if (leftOrder !== null && rightOrder === null) return -1;
    if (leftOrder === null && rightOrder !== null) return 1;
    if (leftOrder !== null && rightOrder !== null)
      return leftOrder[0] - rightOrder[0] || leftOrder[1] - rightOrder[1];
    return 0;
  }

  const ResourceCourseCore = Object.freeze({
    COURSE_TITLES,
    SUBJECT_CATALOG_TERMS,
    buildCourseCatalogEntries,
    cleanResourceDisplayName,
    compareResourceOrder,
    extractLeadingOrderNumber,
    getCourseCodeFromBreadcrumbs,
    getCourseCodeMatch,
    getCourseHeading,
    getCourseTitle,
    getSubjectCatalogSeedEntries,
  });
  globalScope.ResourceCourseCore = ResourceCourseCore;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ResourceCourseCore;
  }
})(typeof window !== "undefined" ? window : globalThis);
