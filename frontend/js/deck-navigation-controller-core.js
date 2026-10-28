(function (globalScope) {
  function getState() {
    if (!globalScope.state) {
      throw new Error("Application state is unavailable for deck navigation.");
    }
    return globalScope.state;
  }

  function refreshNavigation() {
    globalScope.persistNavigationPath(getState().currentPath);
    globalScope.invalidateCategoryProgressRenderSignature?.();
    globalScope.renderCategoryProgress();
  }

  function enterFolder(folderName, isLockedFolder, expectedParentPath = null) {
    const state = getState();
    const currentPath = Array.isArray(state.currentPath) ? state.currentPath : [];
    if (
      expectedParentPath !== null &&
      currentPath.join("::") !== String(expectedParentPath)
    ) {
      return false;
    }

    const fullPath = [...currentPath, folderName].join("::");
    const isUnlockedByUi =
      typeof globalScope.isFolderUnlocked === "function" &&
      globalScope.isFolderUnlocked(fullPath);
    if (isLockedFolder && !isUnlockedByUi) {
      globalScope.openFolderPasswordModal(fullPath, folderName);
      return;
    }

    state.currentPath = [...currentPath, folderName];
    refreshNavigation();
  }

  function goToPath(index) {
    const state = getState();
    if (!Array.isArray(state.currentPath)) state.currentPath = [];
    state.currentPath =
      index === -1 ? [] : state.currentPath.slice(0, index + 1);
    refreshNavigation();
  }

  const DeckNavigationControllerCore = {
    enterFolder,
    goToPath,
  };
  globalScope.DeckNavigationControllerCore = DeckNavigationControllerCore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = DeckNavigationControllerCore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
