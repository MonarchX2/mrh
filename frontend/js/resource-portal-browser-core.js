(function (globalScope) {
  "use strict";

  const DOCUMENTS_CACHE_KEY = "resource_portal_documents_cache_v1";
  const FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;

  function create({
    document = globalScope.document,
    storage = globalScope.StorageUtils,
    network = () => globalScope.AppNetwork,
    logger = globalScope.DebugUtils || console,
    renderListing,
    clearListing,
    setStatus,
    onError,
    getLoadedState,
    getPreviewGeneration,
    getFolderGeneration,
    nextFolderGeneration,
    getFolderListing,
    setFolderListing,
    getFolderPanel,
    renderFolderListing,
    releasePreviewObjectUrl,
  } = {}) {
    const requiredCallbacks = {
      renderListing,
      clearListing,
      setStatus,
      onError,
      getLoadedState,
      getPreviewGeneration,
      getFolderGeneration,
      nextFolderGeneration,
      getFolderListing,
      setFolderListing,
      getFolderPanel,
      renderFolderListing,
      releasePreviewObjectUrl,
    };
    for (const [name, callback] of Object.entries(requiredCallbacks)) {
      if (typeof callback !== "function") {
        throw new TypeError(`${name} is required for the resource browser.`);
      }
    }
    if (!document)
      throw new TypeError("A document is required for the resource browser.");

    let requestGeneration = 0;

    function removeCachedListings() {
      if (typeof storage?.removeSessionStoredItemsByPrefix !== "function") {
        throw new Error("Resource listing cleanup is unavailable.");
      }
      storage.removeSessionStoredItemsByPrefix("resource_portal_listing_");
    }

    function isValidCachedListing(cache, folderId) {
      const listing = cache?.listing;
      if (
        cache?.version !== 1 ||
        cache.folderId !== folderId ||
        !listing ||
        listing.folder?.id !== folderId ||
        typeof listing.folder.name !== "string" ||
        !Array.isArray(listing.breadcrumbs) ||
        !listing.breadcrumbs.length ||
        !Array.isArray(listing.items) ||
        listing.items.length > 1000 ||
        typeof listing.truncated !== "boolean"
      )
        return false;
      if (
        !listing.breadcrumbs.every(
          (crumb) =>
            FOLDER_ID_PATTERN.test(String(crumb?.id || "")) &&
            typeof crumb.name === "string",
        ) ||
        listing.breadcrumbs.at(-1)?.id !== folderId
      )
        return false;
      return listing.items.every(
        (item) =>
          FOLDER_ID_PATTERN.test(String(item?.id || "")) &&
          typeof item.name === "string" &&
          Boolean(item.name) &&
          (item.type === "folder" || item.type === "file") &&
          typeof item.mimeType === "string" &&
          Boolean(item.mimeType) &&
          (item.type === "folder") ===
            (item.mimeType === "application/vnd.google-apps.folder") &&
          (item.modifiedTime === undefined ||
            typeof item.modifiedTime === "string") &&
          (item.thumbnailLink === undefined ||
            typeof item.thumbnailLink === "string"),
      );
    }

    function getCachedListing(folderId) {
      if (typeof storage?.getSessionStoredJSON !== "function") return null;
      const cache = storage.getSessionStoredJSON(DOCUMENTS_CACHE_KEY, null);
      return isValidCachedListing(cache, folderId) ? cache.listing : null;
    }

    function cacheListing(folderId, listing) {
      if (typeof storage?.setSessionStoredJSON !== "function") return false;
      const cache = { version: 1, folderId, listing };
      if (!isValidCachedListing(cache, folderId)) return false;
      const saved = storage.setSessionStoredJSON(DOCUMENTS_CACHE_KEY, cache);
      if (!saved)
        logger.warn("Documents listing could not be saved for refresh.");
      return saved;
    }

    function clearDocumentsListing() {
      if (
        typeof storage?.removeSessionStoredItem !== "function" ||
        !storage.removeSessionStoredItem(DOCUMENTS_CACHE_KEY)
      ) {
        logger.warn(
          "Unable to remove an unavailable Documents listing from session storage.",
        );
      }
      clearListing();
    }

    async function loadFolder(folderId, { openExternal = false } = {}) {
      const status = document.getElementById("resource-portal-status");
      const list = document.getElementById("resource-portal-items");
      if (!status || !list) return false;

      const requestedFolderId = String(folderId || "");
      try {
        removeCachedListings();
      } catch (error) {
        setStatus(
          "Unable to securely refresh resources. Reload the page and try again.",
        );
        onError("Unable to clear stale resource listings.", error);
        return false;
      }

      if (openExternal) {
        const cachedListing = getCachedListing(requestedFolderId);
        if (cachedListing)
          renderListing(cachedListing, { openExternal: true });
      }

      const generation = ++requestGeneration;
      const loadedState = getLoadedState();
      const showInitialLoading = openExternal
        ? !loadedState.documents
        : !loadedState.listing;
      if (showInitialLoading) {
        setStatus(openExternal ? "Loading" : "Loading shared resources…", true);
      }

      try {
        const response = await network().callBackend(
          {
            type: "list_public_resources",
            folderId: requestedFolderId,
          },
          { timeoutMs: 30000, maxRetries: 0 },
        );
        if (generation !== requestGeneration) return false;
        if (
          response?.status !== "success" ||
          !Array.isArray(response.items) ||
          !Array.isArray(response.breadcrumbs)
        )
          throw new Error("The resource service returned an invalid response.");

        renderListing(response, { openExternal });
        if (openExternal) cacheListing(requestedFolderId, response);
        return true;
      } catch (error) {
        if (generation !== requestGeneration) return false;
        if (openExternal && ["FORBIDDEN", "NOT_FOUND"].includes(error?.code))
          clearDocumentsListing();
        setStatus(
          `Unable to refresh ${
            openExternal ? "Documents" : "shared resources"
          }: ${String(error?.message || error)}`,
        );
        onError("Unable to load Resource Portal contents.", error);
        return false;
      } finally {
        if (generation === requestGeneration && showInitialLoading) {
          document
            .getElementById("resource-documents-status")
            ?.removeAttribute("aria-busy");
          status.removeAttribute("aria-busy");
        }
      }
    }

    async function loadFolderPreview(folderId, frame, status, pageToken = "") {
      if (!FOLDER_ID_PATTERN.test(String(folderId || ""))) {
        if (status) {
          status.textContent =
            "This folder cannot be opened in the Student Portal.";
          status.hidden = false;
        }
        return false;
      }
      const generation = nextFolderGeneration();
      const previewGeneration = getPreviewGeneration();
      const panel = getFolderPanel(frame);
      if (!panel) return false;
      if (!pageToken) panel.replaceChildren();
      panel.hidden = false;
      frame.hidden = true;
      frame.removeAttribute("src");
      releasePreviewObjectUrl();
      if (status) {
        status.classList.add("is-loading");
        status.textContent = "Loading folder contents…";
        status.hidden = false;
      }
      try {
        const response = await network().callBackend(
          {
            type: "list_public_resources",
            folderId,
            ...(pageToken ? { pageToken } : {}),
          },
          { timeoutMs: 45000, maxRetries: 0 },
        );
        if (
          generation !== getFolderGeneration() ||
          previewGeneration !== getPreviewGeneration()
        )
          return false;
        if (
          response?.status !== "success" ||
          response.folder?.id !== folderId ||
          !Array.isArray(response.items) ||
          !Array.isArray(response.breadcrumbs) ||
          typeof response.pageToken !== "string" ||
          response.pageToken !== pageToken ||
          (response.nextPageToken !== null &&
            typeof response.nextPageToken !== "string") ||
          (Boolean(response.nextPageToken) &&
            response.nextPageToken === pageToken) ||
          !response.breadcrumbs.length ||
          response.breadcrumbs[response.breadcrumbs.length - 1]?.id !==
            folderId ||
          response.breadcrumbs.some(
            (crumb) =>
              !FOLDER_ID_PATTERN.test(String(crumb?.id || "")) ||
              typeof crumb?.name !== "string",
          ) ||
          response.items.some(
            (item) =>
              !item ||
              !FOLDER_ID_PATTERN.test(String(item.id || "")) ||
              typeof item.name !== "string" ||
              !["file", "folder"].includes(item.type) ||
              typeof item.mimeType !== "string" ||
              (item.thumbnailLink !== undefined &&
                (typeof item.thumbnailLink !== "string" ||
                  item.thumbnailLink.length > 4096)),
          )
        )
          throw new Error("The folder service returned an invalid listing.");
        const previous =
          pageToken && getFolderListing()?.folder?.id === folderId
            ? getFolderListing()
            : null;
        const listing = previous
          ? {
              ...response,
              breadcrumbs: previous.breadcrumbs,
              items: [...previous.items, ...response.items],
            }
          : response;
        setFolderListing(listing);
        renderFolderListing(listing, frame, status);
        if (status) {
          status.classList.remove("is-loading");
          status.textContent = "";
          status.hidden = true;
        }
        return true;
      } catch (error) {
        if (
          generation !== getFolderGeneration() ||
          previewGeneration !== getPreviewGeneration()
        )
          return false;
        if (status) {
          status.classList.remove("is-loading");
          status.textContent = `Unable to load folder contents: ${String(
            error?.message || error,
          )}`;
          status.hidden = false;
        }
        onError("Unable to load Student Portal folder contents.", error);
        return false;
      }
    }

    return Object.freeze({
      cacheListing,
      clearDocumentsListing,
      getCachedListing,
      isValidCachedListing,
      loadFolder,
      loadFolderPreview,
      removeCachedListings,
    });
  }

  globalScope.ResourcePortalBrowserCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
