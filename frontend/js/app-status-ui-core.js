(function (globalScope) {
  "use strict";

  function create(dependencies) {
    const { document, lifecycle, appConfig, getState, escapeHTML } =
      dependencies;
    let syncStatusHideTimer = null;

    function getSyncStatusVisualState(tone = "info") {
      const byTone = {
        info: {
          panelClass:
            "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300",
          badgeClass: "fa-spinner fa-spin text-yellow-300",
          title: "Checking database connection",
          overlayTitle: "Syncing database",
          overlayDetail: "Checking for the latest subjects and data updates.",
        },
        success: {
          panelClass:
            "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-300",
          badgeClass: "fa-check-circle text-green-300",
          title: "Database connected",
          overlayTitle: "Database ready",
          overlayDetail: "The latest data is loaded and ready to use.",
        },
        warning: {
          panelClass:
            "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300",
          badgeClass: "fa-triangle-exclamation text-yellow-300",
          title: "Database reconnecting",
          overlayTitle: "Database reconnecting",
          overlayDetail:
            "The app is retrying the connection and will resume shortly.",
        },
        error: {
          panelClass:
            "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300",
          badgeClass: "fa-xmark-circle text-red-300",
          title: "Database unavailable",
          overlayTitle: "Database unavailable",
          overlayDetail: "The app is retrying the connection automatically.",
        },
      };
      return byTone[tone] || byTone.info;
    }

    function renderSyncStatusMessage(element, message) {
      const content = String(message ?? "");
      const iconMatch = /^<i class="([^"]+)"><\/i>\s*/.exec(content);
      if (!iconMatch) {
        element.textContent = content;
        return;
      }
      const iconClasses = iconMatch[1].split(/\s+/);
      if (
        !iconClasses.every((className) =>
          /^(?:fa-[a-z0-9-]+|mr-[0-5])$/.test(className),
        )
      ) {
        element.textContent = content;
        return;
      }
      const icon = document.createElement("i");
      icon.className = iconClasses.join(" ");
      icon.setAttribute("aria-hidden", "true");
      element.replaceChildren(
        icon,
        document.createTextNode(content.slice(iconMatch[0].length)),
      );
    }

    function setGlobalLoadingState(
      isLoading,
      title = "Loading...",
      detail = "Preparing the latest data...",
      tone = "info",
    ) {
      if (!document) return false;
      const overlay = document.getElementById("app-loading-overlay");
      if (!overlay) return false;

      const titleElement = document.getElementById("app-loading-title");
      const detailElement = document.getElementById("app-loading-detail");
      const iconElement = document.getElementById("app-loading-icon");
      const toneState = getSyncStatusVisualState(tone);
      if (titleElement) titleElement.textContent = title || "Loading...";
      if (detailElement) {
        detailElement.textContent = detail || "Preparing the latest data...";
      }
      if (iconElement) {
        const iconClass =
          tone === "success"
            ? "fa-solid fa-check-circle text-green-300"
            : tone === "warning" || tone === "error"
              ? `fa-solid ${toneState.badgeClass}`
              : "fa-solid fa-spinner fa-spin text-yellow-300";
        iconElement.className = `text-3xl ${iconClass}`;
      }
      overlay.classList.toggle("hidden", !isLoading);
      overlay.setAttribute("aria-hidden", String(!isLoading));
      return isLoading;
    }

    function updateSyncStatus(message, tone = "info", showOverlay = true) {
      const state = getState();
      const visualState = getSyncStatusVisualState(tone);
      const activeSessionBlocking = Boolean(state.session?.active);
      const shouldSuppressOverlay =
        activeSessionBlocking &&
        showOverlay &&
        /database|reconnect|waiting until your session ends/i.test(message);
      const effectiveShowOverlay = showOverlay && !shouldSuppressOverlay;
      const statusElement = document.getElementById("sync-status");
      if (statusElement) {
        statusElement.classList.remove("hidden");
        renderSyncStatusMessage(statusElement, message);
        statusElement.className = `text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-500 overflow-hidden ${visualState.panelClass}`;
        statusElement.dataset.syncTone = tone;
      }

      if (tone === "info" || tone === "warning" || tone === "error") {
        setGlobalLoadingState(
          effectiveShowOverlay,
          visualState.overlayTitle,
          visualState.overlayDetail,
          tone,
        );
      } else {
        setGlobalLoadingState(false);
      }

      const isStartupVisibleSuccess =
        showOverlay &&
        !state.session?.active &&
        tone === "success" &&
        /Connected\./i.test(message);
      const shouldShowStatusToast =
        !shouldSuppressOverlay &&
        showOverlay &&
        (isStartupVisibleSuccess ||
          tone === "info" ||
          tone === "warning" ||
          tone === "error" ||
          /database|reconnect|retry/i.test(message));
      const connectionStatus = document.getElementById("connection-status");
      if (!connectionStatus) return;
      lifecycle.clearTimeout(syncStatusHideTimer);
      if (shouldShowStatusToast) {
        connectionStatus.classList.remove("hidden", "opacity-0", "scale-95");
        renderSyncStatusMessage(connectionStatus, message);
        connectionStatus.className = `fixed bottom-5 left-1/2 z-[60] w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg px-4 py-2 text-center text-xs font-medium shadow-lg transition-all duration-500 ${visualState.panelClass}`;
      } else {
        connectionStatus.classList.add("opacity-0", "scale-95");
        lifecycle.setTimeout(() => {
          connectionStatus.classList.add("hidden");
          connectionStatus.classList.remove("opacity-0", "scale-95");
        }, appConfig.statusHideAnimationDelayMs ?? 250);
      }
    }

    function hideConnectionStatusAfterDelay(delay = 3000) {
      lifecycle.clearTimeout(syncStatusHideTimer);
      syncStatusHideTimer = lifecycle.setTimeout(() => {
        const element = document.getElementById("connection-status");
        if (!element) return;
        element.classList.add("opacity-0", "scale-95");
        lifecycle.setTimeout(
          () => element.classList.add("hidden"),
          appConfig.statusHiddenDelayMs ?? 500,
        );
      }, delay);
    }

    function setDatabaseConnectionStatus(tone) {
      const icon = document.getElementById("database-connection-icon");
      if (!icon) return false;
      const visualState = getSyncStatusVisualState(tone);
      icon.className = `database-connection-icon fa-solid ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 p-1 text-xs transition-all duration-300 ${visualState.badgeClass}`;
      icon.title = visualState.title;
      icon.dataset.syncTone = tone;
      return true;
    }

    function showToast(message, type = "success", duration = 3000) {
      const container = document.getElementById("toast-container");
      if (!container) return;
      const toast = document.createElement("div");
      const colors =
        type === "error"
          ? "bg-red-500 text-white"
          : type === "warning"
            ? "bg-yellow-500 text-white"
            : type === "info"
              ? "bg-blue-500 text-white"
              : "bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900";
      const icon =
        type === "error"
          ? "fa-circle-exclamation"
          : type === "warning"
            ? "fa-triangle-exclamation"
            : type === "info"
              ? "fa-circle-info"
              : "fa-circle-check";
      toast.className = `toast-enter ${colors} px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 font-medium text-sm`;
      toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${escapeHTML(message)}`;
      container.appendChild(toast);
      lifecycle.setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        toast.style.transition = "all 0.3s ease";
        lifecycle.setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    function renderAppSkeleton() {
      const htmlRoot = document.documentElement;
      if (htmlRoot) htmlRoot.setAttribute("data-app-ready", "false");
      const status = document.getElementById("connection-status");
      if (status) status.classList.remove("hidden");
    }

    function cleanup() {
      lifecycle.clearTimeout(syncStatusHideTimer);
      syncStatusHideTimer = null;
    }

    return Object.freeze({
      cleanup,
      getSyncStatusVisualState,
      hideConnectionStatusAfterDelay,
      renderAppSkeleton,
      setGlobalLoadingState,
      setDatabaseConnectionStatus,
      showToast,
      updateSyncStatus,
    });
  }

  const AppStatusUICore = Object.freeze({ create });
  globalScope.AppStatusUICore = AppStatusUICore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = AppStatusUICore;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
