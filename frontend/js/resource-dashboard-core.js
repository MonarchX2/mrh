(function (globalScope) {
  "use strict";

  const normalizationCore =
    typeof module !== "undefined" && module.exports
      ? require("./resource-dashboard-normalization-core")
      : globalScope.ResourceDashboardNormalizationCore;
  const updatesCore =
    typeof module !== "undefined" && module.exports
      ? require("./resource-dashboard-updates-core")
      : globalScope.ResourceDashboardUpdatesCore;
  if (!normalizationCore || !updatesCore) {
    throw new Error("Dashboard submodules must load before ResourceDashboardCore.");
  }

  const ResourceDashboardCore = Object.freeze({
    ...normalizationCore,
    ...updatesCore,
  });
  globalScope.ResourceDashboardCore = ResourceDashboardCore;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ResourceDashboardCore;
  }
})(typeof window !== "undefined" ? window : globalThis);
