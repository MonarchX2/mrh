(async function () {
  "use strict";

  if (typeof window !== "undefined" && window.__MRH_BLOCK_IN_APP_BROWSER) {
    return;
  }

  const scriptUrl =
    typeof window !== "undefined"
      ? document.currentScript?.src ||
        navigator.serviceWorker?.controller?.scriptURL ||
        window.location.href
      : globalThis.location?.href;
  if (!scriptUrl) {
    throw new Error("Unable to determine the app base URL for release metadata.");
  }
  const rootScope = typeof window !== "undefined" ? window : globalThis;
  const versionUrl = new URL("version.json", new URL(".", scriptUrl));
  let APP_DISPLAY_VERSION = "";
  let APP_VERSION = "";
  const releaseMetadataPromise = fetch(versionUrl, {
    cache: "no-store",
    credentials: "same-origin",
  }).then(async (versionResponse) => {
    if (!versionResponse.ok) {
      throw new Error(
        `Release metadata request failed with HTTP ${versionResponse.status}.`,
      );
    }
    const releaseMetadata = await versionResponse.json();
    APP_DISPLAY_VERSION = releaseMetadata?.version;
    if (
      !/^\d{2}\.\d{2}\.\d{2}-(?:0|[1-9]\d*)$/.test(
        APP_DISPLAY_VERSION || "",
      )
    ) {
      throw new Error("Release metadata contains an invalid website version.");
    }
    APP_VERSION = `mrh-${APP_DISPLAY_VERSION}`;
    rootScope.__MRH_APP__ = rootScope.__MRH_APP__ || {};
    rootScope.__MRH_APP__.version = APP_VERSION;
    const versionLabel = `Version ${APP_DISPLAY_VERSION}`;
    ["site-version", "about-version"].forEach((elementId) => {
      const element =
        typeof document !== "undefined"
          ? document.getElementById(elementId)
          : null;
      if (element) element.textContent = versionLabel;
    });
    return APP_VERSION;
  });
  const UPDATE_QUERY_PARAMETER = "__mrh_update";
  const FACEBOOK_CLICK_ID_PARAMETER = "fbclid";
  const LEGACY_PAGES_BASE_PATH = "/maritime-review-hub/";
  const bootstrapLogger = () => rootScope.DebugUtils || console;
  let serviceWorkerRegistration = null;
  let serviceWorkerRegistrationPromise = null;
  let serviceWorkerRegistrationFailed = false;
  let appUpdateCheck = null;
  let pendingAppUpdateVersion = "";
  let pendingUpdateTimer = null;
  let updateApplyInFlight = false;
  let nextUpdateApplyAttemptAt = 0;
  const APP_UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const PENDING_UPDATE_RETRY_INTERVAL_MS = 15 * 1000;

  if (typeof window !== "undefined") {
    const scriptPath = new URL(".", scriptUrl).pathname;
    rootScope.__MRH_APP_BASE_PATH = scriptPath.endsWith("/")
      ? scriptPath
      : `${scriptPath}/`;

    const currentUrl = new URL(window.location.href);
    if (
      currentUrl.searchParams.has(UPDATE_QUERY_PARAMETER) ||
      currentUrl.searchParams.has(FACEBOOK_CLICK_ID_PARAMETER)
    ) {
      currentUrl.searchParams.delete(UPDATE_QUERY_PARAMETER);
      currentUrl.searchParams.delete(FACEBOOK_CLICK_ID_PARAMETER);
      window.history.replaceState(
        window.history.state,
        "",
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      );
    }
  }

  if (rootScope) {
    rootScope.globalScope = rootScope;
    if (typeof globalThis !== "undefined") {
      globalThis.globalScope = rootScope;
    }
  }

  function getAppUpdateNotice() {
    return typeof document === "undefined"
      ? null
      : document.getElementById("app-update-notice");
  }

  function setAppUpdateNotice(message, showRetry = false) {
    const notice = getAppUpdateNotice();
    if (!notice) return;

    const messageElement = document.getElementById("app-update-message");
    const retryButton = document.getElementById("app-update-retry");
    if (messageElement) messageElement.textContent = message;
    if (retryButton) retryButton.hidden = !showRetry;
    notice.hidden = !message;
  }

  function getUpdateDeferralMessage() {
    if (rootScope.__MRH_PDF_DOWNLOAD_ACTIVE === true) {
      return "An update is ready. It will be applied after the PDF download finishes.";
    }
    if (rootScope.navigator?.onLine === false) {
      return "An update is ready. It will be applied when you are back online.";
    }
    if (document.visibilityState !== "visible") {
      return "An update is ready. It will be applied when you return to this tab.";
    }
    if (
      rootScope.state?.session?.active ||
      document.querySelector("#view-practice.active, #view-deck-review.active")
    ) {
      return "An update is ready. It will be applied after you finish your current session.";
    }

    const dashboard = document.getElementById("view-dashboard");
    const resourceDashboard = document.getElementById("view-resources");
    if (
      !dashboard?.classList.contains("active") &&
      !resourceDashboard?.classList.contains("active")
    ) {
      return "An update is ready. It will be applied when you return to the dashboard.";
    }
    if (resourceDashboard?.classList.contains("active")) {
      const enrollmentForm = document.getElementById(
        "resource-reviewer-enrollment-form",
      );
      if (
        enrollmentForm &&
        !enrollmentForm.hidden &&
        Array.from(enrollmentForm.elements).some(
          (control) =>
            typeof control.value === "string" && control.value.trim(),
        )
      ) {
        return "An update is ready. Finish or clear your profile details before updating.";
      }
    }
    if (document.querySelector('[role="dialog"][aria-hidden="false"]')) {
      return "An update is ready. It will be applied after you close the open dialog.";
    }
    return "";
  }

  function sendCurrentVersionToWorker(...workers) {
    new Set(workers.filter(Boolean)).forEach((worker) => {
      if (typeof worker.postMessage !== "function") return;
      try {
        worker.postMessage({
          type: "MRH_CLIENT_VERSION",
          version: APP_VERSION,
        });
      } catch (error) {
        bootstrapLogger().warn(
          "Unable to report the loaded app version to its service worker:",
          error,
        );
      }
    });
  }

  function sendClientVersionResponse(event) {
    const requestId = event.data?.requestId;
    if (typeof requestId !== "string" || !event.source?.postMessage) return;
    try {
      event.source.postMessage({
        type: "MRH_CLIENT_VERSION_RESPONSE",
        requestId,
        version: APP_VERSION,
      });
    } catch (error) {
      bootstrapLogger().warn("Unable to reply to the service worker:", error);
    }
  }

  function schedulePendingUpdateCheck() {
    if (pendingUpdateTimer || typeof window?.setInterval !== "function") return;
    pendingUpdateTimer = window.setInterval(() => {
      void applyPendingAppUpdate();
    }, PENDING_UPDATE_RETRY_INTERVAL_MS);
  }

  function markAppUpdateAvailable(version) {
    if (
      typeof version !== "string" ||
      !/^mrh-[A-Za-z0-9._-]+$/.test(version) ||
      version === APP_VERSION
    ) {
      return;
    }

    pendingAppUpdateVersion = version;
    schedulePendingUpdateCheck();
    void applyPendingAppUpdate();
  }

  async function applyPendingAppUpdate() {
    if (!pendingAppUpdateVersion || updateApplyInFlight) return;

    const deferralMessage = getUpdateDeferralMessage();
    if (deferralMessage) {
      setAppUpdateNotice(deferralMessage);
      return;
    }
    if (Date.now() < nextUpdateApplyAttemptAt) return;

    updateApplyInFlight = true;
    setAppUpdateNotice("A new version is ready. Saving your progress…");
    try {
      if (typeof rootScope.saveState !== "function") {
        throw new Error("App state persistence is unavailable.");
      }
      const saved = await rootScope.saveState();
      if (saved === false) {
        throw new Error("App state could not be saved before updating.");
      }
      const deferralAfterSave = getUpdateDeferralMessage();
      if (deferralAfterSave) {
        setAppUpdateNotice(deferralAfterSave);
        return;
      }

      sendCurrentVersionToWorker(
        rootScope.navigator?.serviceWorker?.controller,
        serviceWorkerRegistration?.active,
      );
      if (!serviceWorkerRegistration && serviceWorkerRegistrationFailed) {
        const updateUrl = new URL(rootScope.location.href);
        updateUrl.searchParams.set(
          UPDATE_QUERY_PARAMETER,
          pendingAppUpdateVersion,
        );
        rootScope.location.replace(updateUrl.href);
      } else {
        rootScope.location.reload();
      }
    } catch (error) {
      bootstrapLogger().error("Unable to safely apply the app update:", error);
      nextUpdateApplyAttemptAt = Date.now() + 60 * 1000;
      setAppUpdateNotice(
        "An update is ready, but your progress could not be saved. The current version is still available; retry when ready.",
        true,
      );
    } finally {
      updateApplyInFlight = false;
    }
  }

  function handleServiceWorkerMessage(event) {
    const message = event.data;
    if (!message || typeof message !== "object") return;

    if (message.type === "MRH_QUERY_CLIENT_VERSION") {
      sendClientVersionResponse(event);
      return;
    }
    if (message.type === "MRH_UPDATE_AVAILABLE") {
      markAppUpdateAvailable(message.version);
    }
  }

  function checkDeployedVersion() {
    if (
      !rootScope.fetch ||
      rootScope.navigator?.onLine === false ||
      typeof rootScope.__MRH_APP_BASE_PATH !== "string"
    ) {
      return Promise.resolve();
    }

    const versionUrl = new URL(
      "version.json",
      new URL(rootScope.__MRH_APP_BASE_PATH, window.location.origin),
    );
    versionUrl.searchParams.set("check", String(Date.now()));

    return rootScope
      .fetch(versionUrl.href, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Version check failed with HTTP ${response.status}.`);
        }
        return response.json();
      })
      .then(async (release) => {
        const releaseVersion = `mrh-${release?.version || ""}`;
        if (
          !/^\d{2}\.\d{2}\.\d{2}-(?:0|[1-9]\d*)$/.test(release?.version || "") ||
          releaseVersion === APP_VERSION ||
          releaseVersion === pendingAppUpdateVersion
        ) {
          return;
        }

        if (serviceWorkerRegistrationPromise) {
          await serviceWorkerRegistrationPromise;
        }

        if (serviceWorkerRegistration) {
          const swBaseUrl = new URL(
            rootScope.__MRH_APP_BASE_PATH,
            window.location.origin,
          );
          const swUrl = new URL("sw.js", swBaseUrl);
          swUrl.searchParams.set("v", releaseVersion);
          serviceWorkerRegistrationPromise =
            navigator.serviceWorker
              .register(swUrl.href, {
                scope: swBaseUrl.pathname,
                updateViaCache: "none",
              })
              .then((registration) => {
                serviceWorkerRegistration = registration;
                sendCurrentVersionToWorker(
                  navigator.serviceWorker.controller,
                  registration.active,
                );
                return registration;
              })
              .catch((error) => {
                bootstrapLogger().warn(
                  "Updated service worker registration failed:",
                  error,
                );
                throw error;
              });
          await serviceWorkerRegistrationPromise;
          return;
        }
        if (!serviceWorkerRegistrationFailed) return;

        await verifyDeployedReleaseAssets(releaseVersion);
        markAppUpdateAvailable(releaseVersion);
      })
      .catch((error) => {
        bootstrapLogger().warn("Deployed app version check failed:", error);
      });
  }

  rootScope.__MRH_REQUEST_APP_UPDATE = checkForAppUpdate;

  async function verifyDeployedReleaseAssets(version) {
    const baseUrl = new URL(
      rootScope.__MRH_APP_BASE_PATH,
      window.location.origin,
    );
    const assetNames = [
      "index.html",
      "manifest.json",
      "icon.c2ea557c7843a8ad.svg",
      "frontend/css/tailwind.generated.css",
      "frontend/css/styles.css",
      "frontend/js/app-config.js",
      "frontend/js/storage-utils.js",
      "frontend/js/text-utils.js",
      "frontend/js/debug-utils.js",
      "frontend/js/lifecycle-utils.js",
      "frontend/js/rendering-core.js",
      "frontend/js/app-core-state.js",
      "frontend/js/question-type-core.js",
      "frontend/js/resource-course-core.js",
      "frontend/js/resource-dashboard-normalization-core.js",
      "frontend/js/resource-dashboard-updates-core.js",
      "frontend/js/resource-dashboard-core.js",
      "frontend/js/resource-reviewer-pdf-core.js",
      "frontend/js/resource-catalog-core.js",
      "frontend/js/preferences-core.js",
      "frontend/js/deck-category-model-core.js",
      "frontend/js/dashboard-core.js",
      "frontend/js/app-bootstrap-core.js",
      "frontend/js/app-event-controller-core.js",
      "frontend/js/app-status-ui-core.js",
      "frontend/js/app-theme-controller-core.js",
      "frontend/js/deck-summary-mapper-core.js",
      "frontend/js/sync-cache-manager-core.js",
      "frontend/js/deck-refresh-queue-core.js",
      "frontend/js/sync-coordinator-core.js",
      "frontend/js/deck-repository-core.js",
      "frontend/js/deck-database-lifecycle-core.js",
      "frontend/js/deck-loader-core.js",
      "frontend/js/deck-access-state-core.js",
      "frontend/js/deck-navigation-controller-core.js",
      "frontend/js/review-controller-core.js",
      "frontend/js/question-navigation-core.js",
      "frontend/js/progress-service-core.js",
      "frontend/js/session-persistence-core.js",
      "frontend/js/app-core.js",
      "frontend/js/app-core-network.js",
      "frontend/js/reviewer-pdf-processor-core.js",
      "frontend/js/reviewer-pdf-viewer-core.js",
      "frontend/js/reviewer-pdf-download-core.js",
      "frontend/js/reviewer-auth-core.js",
      "frontend/js/reviewer-session-coordinator-core.js",
      "frontend/js/reviewer-profile-ui-core.js",
      "frontend/js/sync-core.js",
      "frontend/js/deck-nav-core.js",
      "frontend/js/ui-modal-core.js",
      "frontend/js/session-core.js",
      "frontend/js/analytics-core.js",
      "frontend/js/deck-review-core.js",
      "frontend/js/quiz-rendering-core.js",
      "reviewer-pdf-service/reviewer-pdf-worker.js",
      "reviewer-pdf-service/vendor/cantoo-pdf-lib-2.11.1.min.js",
      "reviewer-pdf-service/vendor/runtime/reviewer-pdf-regenerator-runtime-0.14.1.js",
      "reviewer-pdf-service/vendor/runtime/reviewer-pdf-bidi-1.1.0.min.js",
      "reviewer-pdf-service/vendor/runtime/reviewer-pdf-fontkit-2.0.12.min.js",
      "vendor/pdfjs/pdfjs-5.4.394.min.mjs",
      "vendor/pdfjs/pdfjs-5.4.394.worker.min.mjs",
    ];
    const checks = assetNames.map(async (name) => {
      const assetUrl = new URL(name, baseUrl);
      if (!/\.[0-9a-f]{16}\.(?:js|mjs|css|svg)$/.test(assetUrl.pathname)) {
        assetUrl.searchParams.set("v", version);
      }
      const response = await rootScope.fetch(assetUrl.href, {
        method: name === "app-entry.js" ? "GET" : "HEAD",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error(
          `Release asset check failed with HTTP ${response.status}: ${name}`,
        );
      }
      if (name === "app-entry.js") {
        const source = await response.text();
        if (!source.includes('new URL("version.json"')) {
          throw new Error("The entry script does not match the release version.");
        }
      }
    });
    await Promise.all(checks);
  }

  function checkForAppUpdate() {
    if (
      appUpdateCheck ||
      rootScope.navigator?.onLine === false ||
      document.visibilityState !== "visible"
    ) {
      return appUpdateCheck || Promise.resolve();
    }

    appUpdateCheck = Promise.all([
      serviceWorkerRegistration
        ? serviceWorkerRegistration.update().catch((error) => {
            bootstrapLogger().warn(
              "Service worker update check failed:",
              error,
            );
          })
        : Promise.resolve(),
      checkDeployedVersion(),
    ]).finally(() => {
      appUpdateCheck = null;
    });
    return appUpdateCheck;
  }

  function startAppUpdateChecks() {
    if (rootScope.__mrhAppUpdateChecksStarted) return;
    rootScope.__mrhAppUpdateChecksStarted = true;

    window.setInterval(checkForAppUpdate, APP_UPDATE_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void checkForAppUpdate();
        void applyPendingAppUpdate();
      }
    });
    window.addEventListener("online", () => {
      void checkForAppUpdate();
      void applyPendingAppUpdate();
    });
    const checkUpdateWhenForegrounded = () => {
      void checkForAppUpdate();
      void applyPendingAppUpdate();
    };
    window.addEventListener("focus", checkUpdateWhenForegrounded);
    window.addEventListener("pageshow", checkUpdateWhenForegrounded);
    window.addEventListener("hashchange", () => {
      void applyPendingAppUpdate();
    });
    window.addEventListener("popstate", () => {
      void applyPendingAppUpdate();
    });

    document
      .getElementById("app-update-retry")
      ?.addEventListener("click", () => {
        nextUpdateApplyAttemptAt = 0;
        void applyPendingAppUpdate();
      });
  }

  const loadedFeatures = new Set();
  const loadingFeatures = new Map();
  const BOOTSTRAP_SCRIPTS = [
    "frontend/js/app-config.js",
    "frontend/js/storage-utils.js",
    "frontend/js/text-utils.js",
    "frontend/js/debug-utils.js",
    "frontend/js/lifecycle-utils.js",
    "frontend/js/rendering-core.js",
    "frontend/js/app-core-state.js",
    "frontend/js/question-type-core.js",
    "frontend/js/resource-course-core.js",
    "frontend/js/resource-dashboard-normalization-core.js",
    "frontend/js/resource-dashboard-updates-core.js",
    "frontend/js/resource-dashboard-core.js",
    "frontend/js/resource-reviewer-pdf-core.js",
    "frontend/js/resource-catalog-core.js",
    "frontend/js/preferences-core.js",
    "frontend/js/deck-category-model-core.js",
    "frontend/js/dashboard-core.js",
  ];
  const APPLICATION_RUNTIME_SCRIPTS = [
    "frontend/js/app-core-actions.js",
    "frontend/js/app-bootstrap-core.js",
    "frontend/js/app-event-controller-core.js",
    "frontend/js/app-status-ui-core.js",
    "frontend/js/app-theme-controller-core.js",
    "frontend/js/resource-telemetry-core.js",
    "frontend/js/resource-dashboard-controller-core.js",
    "frontend/js/resource-catalog-view-core.js",
    "frontend/js/resource-portal-browser-core.js",
    "frontend/js/resource-preview-controller-core.js",
    "frontend/js/reviewer-pdf-processor-core.js",
    "frontend/js/reviewer-pdf-viewer-core.js",
    "frontend/js/reviewer-pdf-download-core.js",
    "frontend/js/reviewer-auth-core.js",
    "frontend/js/reviewer-session-coordinator-core.js",
    "frontend/js/reviewer-profile-ui-core.js",
    "frontend/js/deck-summary-mapper-core.js",
    "frontend/js/sync-cache-manager-core.js",
    "frontend/js/deck-refresh-queue-core.js",
    "frontend/js/sync-coordinator-core.js",
    "frontend/js/deck-repository-core.js",
    "frontend/js/deck-database-lifecycle-core.js",
    "frontend/js/deck-loader-core.js",
    "frontend/js/deck-access-state-core.js",
    "frontend/js/deck-navigation-controller-core.js",
    "frontend/js/review-controller-core.js",
    "frontend/js/question-navigation-core.js",
    "frontend/js/progress-service-core.js",
    "frontend/js/session-persistence-core.js",
    "frontend/js/app-core.js",
    "frontend/js/app-core-network.js",
    "frontend/js/sync-core.js",
    "frontend/js/deck-nav-core.js",
    "frontend/js/ui-modal-core.js",
  ];
  const CORE_SCRIPTS = [
    ...BOOTSTRAP_SCRIPTS,
    ...APPLICATION_RUNTIME_SCRIPTS,
  ];
  const KATEX_FEATURE_SCRIPT = {
    src: "https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js",
    integrity:
      "sha384-cpW21h6RZv/phavutF+AuVYrr+dA8xD9zs6FwLpaCct6O9ctzYFfFr4dgmgccOTx",
    crossOrigin: "anonymous",
  };
  const CHART_FEATURE_SCRIPT = {
    src: "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js",
    integrity:
      "sha384-NrKB+u6Ts6AtkIhwPixiKTzgSKNblyhlk0Sohlgar9UHUBzai/sgnNNWWd291xqt",
    crossOrigin: "anonymous",
  };
  const APP_FEATURE_SCRIPTS = {
    practice: [
      "frontend/js/session-core.js",
      "frontend/js/quiz-rendering-core.js",
      KATEX_FEATURE_SCRIPT,
    ],
    analytics: ["frontend/js/analytics-core.js", CHART_FEATURE_SCRIPT],
    "deck-review": [
      "frontend/js/deck-review-core.js",
      "frontend/js/quiz-rendering-core.js",
      KATEX_FEATURE_SCRIPT,
    ],
  };

  function loadScript(src, options = {}) {
    return new Promise((resolve, reject) => {
      if (typeof document === "undefined") {
        reject(new Error(`Cannot load ${src}: document is unavailable.`));
        return;
      }

      const resolvedSrc = (() => {
        const raw = String(src || "").trim();
        if (!raw) return raw;
        try {
          const baseHref =
            window.location.protocol === "file:"
              ? window.location.href
              : new URL(
                  rootScope.__MRH_APP_BASE_PATH || "/",
                  window.location.origin,
                ).href;
          return new URL(raw, baseHref).href;
        } catch {
          return raw;
        }
      })();

      const script = document.createElement("script");
      script.src = resolvedSrc;
      script.async = false;
      script.defer = false;
      if (options.integrity) script.integrity = options.integrity;
      if (options.crossOrigin) script.crossOrigin = options.crossOrigin;

      const cleanup = () => {
        rootScope.removeEventListener?.("error", onScriptRuntimeError);
      };
      const onScriptRuntimeError = (event) => {
        if (String(event.filename || "") !== resolvedSrc) return;
        cleanup();
        reject(
          event.error && typeof event.error.message === "string"
            ? event.error
            : new Error(`Failed to execute ${src}`),
        );
      };

      script.onload = () => {
        cleanup();
        resolve();
      };
      script.onerror = () => {
        cleanup();
        reject(new Error(`Failed to load ${src}`));
      };

      rootScope.addEventListener?.("error", onScriptRuntimeError);
      document.head.appendChild(script);
    });
  }

  function loadFeatureScript(src, options = {}) {
    if (!src || typeof src !== "string") {
      return Promise.reject(
        new TypeError("Feature script path must be a non-empty string."),
      );
    }

    if (loadedFeatures.has(src)) {
      return Promise.resolve();
    }

    const existingPromise = loadingFeatures.get(src);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = loadScript(src, options)
      .then(() => {
        loadedFeatures.add(src);
      })
      .finally(() => {
        loadingFeatures.delete(src);
      });

    loadingFeatures.set(src, promise);
    return promise;
  }

  async function ensureAppFeature(featureName) {
    const scripts = APP_FEATURE_SCRIPTS[featureName];
    if (!scripts) {
      throw new TypeError(`Unknown app feature: ${featureName}`);
    }

    try {
      await Promise.all(
        scripts.map((script) =>
          typeof script === "string"
            ? loadFeatureScript(script)
            : loadFeatureScript(script.src, script),
        ),
      );
      return true;
    } catch (error) {
      bootstrapLogger().error(
        `Unable to load the ${featureName} feature:`,
        error,
      );
      if (typeof rootScope.showToast === "function") {
        rootScope.showToast(
          "Unable to open this feature. Please check your connection and try again.",
          "error",
        );
      }
      return false;
    }
  }

  rootScope.loadFeatureScript = loadFeatureScript;
  rootScope.ensureAppFeature = ensureAppFeature;
  rootScope.openPracticeSession = async function openPracticeSession() {
    if (!(await ensureAppFeature("practice"))) return;
    if (typeof rootScope.initSession !== "function") {
      const error = new Error(
        "Practice session initialization is unavailable.",
      );
      bootstrapLogger().error("Unable to open practice session:", error);
      if (typeof rootScope.showToast === "function") {
        rootScope.showToast(
          "Unable to start a practice session. Please reload the app and try again.",
          "error",
        );
      }
      return;
    }
    rootScope.initSession();
  };

  rootScope.__MRH_BOOTSTRAP__ = {
    status: "idle",
    ready: null,
    error: null,
  };

  async function loadScriptsInParallel(files) {
    if (!Array.isArray(files) || files.length === 0) {
      return;
    }

    await Promise.all(files.map((file) => loadFeatureScript(file)));
  }

  async function loadApplicationRuntime() {
    await loadScriptsInParallel(CORE_SCRIPTS);
  }

  function showBootstrapError(error) {
    bootstrapLogger().error("App bootstrap failed:", error);
    if (typeof document !== "undefined") {
      document.documentElement?.setAttribute("data-app-ready", "true");
    }

    const status =
      typeof document !== "undefined"
        ? document.getElementById("connection-status")
        : null;

    if (!status) return;

    status.textContent = "Unable to start the app. Please reload the page.";
    status.classList.remove("hidden");
    status.setAttribute("role", "alert");
  }

  rootScope.showBootstrapError = showBootstrapError;

  async function retireLegacyPagesApp() {
    if (
      rootScope.location?.hostname !== "monarchx2.github.io" ||
      rootScope.__MRH_APP_BASE_PATH !== "/mrh/"
    ) {
      return;
    }

    const legacyAppUrl = new URL(
      LEGACY_PAGES_BASE_PATH,
      rootScope.location.origin,
    );
    const isLegacyPath = (pathname) =>
      pathname === LEGACY_PAGES_BASE_PATH.slice(0, -1) ||
      pathname.startsWith(LEGACY_PAGES_BASE_PATH);

    if (typeof navigator.serviceWorker?.getRegistrations === "function") {
      try {
        const registrations =
          await navigator.serviceWorker.getRegistrations();
        const unregisterResults = await Promise.allSettled(
          registrations
            .filter((registration) => {
              const scopeUrl = new URL(registration.scope);
              return (
                scopeUrl.origin === legacyAppUrl.origin &&
                isLegacyPath(scopeUrl.pathname)
              );
            })
            .map((registration) => registration.unregister()),
        );
        unregisterResults.forEach((result) => {
          if (result.status === "rejected") {
            bootstrapLogger().warn(
              "Unable to unregister the legacy Pages service worker:",
              result.reason,
            );
          }
        });
      } catch (error) {
        bootstrapLogger().warn(
          "Unable to unregister the legacy Pages service worker:",
          error,
        );
      }
    }

    if (typeof rootScope.caches?.keys === "function") {
      try {
        const cacheNames = await rootScope.caches.keys();
        const cacheResults = await Promise.allSettled(
          cacheNames.map(async (cacheName) => {
            const cache = await rootScope.caches.open(cacheName);
            const requests = await cache.keys();
            const legacyRequests = requests.filter((request) => {
              const requestUrl = new URL(request.url);
              return (
                requestUrl.origin === legacyAppUrl.origin &&
                isLegacyPath(requestUrl.pathname)
              );
            });
            const deleteResults = await Promise.allSettled(
              legacyRequests.map((request) => cache.delete(request)),
            );
            deleteResults.forEach((result) => {
              if (result.status === "rejected") {
                bootstrapLogger().warn(
                  "Unable to delete a cached asset from the legacy Pages path:",
                  result.reason,
                );
              }
            });
          }),
        );
        cacheResults.forEach((result) => {
          if (result.status === "rejected") {
            bootstrapLogger().warn(
              "Unable to clear cached assets from the legacy Pages path:",
              result.reason,
            );
          }
        });
      } catch (error) {
        bootstrapLogger().warn(
          "Unable to clear cached assets from the legacy Pages path:",
          error,
        );
      }
    }
  }

  function registerServiceWorker() {
    if (
      typeof navigator === "undefined" ||
      !navigator.serviceWorker ||
      typeof navigator.serviceWorker.register !== "function"
    ) {
      serviceWorkerRegistrationFailed = true;
      return;
    }

    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage,
    );
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      sendCurrentVersionToWorker(navigator.serviceWorker.controller);
    });

    const swBaseUrl = new URL(
      rootScope.__MRH_APP_BASE_PATH || "/",
      window.location.origin,
    );
    const swScopeUrl = new URL(swBaseUrl.pathname, swBaseUrl.origin);
    const swUrl = new URL("sw.js", swBaseUrl);
    swUrl.searchParams.set("v", APP_VERSION);

    serviceWorkerRegistrationPromise = retireLegacyPagesApp()
      .then(() =>
        navigator.serviceWorker.register(swUrl.href, {
          scope: swScopeUrl.pathname,
          updateViaCache: "none",
        }),
      )
      .then((registration) => {
        serviceWorkerRegistration = registration;
        sendCurrentVersionToWorker(
          navigator.serviceWorker.controller,
          registration.active,
        );
        return registration;
      })
      .catch((error) => {
        serviceWorkerRegistrationFailed = true;
        bootstrapLogger().warn("Service worker registration failed:", error);
        return null;
      });
  }

  function missingRuntimeDependencies() {
    const missing = [];

    if (typeof rootScope.StorageUtils === "undefined") {
      missing.push("StorageUtils");
    }
    if (typeof rootScope.TextUtils === "undefined") {
      missing.push("TextUtils");
    }
    if (typeof rootScope.AppState === "undefined") {
      missing.push("AppState");
    }
    if (typeof rootScope.AppNetwork === "undefined") {
      missing.push("AppNetwork");
    }
    if (typeof rootScope.ensureAppFeature !== "function") {
      missing.push("ensureAppFeature");
    }
    if (typeof rootScope.initializeApp !== "function") {
      missing.push("initializeApp");
    }

    return missing;
  }

  function waitForRuntimeDependencies() {
    const missing = missingRuntimeDependencies();
    if (missing.length) {
      rootScope.__mrhRuntimeReady = false;
      throw new Error(
        `Startup dependencies were not ready after script loading: ${missing.join(", ")}`,
      );
    }
    rootScope.__mrhRuntimeReady = true;
  }

  async function startApplicationBootstrap() {
    const bootstrap = rootScope.__MRH_BOOTSTRAP__ || {
      status: "idle",
      ready: null,
      error: null,
    };

    if (bootstrap.status === "loading" && bootstrap.ready) {
      return bootstrap.ready;
    }

    if (bootstrap.status === "ready" && bootstrap.ready) {
      return bootstrap.ready;
    }

    bootstrap.status = "loading";
    bootstrap.error = null;

    bootstrap.ready = (async function () {
      try {
        await Promise.all([releaseMetadataPromise, loadApplicationRuntime()]);
        registerServiceWorker();
        await waitForRuntimeDependencies();

        if (typeof rootScope.initializeApp === "function") {
          const initialized = await rootScope.initializeApp();
          if (initialized !== true) {
            throw new Error("Application initialization did not complete successfully.");
          }
        }

        bootstrap.status = "ready";
        rootScope.__mrhBootstrapComplete = true;
        startAppUpdateChecks();
        sendCurrentVersionToWorker(
          navigator.serviceWorker?.controller,
          serviceWorkerRegistration?.active,
        );
        void applyPendingAppUpdate();
        return true;
      } catch (error) {
        bootstrap.status = "failed";
        bootstrap.error = error;
        rootScope.__mrhBootstrapComplete = false;
        showBootstrapError(error);
        throw error;
      }
    })();

    return bootstrap.ready;
  }

  rootScope.startApplicationBootstrap = startApplicationBootstrap;
  const startupPromise = startApplicationBootstrap();
  startupPromise.catch((error) => {
    if (rootScope.__MRH_BOOTSTRAP__?.error !== error)
      showBootstrapError(error);
  });
  rootScope.__MRH_BOOTSTRAP__.ready = startupPromise;
})();
