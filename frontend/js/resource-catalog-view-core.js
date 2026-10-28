(function (globalScope) {
  "use strict";

  function create() {
    function reconcileTable(tableHead, tableBody, desiredHeader, desiredRows) {
      const reconcileCells = (currentRow, nextRow) => {
        const currentCells = new Map(
          [...currentRow.children].map((cell) => [
            cell.dataset.dashboardColumnKey,
            cell,
          ]),
        );
        const nextCells = [...nextRow.children].map((nextCell) => {
          const currentCell = currentCells.get(
            nextCell.dataset.dashboardColumnKey,
          );
          currentCells.delete(nextCell.dataset.dashboardColumnKey);
          if (currentCell?.isEqualNode(nextCell)) return currentCell;
          if (currentCell) currentCell.replaceWith(nextCell);
          return nextCell;
        });
        currentCells.forEach((cell) => cell.remove());
        if (
          currentRow.children.length !== nextCells.length ||
          nextCells.some((cell, index) => currentRow.children[index] !== cell)
        )
          currentRow.replaceChildren(...nextCells);
        return currentRow;
      };

      const currentHeader = tableHead.firstElementChild;
      if (!desiredHeader) {
        if (currentHeader) tableHead.replaceChildren();
      } else if (currentHeader) {
        reconcileCells(currentHeader, desiredHeader);
      } else {
        tableHead.replaceChildren(desiredHeader);
      }

      const currentRows = new Map(
        [...tableBody.children].map((row) => [
          row.dataset.dashboardRowKey,
          row,
        ]),
      );
      const nextRows = desiredRows.map((nextRow) => {
        const rowKey = nextRow.dataset.dashboardRowKey;
        const currentRow = currentRows.get(rowKey);
        currentRows.delete(rowKey);
        return currentRow ? reconcileCells(currentRow, nextRow) : nextRow;
      });
      currentRows.forEach((row) => row.remove());
      if (
        tableBody.children.length !== nextRows.length ||
        nextRows.some((row, index) => tableBody.children[index] !== row)
      )
        tableBody.replaceChildren(...nextRows);
    }

    function filterRows(rows, query, getSearchText) {
      if (!Array.isArray(rows) || typeof getSearchText !== "function") {
        throw new TypeError("Rows and a search-text callback are required.");
      }
      const normalizedQuery = String(query || "")
        .trim()
        .toLocaleUpperCase();
      if (!normalizedQuery) return [...rows];
      return rows.filter((row) =>
        String(getSearchText(row) || "")
          .toLocaleUpperCase()
          .includes(normalizedQuery),
      );
    }

    function sortRows(rows, compareRows) {
      if (!Array.isArray(rows) || typeof compareRows !== "function") {
        throw new TypeError("Rows and a comparison callback are required.");
      }
      return rows
        .map((row, index) => ({ row, index }))
        .sort(
          (left, right) =>
            compareRows(left.row, right.row) || left.index - right.index,
        )
        .map(({ row }) => row);
    }

    return Object.freeze({ filterRows, reconcileTable, sortRows });
  }

  globalScope.ResourceCatalogViewCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
