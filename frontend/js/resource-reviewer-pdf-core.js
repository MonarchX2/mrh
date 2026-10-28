(function (globalScope) {
  "use strict";

  const courseCore =
    typeof module !== "undefined" && module.exports
      ? require("./resource-course-core")
      : globalScope.ResourceCourseCore;
  if (!courseCore) {
    throw new Error(
      "ResourceCourseCore must load before ResourceReviewerPdfCore.",
    );
  }

  function getReviewerPdfCourseHeading(course) {
    const code = courseCore.getCourseHeading(course);
    const name = courseCore.getCourseHeading(course, true);
    if (!name) return code || "Reviewer";
    if (!code || name.toLocaleUpperCase() === code.toLocaleUpperCase())
      return name || code;
    return `${code} - ${name}`;
  }

  function getReviewerPdfTermHeading(year, semester) {
    const yearText = String(year || "").trim();
    const semesterText = String(semester || "").trim();
    const terms = [...yearText.matchAll(/([1-3])\s*[./-]\s*([12])/g)];
    const termRangeMatch =
      /(?:^|\D)([1-3])\s*[./]\s*([12])\s*-\s*([12])(?=$|\D)/.exec(
        yearText,
      );
    const yearLevel = Number(
      termRangeMatch?.[1] ||
        terms[0]?.[1] ||
        /(?:^|\D)([1-3])(?:\D|$)/.exec(yearText)?.[1] ||
        0,
    );
    if (!yearLevel) return "BSMT - ALPHA";
    const semesterRange = termRangeMatch
      ? `${termRangeMatch[2]}-${termRangeMatch[3]}`
      : terms.length > 1 && terms.every((term) => Number(term[1]) === yearLevel)
        ? `${terms[0][2]}-${terms[terms.length - 1][2]}`
        : terms[0]?.[2] ||
          (/^[12]$/.test(semesterText)
            ? semesterText
            : semesterText.toLowerCase() === "all"
              ? "1-2"
              : "");
    if (!semesterRange) return "BSMT - ALPHA";
    const academicYearStart = String(23 + yearLevel).padStart(2, "0");
    const academicYearEnd = String(24 + yearLevel).padStart(2, "0");
    return `BSMT ${yearLevel}.${semesterRange} - ALPHA (A.Y. ${academicYearStart}-${academicYearEnd})`;
  }

  function getReviewerPdfLessonTitle(fileName, courseName) {
    const title = String(fileName || "").replace(/\.pdf$/i, "").trim();
    const course = String(courseName || "").trim();
    const escapedCourse = course.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const matchedCourse = course
      ? new RegExp(
          `(?:^|[^A-Za-z0-9])${escapedCourse}(?=$|[^A-Za-z0-9])`,
          "i",
        ).exec(title)
      : null;
    const suffix = matchedCourse
      ? title.slice(matchedCourse.index + matchedCourse[0].length)
      : title;
    const sequenceAfterCourse = matchedCourse
      ? /^\s*(?:[-_–—:(\[]\s*)?(?:LESSON\s+)?(\d+(?:\s*-\s*\d+)?)\b/i.exec(
          suffix,
        )?.[1] || ""
      : "";
    const existingLesson = matchedCourse
      ? /\bLESSON\s+(\d+(?:\s*-\s*\d+)?|X)\b/i.exec(title)
      : null;
    const sequence = sequenceAfterCourse || existingLesson?.[1] || "";
    if (!sequence) return null;
    const normalizedSequence =
      sequence.toUpperCase() === "X"
        ? "X"
        : sequence.replace(/\s*-\s*/g, "-").trim();
    const lesson = `Lesson ${normalizedSequence}`;
    const details = /\(([^()]*)\)/.exec(title)?.[1]?.trim() || "";
    const parenthesizedDetails = details ? `(${details})` : "";
    return {
      lesson,
      details: parenthesizedDetails,
      header: `${lesson}${parenthesizedDetails ? ` ${parenthesizedDetails}` : ""}`,
    };
  }

  function getReviewerPdfDisplayName(fileName) {
    return String(fileName || "PDF")
      .replace(/\breviewers?\b/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "PDF";
  }

  function getReviewerPdfPreviewTitle(fileName) {
    return (
      String(fileName || "PDF")
        .replace(/^\s*0\d\s+/, "")
        .trim() || "PDF"
    );
  }

  const ResourceReviewerPdfCore = Object.freeze({
    getReviewerPdfCourseHeading,
    getReviewerPdfDisplayName,
    getReviewerPdfLessonTitle,
    getReviewerPdfPreviewTitle,
    getReviewerPdfTermHeading,
  });
  globalScope.ResourceReviewerPdfCore = ResourceReviewerPdfCore;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ResourceReviewerPdfCore;
  }
})(typeof window !== "undefined" ? window : globalThis);
