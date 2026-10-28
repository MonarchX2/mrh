(function (globalScope) {
  "use strict";

  function getResourceDashboardRowKeys(tab, tabName) {
    const getColumnIndex = (name) =>
      tab.columns.findIndex(
        (column) => String(column || "").trim().toLowerCase() === name,
      );
    const identityColumnIndices = [
      getColumnIndex("year"),
      getColumnIndex("semester"),
      getColumnIndex("course"),
    ].filter((index) => index >= 0);
    const occurrences = new Map();
    return tab.rows.map((values, rowIndex) => {
      const identity = identityColumnIndices.length
        ? identityColumnIndices.map((index) =>
            String(values[index] ?? "").trim(),
          )
        : [rowIndex];
      const identityKey = JSON.stringify(identity);
      const occurrence = occurrences.get(identityKey) || 0;
      occurrences.set(identityKey, occurrence + 1);
      return JSON.stringify([tabName, identity, occurrence]);
    });
  }

  function mergeResourceDashboardUpdates(
    tabName,
    previousTab,
    nextTab,
    ttlMs,
    now = Date.now(),
  ) {
    const nextRowKeys = getResourceDashboardRowKeys(nextTab, tabName);
    const previousTabIsValid =
      Array.isArray(previousTab?.columns) &&
      Array.isArray(previousTab?.rows) &&
      previousTab.rows.every(Array.isArray);
    const previousRowsByKey = new Map();
    const previousColumnIndices = new Map();
    if (previousTabIsValid) {
      getResourceDashboardRowKeys(previousTab, tabName).forEach(
        (rowKey, rowIndex) => previousRowsByKey.set(rowKey, rowIndex),
      );
      previousTab.columns.forEach((column, columnIndex) =>
        previousColumnIndices.set(
          String(column || "").trim().toLowerCase(),
          columnIndex,
        ),
      );
    }

    const recentlyUpdatedCells = {};
    nextTab.rows.forEach((values, rowIndex) => {
      const rowKey = nextRowKeys[rowIndex];
      const previousRowIndex = previousRowsByKey.get(rowKey);
      nextTab.columns.forEach((column, columnIndex) => {
        const columnKey = String(column || "").trim().toLowerCase();
        if (["year", "semester", "course"].includes(columnKey)) return;
        const value = String(values[columnIndex] ?? "").trim();
        const link = String(nextTab.links?.[rowIndex]?.[columnIndex] || "");
        const title = String(
          nextTab.linkTitles?.[rowIndex]?.[columnIndex] || "",
        );
        const resourceExists = Boolean(value || link || title);
        if (!resourceExists) return;

        const markerKey = JSON.stringify([rowKey, columnKey]);
        const previousMarker =
          previousTab?.recentlyUpdatedCells?.[markerKey];
        let updatedAt =
          typeof previousMarker === "object" && previousMarker !== null
            ? Number(previousMarker.updatedAt)
            : Number(previousMarker || 0);
        let changeType =
          typeof previousMarker === "object" &&
          ["NEW", "UPDATED"].includes(previousMarker.type)
            ? previousMarker.type
            : updatedAt
              ? "UPDATED"
              : "";
        const previousColumnIndex = previousColumnIndices.get(columnKey);
        const previousResourceExists =
          previousRowIndex !== undefined &&
          previousColumnIndex !== undefined &&
          Boolean(
            String(
              previousTab.rows[previousRowIndex]?.[previousColumnIndex] ?? "",
            ).trim() ||
              previousTab.links?.[previousRowIndex]?.[previousColumnIndex] ||
              previousTab.linkTitles?.[previousRowIndex]?.[previousColumnIndex],
          );
        const previousResourceName =
          previousRowIndex === undefined || previousColumnIndex === undefined
            ? ""
            : String(
                previousTab.linkTitles?.[previousRowIndex]?.[
                  previousColumnIndex
                ] ||
                  previousTab.rows[previousRowIndex]?.[previousColumnIndex] ||
                  "",
              ).trim();
        const resourceName = title || value;
        const resourceNameChanged =
          previousTabIsValid &&
          previousResourceName !== resourceName;
        if (
          previousTabIsValid &&
          resourceExists &&
          (!previousResourceExists || resourceNameChanged)
        ) {
          updatedAt = now;
          changeType = previousResourceExists ? "UPDATED" : "NEW";
        }
        if (
          Number.isFinite(updatedAt) &&
          updatedAt > 0 &&
          updatedAt <= now &&
          now - updatedAt <= ttlMs
        ) {
          recentlyUpdatedCells[markerKey] = {
            updatedAt,
            type: changeType || "UPDATED",
          };
        }
      });
    });
    return { ...nextTab, recentlyUpdatedCells };
  }

  const ResourceDashboardUpdatesCore = Object.freeze({
    getResourceDashboardRowKeys,
    mergeResourceDashboardUpdates,
  });
  globalScope.ResourceDashboardUpdatesCore = ResourceDashboardUpdatesCore;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ResourceDashboardUpdatesCore;
  }
})(typeof window !== "undefined" ? window : globalThis);
