(function (globalScope) {
  "use strict";

  const SYNC_STATUS_STORAGE_KEY = "mrh_last_applied_sync_status_timestamp";
  const SYNC_CACHE_VERSION_STORAGE_KEY =
    "mrh_last_applied_sync_cache_version";
  const DATA_CACHE_TIMESTAMP_KEY = "mrh_last_sync_complete_ms";

  function create({
    getStoredItem,
    setStoredItem,
    logger = globalScope.DebugUtils || console,
    protocol = "mrh-broadcast-v1",
    isLeader = () => false,
    hasCachedSummary = () => false,
    getPayloadSchemaVersion = () => 2,
    onCacheInvalidated = () => undefined,
    onPayloadChanged = () => undefined,
    onCurrentSyncStatus = () => undefined,
  } = {}) {
    let lastSyncAt = 0;
    let channel = null;
    let latestBackendSyncStatus = null;

    function readStoredSyncStatusTimestamp() {
      const stored = getStoredItem?.(SYNC_STATUS_STORAGE_KEY, "") || "";
      return String(stored).trim();
    }

    function readStoredSyncStatusCacheVersion() {
      const stored =
        getStoredItem?.(SYNC_CACHE_VERSION_STORAGE_KEY, "") || "";
      return String(stored).trim();
    }

    function persistSyncStatusTimestamp(timestamp, cacheVersion = "") {
      const normalizedTimestamp = String(timestamp || "").trim();
      const normalizedCacheVersion = String(cacheVersion || "").trim();
      try {
        setStoredItem?.(
          SYNC_CACHE_VERSION_STORAGE_KEY,
          normalizedCacheVersion,
        );
        setStoredItem?.(SYNC_STATUS_STORAGE_KEY, normalizedTimestamp);
      } catch (error) {
        logger.warn("Unable to persist sync status timestamp.", error);
      }
    }

    function readStoredDeckCacheTimestamp() {
      const raw = getStoredItem?.(DATA_CACHE_TIMESTAMP_KEY, "0") || "0";
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    function persistDeckCacheTimestamp(timestampMs = Date.now()) {
      const normalized = Number(timestampMs) || Date.now();
      lastSyncAt = normalized;
      try {
        setStoredItem?.(DATA_CACHE_TIMESTAMP_KEY, String(normalized));
      } catch (error) {
        logger.warn("Unable to persist deck cache timestamp.", error);
      }
    }

    function getLastSyncAt() {
      return lastSyncAt;
    }

    function isValidBroadcastMessage(data, type) {
      return (
        data &&
        typeof data === "object" &&
        !Array.isArray(data) &&
        data.protocol === protocol &&
        data.type === type
      );
    }

    function broadcastBackendSyncStatus(status = {}) {
      latestBackendSyncStatus = {
        status: "ok",
        syncTimestamp: String(status.syncTimestamp || "").trim(),
        cacheVersion: String(status.cacheVersion || "").trim(),
        payloadSchemaVersion: Number(status.payloadSchemaVersion),
      };
      if (!isLeader() || !channel) return latestBackendSyncStatus;
      try {
        channel.postMessage({
          protocol,
          type: "backend_sync_status",
          ...latestBackendSyncStatus,
        });
      } catch (error) {
        logger.warn(
          "[SYNC] Unable to broadcast the successful backend sync status.",
          error,
        );
      }
      return latestBackendSyncStatus;
    }

    function handleBackendSyncStatusBroadcast(data) {
      if (
        isLeader() ||
        data.status !== "ok" ||
        Number(data.payloadSchemaVersion) !==
          Number(getPayloadSchemaVersion())
      )
        return;

      const timestamp = String(data.syncTimestamp || "").trim();
      const cacheVersion = String(data.cacheVersion || "").trim();
      if (
        hasCachedSummary() &&
        timestamp &&
        timestamp === readStoredSyncStatusTimestamp() &&
        cacheVersion &&
        cacheVersion === readStoredSyncStatusCacheVersion()
      ) {
        onCurrentSyncStatus(data);
        return;
      }
      onPayloadChanged();
    }

    function setupBroadcastListener() {
      if (typeof globalScope.BroadcastChannel !== "function") return false;
      try {
        channel = new globalScope.BroadcastChannel("mrh_cache_invalidation");
        channel.onmessage = (event) => {
          const data = event?.data;
          if (isValidBroadcastMessage(data, "cache_invalidated")) {
            logger.info?.("[CACHE] Invalidation signal received");
            onCacheInvalidated();
          } else if (
            isValidBroadcastMessage(data, "backend_payload_changed")
          ) {
            onPayloadChanged();
          } else if (
            isValidBroadcastMessage(data, "backend_sync_status")
          ) {
            handleBackendSyncStatusBroadcast(data);
          } else if (
            isLeader() &&
            latestBackendSyncStatus &&
            isValidBroadcastMessage(data, "backend_sync_status_request")
          ) {
            broadcastBackendSyncStatus(latestBackendSyncStatus);
          }
        };
        if (!isLeader()) {
          channel.postMessage({
            protocol,
            type: "backend_sync_status_request",
          });
        }
        return true;
      } catch (error) {
        logger.error("[CACHE] Failed to setup invalidation listener:", error);
        if (channel) {
          channel.close();
          channel = null;
        }
        return false;
      }
    }

    function cleanup() {
      if (!channel) return;
      channel.close();
      channel = null;
    }

    return Object.freeze({
      broadcastBackendSyncStatus,
      cleanup,
      getLastSyncAt,
      persistDeckCacheTimestamp,
      persistSyncStatusTimestamp,
      readStoredDeckCacheTimestamp,
      readStoredSyncStatusCacheVersion,
      readStoredSyncStatusTimestamp,
      setupBroadcastListener,
    });
  }

  globalScope.SyncCacheManagerCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
