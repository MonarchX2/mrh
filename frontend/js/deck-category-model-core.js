(function (globalScope) {
  function buildCategoryHierarchy(summary) {
    const hierarchy = {};
    if (!Array.isArray(summary)) return hierarchy;

    summary.forEach((category) => {
      if (!category?.Subject) return;
      const parts = String(category.Subject).split("::");
      let currentLevel = hierarchy;

      parts.forEach((part, index) => {
        const normalizedPart = String(part || "").trim();
        if (!normalizedPart) return;
        if (!currentLevel[normalizedPart]) {
          currentLevel[normalizedPart] = { _children: {}, _data: null };
        }
        if (index === parts.length - 1) {
          currentLevel[normalizedPart]._data = category;
        }
        currentLevel = currentLevel[normalizedPart]._children;
      });
    });

    return hierarchy;
  }

  function getFolderStats(node, folderStatsCache = new WeakMap()) {
    if (!node || typeof node !== "object") return 0;
    if (folderStatsCache.has(node)) return folderStatsCache.get(node);

    let total = 0;
    if (node._data && Number(node._data.QuestionCount || 0) > 0) {
      total += Number(node._data.QuestionCount || 0);
    }
    Object.values(node._children || {}).forEach((child) => {
      total += getFolderStats(child, folderStatsCache);
    });
    folderStatsCache.set(node, total);
    return total;
  }

  function getNodeMetadata(
    node,
    nodeMetadataCache = new WeakMap(),
    folderStatsCache = new WeakMap(),
  ) {
    if (!node || typeof node !== "object") {
      return {
        childKeys: [],
        hasChildren: false,
        isFolder: false,
        totalCards: 0,
      };
    }
    if (nodeMetadataCache.has(node)) return nodeMetadataCache.get(node);

    const childKeys = Object.keys(node._children || {});
    const hasChildren = childKeys.length > 0;
    const metadata = {
      childKeys,
      hasChildren,
      isFolder: hasChildren || Boolean(node._data?.IsFolder),
      totalCards: getFolderStats(node, folderStatsCache),
    };
    nodeMetadataCache.set(node, metadata);
    return metadata;
  }

  const DeckCategoryModelCore = {
    buildCategoryHierarchy,
    getFolderStats,
    getNodeMetadata,
  };
  globalScope.DeckCategoryModelCore = DeckCategoryModelCore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = DeckCategoryModelCore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
