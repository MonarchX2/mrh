(function (globalScope) {
  "use strict";

  const courseCore =
    typeof module !== "undefined" && module.exports
      ? require("./resource-course-core")
      : globalScope.ResourceCourseCore;
  const dashboardCore =
    typeof module !== "undefined" && module.exports
      ? require("./resource-dashboard-core")
      : globalScope.ResourceDashboardCore;
  const reviewerPdfCore =
    typeof module !== "undefined" && module.exports
      ? require("./resource-reviewer-pdf-core")
      : globalScope.ResourceReviewerPdfCore;
  if (!courseCore || !dashboardCore || !reviewerPdfCore) {
    throw new Error(
      "Resource catalog submodules must load before the catalog facade.",
    );
  }

  const ResourceCatalogCore = Object.freeze({
    ...courseCore,
    ...dashboardCore,
    ...reviewerPdfCore,
  });
  globalScope.ResourceCatalogCore = ResourceCatalogCore;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ResourceCatalogCore;
  }
})(typeof window !== "undefined" ? window : globalThis);
