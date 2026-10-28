importScripts("./frontend/js/debug-utils.js");

const swLogger = self.DebugUtils || console;
const CACHE_PREFIX = "mrh-cache";
let APP_VERSION = "";
const CANONICAL_APP_URL = "https://monarchx2.github.io/mrh/";

function getRuntimeCacheVersion() {
  return APP_VERSION;
}

let CACHE_VERSION = "";
let CACHE_NAME = "";
const CLIENT_VERSION_QUERY_TIMEOUT_MS = 1500;
let clientVersionRequestSequence = 0;
let pendingClientVersionRequests = new Map();
let cacheCleanupPromise = null;

const APP_BASE_URL = new URL("./", self.location.href);
const APP_BASE_PATH = APP_BASE_URL.pathname || "/";

function resolveAppUrl(pathname) {
  const url = new URL(pathname, APP_BASE_URL);
  if (!/\.[0-9a-f]{16}\.(?:js|css|svg|mjs)$/.test(url.pathname)) {
    url.searchParams.set("v", CACHE_VERSION);
  }
  return url.toString();
}

function getAssetFetchCacheMode(url) {
  return /\.[0-9a-f]{16}\.(?:js|css|svg|mjs)$/.test(new URL(url).pathname)
    ? "force-cache"
    : "no-cache";
}

function getAppBasePath() {
  const basePath = APP_BASE_PATH;
  return basePath === "/"
    ? "/"
    : basePath.endsWith("/")
      ? basePath
      : `${basePath}/`;
}

function getAppShellNavigationPaths() {
  const appBasePath = getAppBasePath();
  const normalizedBasePath =
    appBasePath === "/" ? "/" : appBasePath.replace(/\/+$/, "") || "/";
  const candidates = new Set([
    normalizedBasePath,
    normalizedBasePath === "/" ? "/" : `${normalizedBasePath}/`,
  ]);

  const indexAliases = [
    normalizedBasePath === "/"
      ? "/index.html"
      : `${normalizedBasePath}/index.html`,
    normalizedBasePath === "/"
      ? "/index.htm"
      : `${normalizedBasePath}/index.htm`,
  ];

  for (const alias of indexAliases) {
    candidates.add(alias);
  }

  return candidates;
}

const APP_SHELL_NAVIGATION_PATHS = getAppShellNavigationPaths();

const APP_SHELL_PATHS = [
  "./index.html",
  "./manifest.json",
  "./icon.c2ea557c7843a8ad.svg",
  "./version.json",
  "./frontend/css/tailwind.generated.css",
  "./frontend/css/styles.css",
  "./app-entry.5194569d98d7392b.js",
  "./frontend/js/app-config.js",
  "./frontend/js/app-core-actions.js",
  "./frontend/js/app-bootstrap-core.js",
  "./frontend/js/app-event-controller-core.js",
  "./frontend/js/app-status-ui-core.js",
  "./frontend/js/app-theme-controller-core.js",
  "./frontend/js/resource-telemetry-core.js",
  "./frontend/js/resource-dashboard-controller-core.js",
  "./frontend/js/resource-catalog-view-core.js",
  "./frontend/js/resource-portal-browser-core.js",
  "./frontend/js/resource-preview-controller-core.js",
  "./frontend/js/reviewer-pdf-processor-core.js",
  "./frontend/js/reviewer-pdf-viewer-core.js",
  "./frontend/js/reviewer-pdf-download-core.js",
  "./frontend/js/reviewer-auth-core.js",
  "./frontend/js/reviewer-session-coordinator-core.js",
  "./frontend/js/reviewer-profile-ui-core.js",
  "./frontend/js/deck-summary-mapper-core.js",
  "./frontend/js/sync-cache-manager-core.js",
  "./frontend/js/deck-refresh-queue-core.js",
  "./frontend/js/sync-coordinator-core.js",
  "./frontend/js/deck-repository-core.js",
  "./frontend/js/deck-database-lifecycle-core.js",
  "./frontend/js/deck-loader-core.js",
  "./frontend/js/deck-access-state-core.js",
  "./frontend/js/deck-category-model-core.js",
  "./frontend/js/app-core.js",
  "./frontend/js/preferences-core.js",
  "./frontend/js/dashboard-core.js",
  "./frontend/js/app-core-state.js",
  "./frontend/js/app-core-actions.js",
  "./frontend/js/resource-telemetry-core.js",
  "./frontend/js/app-core-network.js",
  "./vendor/pdfjs/pdfjs-5.4.394.min.mjs",
  "./vendor/pdfjs/pdfjs-5.4.394.worker.min.mjs",
  "./frontend/js/sync-core.js",
  "./frontend/js/deck-navigation-controller-core.js",
  "./frontend/js/review-controller-core.js",
  "./frontend/js/question-navigation-core.js",
  "./frontend/js/progress-service-core.js",
  "./frontend/js/session-persistence-core.js",
  "./frontend/js/session-core.js",
  "./frontend/js/analytics-core.js",
  "./frontend/js/ui-modal-core.js",
  "./frontend/js/deck-nav-core.js",
  "./frontend/js/deck-review-core.js",
  "./frontend/js/quiz-rendering-core.js",
  "./frontend/js/debug-utils.js",
  "./frontend/js/lifecycle-utils.js",
  "./frontend/js/rendering-core.js",
  "./frontend/js/storage-utils.js",
  "./frontend/js/text-utils.js",
  "./frontend/js/question-type-core.js",
  "./frontend/js/resource-course-core.js",
  "./frontend/js/resource-dashboard-normalization-core.js",
  "./frontend/js/resource-dashboard-updates-core.js",
  "./frontend/js/resource-dashboard-core.js",
  "./frontend/js/resource-reviewer-pdf-core.js",
  "./frontend/js/resource-catalog-core.js",
];
const APP_SHELL_PRECACHE_PATHS = [
  "./index.html",
  "./manifest.json",
  "./icon.c2ea557c7843a8ad.svg",
  "./version.json",
  "./frontend/css/tailwind.generated.css",
  "./frontend/css/styles.css",
  "./app-entry.5194569d98d7392b.js",
  "./frontend/js/app-config.js",
  "./frontend/js/app-core.js",
  "./frontend/js/app-core-network.js",
  "./frontend/js/app-core-actions.js",
  "./frontend/js/app-bootstrap-core.js",
  "./frontend/js/app-event-controller-core.js",
  "./frontend/js/app-status-ui-core.js",
  "./frontend/js/app-theme-controller-core.js",
  "./frontend/js/resource-telemetry-core.js",
  "./frontend/js/resource-dashboard-controller-core.js",
  "./frontend/js/resource-catalog-view-core.js",
  "./frontend/js/resource-portal-browser-core.js",
  "./frontend/js/resource-preview-controller-core.js",
  "./frontend/js/reviewer-pdf-processor-core.js",
  "./frontend/js/reviewer-pdf-viewer-core.js",
  "./frontend/js/reviewer-pdf-download-core.js",
  "./frontend/js/reviewer-auth-core.js",
  "./frontend/js/reviewer-session-coordinator-core.js",
  "./frontend/js/reviewer-profile-ui-core.js",
  "./frontend/js/deck-summary-mapper-core.js",
  "./frontend/js/sync-cache-manager-core.js",
  "./frontend/js/deck-refresh-queue-core.js",
  "./frontend/js/sync-coordinator-core.js",
  "./frontend/js/deck-repository-core.js",
  "./frontend/js/deck-database-lifecycle-core.js",
  "./frontend/js/deck-loader-core.js",
  "./frontend/js/deck-access-state-core.js",
  "./frontend/js/deck-category-model-core.js",
  "./frontend/js/sync-core.js",
  "./frontend/js/deck-navigation-controller-core.js",
  "./frontend/js/review-controller-core.js",
  "./frontend/js/question-navigation-core.js",
  "./frontend/js/progress-service-core.js",
  "./frontend/js/session-persistence-core.js",
  "./frontend/js/deck-nav-core.js",
  "./frontend/js/ui-modal-core.js",
  "./frontend/js/app-core-state.js",
  "./frontend/js/preferences-core.js",
  "./frontend/js/dashboard-core.js",
  "./frontend/js/debug-utils.js",
  "./frontend/js/lifecycle-utils.js",
  "./frontend/js/rendering-core.js",
  "./frontend/js/storage-utils.js",
  "./frontend/js/text-utils.js",
  "./frontend/js/question-type-core.js",
  "./frontend/js/resource-course-core.js",
  "./frontend/js/resource-dashboard-normalization-core.js",
  "./frontend/js/resource-dashboard-updates-core.js",
  "./frontend/js/resource-dashboard-core.js",
  "./frontend/js/resource-reviewer-pdf-core.js",
  "./frontend/js/resource-catalog-core.js",
];
const APP_SHELL_RESOURCE_PATHS = new Set(
  APP_SHELL_PATHS.map((path) => path.replace(/^\.\//, "")),
);

let APP_SHELL = [];
let APP_SHELL_PRECACHE = [];
let APP_SHELL_RESOURCE_NAMES = new Set();

const APP_SHELL_INTEGRITY = Object.create(null);

async function hashResponse(response) {
  if (!response || !response.ok) return null;

  const subtleCrypto = self.crypto?.subtle;
  if (!subtleCrypto) return null;

  const digest = await subtleCrypto.digest(
    "SHA-256",
    await response.clone().arrayBuffer(),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

self.__MRH_SW__ = {
  getRuntimeCacheVersion,
  getAppBasePath,
  resolveAppUrl,
  get CACHE_NAME() {
    return CACHE_NAME;
  },
};

const CDN_ORIGINS = new Set([
  "https://cdnjs.cloudflare.com",
  "https://cdn.jsdelivr.net",
]);

const STATIC_DESTINATIONS = new Set([
  "script",
  "style",
  "image",
  "font",
  "manifest",
  "worker",
  "sharedworker",
]);

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAllowedCdn(url) {
  return CDN_ORIGINS.has(url.origin);
}

function isAppRequest(request) {
  const url = new URL(request.url);

  return (
    (isSameOrigin(url) && url.pathname.startsWith(getAppBasePath())) ||
    isAllowedCdn(url)
  );
}

function isStaticRequest(request) {
  if (request.method !== "GET") {
    return false;
  }

  if (request.headers.has("range")) {
    return false;
  }

  const url = new URL(request.url);

  if (!isAppRequest(request)) {
    return false;
  }

  // Cross-origin resources are only treated as static if they come
  // from one of the explicitly allowed CDNs.
  if (!isSameOrigin(url)) {
    return true;
  }

  // For same-origin requests, only intercept actual static resources.
  // fetch()/XHR requests normally have an empty destination and will
  // therefore pass through untouched.
  return (
    STATIC_DESTINATIONS.has(request.destination) ||
    APP_SHELL_RESOURCE_NAMES.has(getAppResourceName(url)) ||
    APP_SHELL_RESOURCE_PATHS.has(getAppResourceName(url))
  );
}

function isAppShellNavigation(request) {
  if (request.method !== "GET" || request.mode !== "navigate") {
    return false;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url)) {
    return false;
  }

  const appBasePath = getAppBasePath();
  const normalizedPath = url.pathname || "/";
  return (
    APP_SHELL_NAVIGATION_PATHS.has(normalizedPath) ||
    normalizedPath.startsWith(appBasePath)
  );
}

async function getCache() {
  return caches.open(CACHE_NAME);
}

function getAppResourceName(url) {
  const path = new URL(url).pathname;
  const basePath = APP_BASE_PATH.endsWith("/")
    ? APP_BASE_PATH
    : `${APP_BASE_PATH}/`;
  const resourceName = path.startsWith(basePath)
    ? path.slice(basePath.length)
    : "";
  return APP_SHELL_NAVIGATION_PATHS.has(path) ? "index.html" : resourceName;
}

async function verifyResponseIntegrity(
  response,
  url,
  expectedHash = APP_SHELL_INTEGRITY[getAppResourceName(url)] ||
    new URL(url).pathname
      .match(/\.[0-9a-f]{16}\.(?:js|mjs|css|svg)$/i)?.[0]
      ?.slice(1, 17),
) {
  if (!expectedHash) return;

  const actualHash = await hashResponse(response);
  if (!actualHash) {
    throw new Error(`Web Crypto is unavailable for ${url}`);
  }

  if (
    expectedHash.length === 16
      ? actualHash.slice(0, 16) !== expectedHash
      : actualHash !== expectedHash
  ) {
    const error = new Error(
      `Integrity mismatch for ${url}: expected ${expectedHash}, got ${actualHash}`,
    );
    swLogger.error("[SW] Refusing an inconsistent app-shell resource:", error);
    throw error;
  }
}

async function cacheResponse(cache, request, response) {
  if (!response || !response.ok) {
    return;
  }

  // Only cache responses that are safe for this cache.
  if (response.type === "opaque") {
    return;
  }

  await verifyResponseIntegrity(response, request.url);

  try {
    await cache.put(request, response.clone());
  } catch (error) {
    swLogger.warn("[SW] Failed to cache response:", request.url, error);
  }
}

async function precacheAppShell() {
  const cache = await getCache();

  await Promise.all(
    APP_SHELL_PRECACHE.map(async (url) => {
      try {
        const response = await fetch(
          new Request(url, {
            method: "GET",
            cache: getAssetFetchCacheMode(url),
            credentials: "same-origin",
          }),
        );

        if (!response.ok) {
          throw new Error(
            `Precache failed with HTTP ${response.status}: ${url}`,
          );
        }

        const resourceName = getAppResourceName(url);
        if (resourceName) {
          const digest = await hashResponse(response);
          if (digest) {
            APP_SHELL_INTEGRITY[resourceName] = digest;
          }
        }
        if (resourceName === "index.html") {
          const entryScript = APP_SHELL.map((assetUrl) =>
            getAppResourceName(assetUrl),
          ).find((name) => /^app-entry(?:\.[0-9a-f]{16})?\.js$/.test(name));
          const html = await response.clone().text();
          if (!entryScript || !html.includes(entryScript)) {
            throw new Error(
              "The app entry point does not reference this release's entry script.",
            );
          }
        }
        await cache.put(url, response);
      } catch (error) {
        swLogger.error("[SW] Failed to precache:", url, error);

        // Abort installation if a required app-shell resource cannot
        // be cached. This prevents installing a worker that cannot
        // provide the complete offline shell.
        throw error;
      }
    }),
  );
}

async function verifyCurrentReleaseMetadata() {
  const versionUrl = new URL("version.json", APP_BASE_URL);
  versionUrl.searchParams.set("check", "release");

  try {
    const response = await fetch(
      new Request(versionUrl, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    if (!response.ok) {
      throw new Error(
        `Release metadata check failed with HTTP ${response.status}.`,
      );
    }

    const release = await response.json();
    if (!/^\d{2}\.\d{2}\.\d{2}-(?:0|[1-9]\d*)$/.test(release?.version || "")) {
      throw new Error("Release metadata contains an invalid website version.");
    }
    APP_VERSION = `mrh-${release.version}`;
    CACHE_VERSION = getRuntimeCacheVersion();
    CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
    APP_SHELL = APP_SHELL_PATHS.map(resolveAppUrl);
    APP_SHELL_PRECACHE = APP_SHELL_PRECACHE_PATHS.map(resolveAppUrl);
    APP_SHELL_RESOURCE_NAMES = new Set(
      APP_SHELL.map((url) => getAppResourceName(url)),
    );
    return;
  } catch (error) {
    const isLocalDevOrigin =
      self.location.hostname === "127.0.0.1" ||
      self.location.hostname === "localhost" ||
      self.location.protocol === "file:";
    if (isLocalDevOrigin) {
      swLogger.warn(
        "[SW] Unable to verify release metadata on the local dev origin; using the dev cache key.",
        error,
      );
      APP_VERSION = "mrh-dev";
      CACHE_VERSION = getRuntimeCacheVersion();
      CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
      APP_SHELL = APP_SHELL_PATHS.map(resolveAppUrl);
      APP_SHELL_PRECACHE = APP_SHELL_PRECACHE_PATHS.map(resolveAppUrl);
      APP_SHELL_RESOURCE_NAMES = new Set(
        APP_SHELL.map((url) => getAppResourceName(url)),
      );
      return;
    }
    throw error;
  }
}

let releaseMetadataPromise = null;
function ensureCurrentReleaseMetadata() {
  if (APP_VERSION) return Promise.resolve();
  if (!releaseMetadataPromise) {
    releaseMetadataPromise = verifyCurrentReleaseMetadata().catch((error) => {
      releaseMetadataPromise = null;
      throw error;
    });
  }
  return releaseMetadataPromise;
}

function isAppClient(client) {
  if (!client?.url) return false;
  const url = new URL(client.url);
  const appBasePath = getAppBasePath();
  const normalizedBasePath =
    appBasePath === "/" ? "/" : appBasePath.replace(/\/+$/, "");
  return (
    isSameOrigin(url) &&
    (normalizedBasePath === "/" ||
      url.pathname === normalizedBasePath ||
      url.pathname.startsWith(`${normalizedBasePath}/`))
  );
}

async function getAppClients() {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  return clients.filter(isAppClient);
}

function requestClientVersion(client) {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${++clientVersionRequestSequence}`;
    const timeout = self.setTimeout(() => {
      pendingClientVersionRequests.delete(requestId);
      resolve(null);
    }, CLIENT_VERSION_QUERY_TIMEOUT_MS);

    pendingClientVersionRequests.set(requestId, {
      clientId: client.id,
      timeout,
      resolve,
    });

    try {
      client.postMessage({
        type: "MRH_QUERY_CLIENT_VERSION",
        requestId,
      });
    } catch (error) {
      self.clearTimeout(timeout);
      pendingClientVersionRequests.delete(requestId);
      swLogger.warn("[SW] Unable to query an app tab version:", error);
      resolve(null);
    }
  });
}

async function cleanupOldCachesWhenSafe() {
  if (cacheCleanupPromise) return cacheCleanupPromise;

  cacheCleanupPromise = (async () => {
    const clients = await getAppClients();
    const versions = await Promise.all(clients.map(requestClientVersion));

    // An unresponsive older tab may still need its release cache.
    if (
      versions.some((version) => !/^mrh-[A-Za-z0-9._-]+$/.test(version || ""))
    ) {
      return;
    }

    const inUseCaches = new Set(
      versions.map((version) => `${CACHE_PREFIX}-${version}`),
    );
    inUseCaches.add(CACHE_NAME);
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && !inUseCaches.has(key))
        .map((key) => caches.delete(key)),
    );
  })().finally(() => {
    cacheCleanupPromise = null;
  });

  return cacheCleanupPromise;
}

async function notifyAppClientsUpdateAvailable() {
  const clients = await getAppClients();
  clients.forEach((client) => {
    try {
      client.postMessage({
        type: "MRH_UPDATE_AVAILABLE",
        version: APP_VERSION,
      });
    } catch (error) {
      swLogger.warn("[SW] Unable to notify an app tab about an update:", error);
    }
  });
}

function isCanonicalAppRequest(url) {
  const requestUrl = new URL(url);
  const canonicalUrl = new URL(CANONICAL_APP_URL);
  return (
    requestUrl.origin === canonicalUrl.origin &&
    (requestUrl.pathname === canonicalUrl.pathname.replace(/\/$/, "") ||
      requestUrl.pathname.startsWith(canonicalUrl.pathname))
  );
}

function isCanonicalAppDeepLink(url) {
  const requestUrl = new URL(url);
  return (
    isCanonicalAppRequest(requestUrl) &&
    !APP_SHELL_NAVIGATION_PATHS.has(requestUrl.pathname || "/")
  );
}

async function networkFirstNavigation(event) {
  const cache = await getCache();

  try {
    const response = await fetch(event.request, { cache: "no-store" });

    if (!response.ok) {
      if (
        response.status === 404 &&
        isCanonicalAppDeepLink(event.request.url)
      ) {
        return response;
      }
      throw new Error(`Navigation failed with HTTP ${response.status}`);
    }

    await verifyResponseIntegrity(response, event.request.url);

    if (response && response.ok && response.type !== "opaque") {
      // Only store the application entry point.
      // Do not cache arbitrary navigation URLs because they may contain
      // dynamic or user-specific HTML.
      const url = new URL(event.request.url);

      if (
        url.origin === self.location.origin &&
        APP_SHELL_NAVIGATION_PATHS.has(url.pathname || "/")
      ) {
        // Do not block navigation on cache persistence. The response can be
        // returned immediately while the service worker stores the fresh shell.
        event.waitUntil(
          cache
            .put(resolveAppUrl("./index.html"), response.clone())
            .catch((error) => {
              swLogger.warn("[SW] Failed to refresh app shell cache:", error);
            }),
        );
      }
    }

    return response;
  } catch (error) {
    swLogger.warn(
      "[SW] Navigation network request failed, using cache:",
      error,
    );

    const appEntryUrl = resolveAppUrl("./index.html");
    const cached =
      (await cache.match(event.request)) || (await cache.match(appEntryUrl));

    if (cached) {
      const cachedHtml = await cached.text();
      const baseElement = `<base href="${getAppBasePath()}">`;
      const appHtml = cachedHtml.replace(
        /<head(?:\s[^>]*)?>/i,
        (head) => `${head}${baseElement}`,
      );
      const appHtmlWithFallbackBase =
        appHtml === cachedHtml
          ? cachedHtml.replace(
              /<html(?:\s[^>]*)?>/i,
              (html) => `${html}<head>${baseElement}`,
            )
          : appHtml;
      if (appHtmlWithFallbackBase === cachedHtml) {
        throw new Error(
          "Cached application entry point has no HTML root element.",
        );
      }

      const headers = new Headers(cached.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      return new Response(appHtmlWithFallbackBase, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }

    if (!isCanonicalAppRequest(event.request.url))
      return Response.redirect(CANONICAL_APP_URL, 302);

    return new Response(
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#111217">
    <title>Offline - Maritime Review Hub</title>
    <style>
      body {
        box-sizing: border-box;
        display: grid;
        min-height: 100vh;
        margin: 0;
        padding: 24px;
        place-items: center;
        background: #f8fafc;
        color: #111827;
        font: 16px/1.5 system-ui, sans-serif;
      }
      main { max-width: 440px; }
      h1 { margin: 0 0 12px; font-size: 1.75rem; }
      p { margin: 0 0 16px; }
      button {
        border: 0;
        border-radius: 8px;
        padding: 12px 18px;
        background: #1d4ed8;
        color: white;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <main>
      <h1>You're offline</h1>
      <p>The app's offline copy isn't available. Clearing app data removes saved app files, so connect to the internet to load the app again.</p>
      <p id="connection-status" role="status" aria-live="polite"></p>
      <button id="retry-button" type="button">Try again</button>
    </main>
    <script>
      const appUrl = ${JSON.stringify(CANONICAL_APP_URL)};
      const status = document.getElementById("connection-status");
      const retryApp = () => location.replace(appUrl);
      status.textContent = navigator.onLine
        ? "The connection may be temporarily unavailable. Try loading again."
        : "Waiting for an internet connection...";
      document
        .getElementById("retry-button")
        .addEventListener("click", retryApp);
      window.addEventListener("online", retryApp, { once: true });
    </script>
  </body>
</html>`,
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}

function getAppShellResourceRequest(request) {
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return request;

  const resourceName = getAppResourceName(url);
  if (!APP_SHELL_RESOURCE_NAMES.has(resourceName)) return request;

  return new Request(resolveAppUrl(`./${resourceName}`), request);
}

function staleWhileRevalidateStatic(request, event) {
  let finishBackgroundRefresh;
  const backgroundRefresh = new Promise((resolve) => {
    finishBackgroundRefresh = resolve;
  });
  event.waitUntil(backgroundRefresh);

  const response = (async () => {
    const cache = await getCache();
    const cached = await cache.match(request);
    const refresh = fetch(request)
      .then(async (networkResponse) => {
        if (
          networkResponse &&
          networkResponse.ok &&
          networkResponse.type !== "opaque"
        ) {
          await cacheResponse(cache, request, networkResponse);
        }
        return networkResponse;
      })
      .catch((error) => {
        if (!cached) throw error;
        swLogger.warn(
          "[SW] Static refresh failed; using cached response:",
          request.url,
        );
        return cached;
      });

    if (cached) {
      refresh.then(finishBackgroundRefresh, finishBackgroundRefresh);
      return cached;
    }

    finishBackgroundRefresh();
    // First visits still wait for the network and populate the cache.
    return refresh;
  })();

  return response.catch((error) => {
    finishBackgroundRefresh();
    throw error;
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await ensureCurrentReleaseMetadata();
      await precacheAppShell();

      // Activate the new worker as soon as its installation succeeds.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await ensureCurrentReleaseMetadata();
      await notifyAppClientsUpdateAvailable();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "MRH_CLIENT_VERSION_RESPONSE") {
    const pending = pendingClientVersionRequests.get(message.requestId);
    if (!pending || pending.clientId !== event.source?.id) return;

    self.clearTimeout(pending.timeout);
    pendingClientVersionRequests.delete(message.requestId);
    pending.resolve(message.version);
    return;
  }

  if (message.type === "MRH_CLIENT_VERSION") {
    event.waitUntil(
      ensureCurrentReleaseMetadata().then(() => cleanupOldCachesWhenSafe()),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  // Never interfere with range requests.
  // This avoids breaking media/partial-content semantics.
  if (request.headers.has("range")) {
    return;
  }

  const url = new URL(request.url);

  // Never handle unrelated cross-origin requests.
  if (!isAppRequest(request)) {
    return;
  }

  if (isAppShellNavigation(request) || isStaticRequest(request)) {
    event.respondWith(
      ensureCurrentReleaseMetadata().then(() => {
        if (isAppShellNavigation(request)) {
          return networkFirstNavigation(event);
        }
        return staleWhileRevalidateStatic(
          getAppShellResourceRequest(request),
          event,
        );
      }),
    );
  }

  // API, fetch(), XHR, JSON, database/network requests, etc.
  // are intentionally NOT intercepted.
});
