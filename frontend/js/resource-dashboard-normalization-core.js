(function (globalScope) {
  "use strict";

  const courseCore =
    typeof module !== "undefined" && module.exports
      ? require("./resource-course-core")
      : globalScope.ResourceCourseCore;
  if (!courseCore) {
    throw new Error("ResourceCourseCore must load before dashboard normalization.");
  }

  function getResourceDashboardFileId(value) {
    try {
      const url = new URL(String(value || ""));
      if (
        url.protocol !== "https:" ||
        !["drive.google.com", "docs.google.com"].includes(url.hostname)
      )
        return "";
      const pathMatch =
        /\/(?:folders|(?:file|document|spreadsheets|presentation|forms)\/d)\/([^/]+)/.exec(
          url.pathname,
        );
      const fileId = String(url.searchParams.get("id") || pathMatch?.[1] || "");
      return /^[A-Za-z0-9_-]{10,200}$/.test(fileId) ? fileId : "";
    } catch {
      return "";
    }
  }

  function isResourceDashboardLink(value) {
    try {
      const url = new URL(String(value || ""));
      return (
        url.protocol === "https:" &&
        ["drive.google.com", "docs.google.com"].includes(url.hostname)
      );
    } catch {
      return false;
    }
  }

  function getResourceDashboardColumnHeading(column, useCourseNames = false) {
    const normalized = String(column).trim().toLowerCase();
    if (normalized === "course syllabus") {
      return "SYLLABUS";
    }
    if (normalized === "course" && useCourseNames) {
      return "COURSE NAME";
    }
    return String(column);
  }

  function getReviewerDashboardCourseHeading(fileName, course) {
    return String(course || "").trim();
  }

  function normalizeReviewerDashboardCourseHeadings(tab) {
    const yearColumnIndex = tab.columns.findIndex(
      (column) => String(column || "").trim().toLowerCase() === "year",
    );
    const courseColumnIndex = tab.columns.findIndex(
      (column) => String(column || "").trim().toLowerCase() === "course",
    );
    if (yearColumnIndex < 0 || courseColumnIndex < 0) return tab;
    const resourceColumnIndexes = tab.columns
      .map((_, index) => index)
      .filter(
        (index) => index !== yearColumnIndex && index !== courseColumnIndex,
      );
    const alignedProperties = ["links", "linkTitles", "linkTypes"].filter(
      (property) => Array.isArray(tab[property]),
    );
    let changed = false;
    const rows = [];
    const alignedRows = Object.fromEntries(
      alignedProperties.map((property) => [property, []]),
    );
    tab.rows.forEach((sourceRow, rowIndex) => {
      if (!Array.isArray(sourceRow)) {
        rows.push(sourceRow);
        alignedProperties.forEach((property) =>
          alignedRows[property].push(tab[property][rowIndex]),
        );
        return;
      }
      const course = String(sourceRow[courseColumnIndex] || "").trim();
      const resources = resourceColumnIndexes
        .map((columnIndex) => {
          const fileName = String(
            tab.linkTitles?.[rowIndex]?.[columnIndex] ||
              sourceRow[columnIndex] ||
              "",
          ).trim();
          return {
            columnIndex,
            fileName,
            heading: getReviewerDashboardCourseHeading(fileName, course),
          };
        })
        .filter(
          ({ columnIndex, fileName }) =>
            fileName ||
            alignedProperties.some((property) =>
              String(tab[property]?.[rowIndex]?.[columnIndex] || "").trim(),
            ),
        );
      if (!resources.some(({ heading }) => heading !== course)) {
        rows.push(sourceRow);
        alignedProperties.forEach((property) =>
          alignedRows[property].push(tab[property][rowIndex]),
        );
        return;
      }
      changed = true;
      const groups = new Map();
      resources.forEach(({ columnIndex, heading }) => {
        let group = groups.get(heading);
        if (!group) {
          const row = sourceRow.slice();
          resourceColumnIndexes.forEach((index) => {
            row[index] = "";
          });
          const aligned = Object.fromEntries(
            alignedProperties.map((property) => {
              const values = Array.isArray(tab[property][rowIndex])
                ? tab[property][rowIndex].slice()
                : [];
              resourceColumnIndexes.forEach((index) => {
                values[index] = "";
              });
              return [property, values];
            }),
          );
          row[courseColumnIndex] = heading;
          group = { row, aligned };
          groups.set(heading, group);
        }
        group.row[columnIndex] = sourceRow[columnIndex] || "";
        alignedProperties.forEach((property) => {
          group.aligned[property][columnIndex] =
            tab[property]?.[rowIndex]?.[columnIndex] || "";
        });
      });
      groups.forEach(({ row, aligned }) => {
        rows.push(row);
        alignedProperties.forEach((property) =>
          alignedRows[property].push(aligned[property]),
        );
      });
    });
    if (!changed) return tab;
    return {
      ...tab,
      rows,
      ...Object.fromEntries(
        alignedProperties.map((property) => [property, alignedRows[property]]),
      ),
    };
  }

  function normalizeResourceDashboardIndex(tabName, index) {
    if (
      !index ||
      typeof index.b !== "string" ||
      !index.d ||
      typeof index.d !== "object" ||
      Array.isArray(index.d)
    )
      return null;
    const categories =
      tabName === "SYLLABUS"
        ? ["SYLLABUS"]
        : ["PRELIMS", "MIDTERMS", "FINALS"];
    const rowsByKey = new Map();
    const termKeys = Object.keys(index.d)
      .filter((key) => /^\d+(?:\.\d+)?$/.test(key))
      .sort((left, right) => {
        const [leftYear, leftSemester = 0] = left.split(".").map(Number);
        const [rightYear, rightSemester = 0] = right.split(".").map(Number);
        return leftYear - rightYear || leftSemester - rightSemester;
      });
    termKeys.forEach((term) => {
      const termData = index.d[term];
      if (!termData || typeof termData !== "object" || Array.isArray(termData))
        return;
      categories.forEach((category) => {
        const courses = termData[category];
        if (!courses || typeof courses !== "object" || Array.isArray(courses))
          return;
        Object.keys(courses).forEach((course) => {
          if (String(course).trim().toLocaleUpperCase() === "TOTAL") return;
          const item = courses[course];
          if (!item || typeof item !== "object") return;
          const title = String(
            Array.isArray(item)
              ? item[0] || course
              : item.n || item.name || course,
          ).trim();
          const courseHeading =
            tabName === "REVIEWERS"
              ? getReviewerDashboardCourseHeading(title, course)
              : course;
          const rowKey = `${term}\u0000${courseHeading}`;
          if (!rowsByKey.has(rowKey)) {
            rowsByKey.set(rowKey, {
              term,
              course: courseHeading,
              resources: Object.create(null),
              sourceOrder: rowsByKey.size,
            });
          }
          const rawUrl = String(
            Array.isArray(item)
              ? item[1] || ""
              : item.u || item.url || "",
          ).trim();
          const id = String(
            Array.isArray(item) ? "" : item.i || item.id || "",
          ).trim();
          const url = /^https:\/\//i.test(rawUrl)
            ? rawUrl
            : /^[A-Za-z0-9_-]{10,200}$/.test(rawUrl)
              ? `${index.b}${encodeURIComponent(rawUrl)}`
              : !rawUrl && /^[A-Za-z0-9_-]{10,200}$/.test(id)
                ? `${index.b}${encodeURIComponent(id)}`
                : "";
          let mimeType = "";
          const rawType = String(
            Array.isArray(item) ? item[3] || "" : item.t ?? "",
          ).toLowerCase();
          if (
            (Array.isArray(item) && tabName === "MODULES") ||
            ["1", "folder"].includes(rawType)
          )
            mimeType = "application/vnd.google-apps.folder";
          else if (rawType === "pdf" || /\.pdf$/i.test(title))
            mimeType = "application/pdf";
          else if (rawType === "gdoc")
            mimeType = "application/vnd.google-apps.document";
          else if (rawType === "docx")
            mimeType =
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          else if (rawType === "doc")
            mimeType = "application/msword";
          rowsByKey.get(rowKey).resources[category] = {
            title,
            url: url && getResourceDashboardFileId(url) ? url : "",
            mimeType,
          };
        });
      });
    });
    const rows = [...rowsByKey.values()].sort((left, right) => {
      const termOrder = left.term.localeCompare(right.term, undefined, {
        numeric: true,
      });
      if (termOrder) return termOrder;
      const resourceNames = (row) =>
        categories
          .map((category) => row.resources[category]?.title || "")
          .find(Boolean) || "";
      const order = courseCore.compareResourceOrder(
        resourceNames(left),
        resourceNames(right),
      );
      return order || left.sourceOrder - right.sourceOrder;
    });
    const columns = ["Year", "Course", ...categories];
    const values = [];
    const links = [];
    const linkTitles = [];
    const linkTypes = [];
    rows.forEach((row) => {
      const rowValues = [row.term, row.course];
      const rowLinks = ["", ""];
      const rowTitles = ["", ""];
      const rowTypes = ["", ""];
      categories.forEach((category) => {
        const resource = row.resources[category];
        rowValues.push(resource?.title || "");
        rowLinks.push(resource?.url || "");
        rowTitles.push(resource?.title || "");
        rowTypes.push(resource?.mimeType || "");
      });
      values.push(rowValues);
      links.push(rowLinks);
      linkTitles.push(rowTitles);
      linkTypes.push(rowTypes);
    });
    return {
      columns,
      rows: values,
      links,
      linkTitles,
      linkTypes,
      truncated: false,
    };
  }

  function normalizeResourceDashboardTabs(tabs) {
    if (!tabs || typeof tabs !== "object")
      throw new Error("The dashboard service returned invalid data.");
    const moduleTab =
      Array.isArray(tabs.MODULES?.columns) && Array.isArray(tabs.MODULES?.rows)
        ? tabs.MODULES
        : normalizeResourceDashboardIndex("MODULES", tabs.MODULES);
    const sourceReviewerTab =
      Array.isArray(tabs.REVIEWERS?.columns) &&
      Array.isArray(tabs.REVIEWERS?.rows)
        ? tabs.REVIEWERS
        : null;
    const reviewerTab =
      sourceReviewerTab ||
      normalizeResourceDashboardIndex("REVIEWERS", tabs.REVIEWERS);
    const isValidTab = (tab) =>
      Array.isArray(tab?.columns) &&
      Array.isArray(tab?.rows) &&
      tab.rows.every(Array.isArray);
    if (!isValidTab(moduleTab)) {
      throw new Error(
        "The dashboard service returned invalid data: missing or malformed MODULES tab.",
      );
    }

    const normalized = { ...tabs, MODULES: moduleTab };
    if (isValidTab(reviewerTab)) normalized.REVIEWERS = reviewerTab;
    const sourceSyllabusTab =
      isValidTab(tabs.SYLLABUS)
        ? tabs.SYLLABUS
        : normalizeResourceDashboardIndex(
            "SYLLABUS",
            tabs.SYLLABUS?.d ? tabs.SYLLABUS : tabs.REVIEWERS,
          );
    const syllabusColumnIndex = reviewerTab
      ? reviewerTab.columns.findIndex((column) =>
          ["syllabus", "course syllabus"].includes(
            String(column || "")
              .trim()
              .toLowerCase(),
          ),
        )
      : -1;
    if (!isValidTab(sourceSyllabusTab)) {
      const yearColumnIndex = reviewerTab
        ? reviewerTab.columns.findIndex(
            (column) =>
              String(column || "")
                .trim()
                .toLowerCase() === "year",
          )
        : -1;
      const courseColumnIndex = reviewerTab
        ? reviewerTab.columns.findIndex(
            (column) =>
              String(column || "")
                .trim()
                .toLowerCase() === "course",
          )
        : -1;
      if (reviewerTab && syllabusColumnIndex >= 0) {
        const syllabusRowIndexes = reviewerTab.rows
          .map((row, index) =>
            String(row[syllabusColumnIndex] || "").trim() ? index : -1,
          )
          .filter((index) => index >= 0);
        const selectRows = (rows, indexes, columns) =>
          indexes
            .filter((index) => Array.isArray(rows[index]))
            .map((index) =>
              columns.map((columnIndex) => rows[index][columnIndex] || ""),
            );
        normalized.SYLLABUS = {
          columns: ["Year", "Course", "COURSE SYLLABUS"],
          rows: selectRows(reviewerTab.rows, syllabusRowIndexes, [
            yearColumnIndex,
            courseColumnIndex,
            syllabusColumnIndex,
          ]),
          links: selectRows(reviewerTab.links || [], syllabusRowIndexes, [
            yearColumnIndex,
            courseColumnIndex,
            syllabusColumnIndex,
          ]),
          linkTitles: selectRows(
            reviewerTab.linkTitles || [],
            syllabusRowIndexes,
            [yearColumnIndex, courseColumnIndex, syllabusColumnIndex],
          ),
          linkTypes: selectRows(
            reviewerTab.linkTypes || [],
            syllabusRowIndexes,
            [yearColumnIndex, courseColumnIndex, syllabusColumnIndex],
          ),
          truncated: Boolean(reviewerTab.truncated),
        };
      } else {
        normalized.SYLLABUS = {
          columns: ["Year", "Course", "COURSE SYLLABUS"],
          rows: [],
          links: [],
          linkTitles: [],
          linkTypes: [],
          truncated: false,
        };
      }
    } else normalized.SYLLABUS = sourceSyllabusTab;
    normalized.REVIEWERS = {
      columns: [],
      rows: [],
      links: [],
      linkTitles: [],
      linkTypes: [],
      truncated: false,
    };
    return normalized;
  }

  const ResourceDashboardNormalizationCore = Object.freeze({
    getResourceDashboardColumnHeading,
    getResourceDashboardFileId,
    getReviewerDashboardCourseHeading,
    isResourceDashboardLink,
    normalizeResourceDashboardIndex,
    normalizeReviewerDashboardTab: normalizeReviewerDashboardCourseHeadings,
    normalizeResourceDashboardTabs,
  });
  globalScope.ResourceDashboardNormalizationCore = ResourceDashboardNormalizationCore;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ResourceDashboardNormalizationCore;
  }
})(typeof window !== "undefined" ? window : globalThis);
