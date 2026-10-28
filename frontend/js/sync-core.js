(function (globalScope) {
  "use strict";

  /**
   * @typedef {Object} SyncCoreOptions
   * @property {Object} state
   * @property {Object} lifecycle
   * @property {Object} appConfig
   * @property {Object} network
   * @property {Object} logger
   * @property {() => boolean} isLeader
   * @property {() => boolean} hasActiveSession
   * @property {() => boolean} isImmediateUpdateMode
   * @property {(value: boolean) => void} setSyncConnected
   * @property {() => boolean} [markInitialSyncCompleteFromCache]
   * @property {() => void} [onSyncFailure]
   * @property {(value: boolean) => void} setColdStart
   * @property {(summary: unknown) => unknown} normalizeSummaryData
   * @property {() => string} readStoredSyncStatusTimestamp
   * @property {() => string} [readStoredSyncStatusCacheVersion]
   * @property {(timestamp: string, cacheVersion?: string) => void} persistSyncStatusTimestamp
   * @property {(summary: Array, knownChanged?: boolean) => boolean} applySummaryData
   * @property {(summary: Array) => void} setAccessMetadata
   * @property {() => void} sanitizeDeletedDeckReferences
   * @property {(message: string, tone?: string, showOverlay?: boolean) => void} updateSyncStatus
   * @property {(showOverlay?: boolean, ...args: any[]) => void} setGlobalLoadingState
   * @property {() => void} hideConnectionStatusAfterDelay
   * @property {() => void} renderCategoryProgress
   * @property {() => void} showColdStartNotification
   * @property {() => string} getSummarySignature
   */

  /** @typedef {Object} SyncCoreController */
  /** @property {(isRetry?: boolean, isBackgroundCheck?: boolean) => Promise<boolean>} SyncCoreController.syncDatabase */
  /** @property {() => Promise<void>} SyncCoreController.optimizedBackgroundSync */
  /** @property {(snapshot: Object) => Promise<boolean>} SyncCoreController.syncPrefetchedSnapshot */
  /** @typedef {boolean} SyncCoreResult */

  /**
   * Create the cross-tab leader coordinator used by background synchronization.
   * The coordinator owns the channel and heartbeat lifecycle; the app facade
   * only observes leadership changes so it can keep its public API stable.
   *
   * @param {Object} options
   * @returns {{isLeader: () => boolean, start: () => void, cleanup: () => void}}
   */
  function createLeaderCoordinator(options = {}) {
    const lifecycle = options.lifecycle || globalScope;
    const logger = options.logger || console;
    const protocol = options.protocol || "mrh-broadcast-v1";
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10 * 1000;
    const startupElectionDelayMs = options.startupElectionDelayMs ?? 150;
    const peerTtlMs = options.peerTtlMs ?? 25000;
    let channel = null;
    let heartbeatTimer = null;
    let startupElectionTimer = null;
    let leader = false;
    let started = false;
    const peers = new Map();
    const tabId =
      options.tabId ||
      `tab_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const notify = (nextLeader, wasLeader) => {
      if (wasLeader === nextLeader) return;
      leader = nextLeader;
      logger.info?.(`[LEADER] ${leader ? "Became" : "Yielded"} leadership`);
      options.onLeaderChange?.(leader);
    };

    const electLeader = () => {
      const now = Date.now();
      for (const [peerId, seenAt] of peers) {
        if (now - seenAt > peerTtlMs) peers.delete(peerId);
      }
      const candidates = [tabId, ...peers.keys()].sort();
      notify((candidates[0] || tabId) === tabId, leader);
    };

    const clearStartupElectionTimer = () => {
      if (startupElectionTimer === null) return;
      lifecycle.clearTimeout(startupElectionTimer);
      startupElectionTimer = null;
    };

    const sendHeartbeat = (electImmediately = true) => {
      try {
        channel?.postMessage({
          protocol,
          type: "leader_heartbeat",
          tabId,
          timestamp: Date.now(),
        });
      } catch (error) {
        logger.warn?.("[LEADER] Heartbeat failed:", error);
      }
      if (electImmediately) electLeader();
    };

    function start() {
      if (started) return;
      started = true;

      if (typeof BroadcastChannel === "undefined") {
        leader = true;
        options.onLeaderChange?.(true);
        logger.info?.(
          "[LEADER] BroadcastChannel unavailable; this tab is the leader",
        );
        return;
      }

      try {
        channel = new BroadcastChannel("mrh_leader_election");
        channel.onmessage = (event) => {
          const data = event?.data;
          if (
            !data ||
            typeof data !== "object" ||
            data.protocol !== protocol ||
            data.type !== "leader_heartbeat"
          ) {
            return;
          }

          const peerId = String(data.tabId || "");
          const timestamp = Number(data.timestamp);
          const isNewPeer = !peers.has(peerId);
          if (
            peerId === tabId ||
            !/^[a-z0-9_-]{8,128}$/i.test(peerId) ||
            !Number.isFinite(timestamp) ||
            Math.abs(Date.now() - timestamp) > peerTtlMs * 2
          ) {
            return;
          }

          peers.set(peerId, Date.now());
          clearStartupElectionTimer();
          electLeader();
          if (isNewPeer) {
            try {
              channel?.postMessage({
                protocol,
                type: "leader_heartbeat",
                tabId,
                timestamp: Date.now(),
              });
            } catch (error) {
              logger.warn?.("[LEADER] Peer announcement failed:", error);
            }
          }
        };
        heartbeatTimer = lifecycle.setInterval(
          sendHeartbeat,
          heartbeatIntervalMs,
        );
        startupElectionTimer = lifecycle.setTimeout(() => {
          startupElectionTimer = null;
          electLeader();
        }, startupElectionDelayMs);
        sendHeartbeat(false);
      } catch (error) {
        logger.error?.("[LEADER] Failed to setup leader election:", error);
        leader = true;
        options.onLeaderChange?.(true);
      }
    }

    function cleanup() {
      started = false;
      lifecycle.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      clearStartupElectionTimer();
      peers.clear();
      if (channel) {
        channel.close();
        channel = null;
      }
    }

    return { isLeader: () => leader, start, cleanup };
  }

  function createRetryScheduler({
    lifecycle,
    options,
    retryIntervalMs,
    retryMaxDelayMs,
    isDisposed,
    isPageHidden,
    isCached,
    isConnected,
    setConnected,
    cancelPoll,
    syncDatabase,
  }) {
    let retryTimer = null;
    let countdownTimer = null;
    let retryAttempt = 0;

    const backoffDelay = (retryCount) => {
      const baseDelay = Math.pow(2, Math.min(retryCount, 5)) * 1000;
      return baseDelay + Math.random() * baseDelay * 0.5;
    };

    function clearRetryTimers() {
      lifecycle.clearTimeout(retryTimer);
      retryTimer = null;
      lifecycle.clearInterval(countdownTimer);
      countdownTimer = null;
    }

    function clearScheduledRetry(resetAttempt = true) {
      clearRetryTimers();
      if (resetAttempt) retryAttempt = 0;
    }

    function scheduleRetry(showOverlay = true) {
      if (isDisposed() || !options.isLeader()) return;
      cancelPoll();
      if (isPageHidden()) clearRetryTimers();
      if (retryTimer !== null) return;
      retryAttempt += 1;
      const wasConnected = isConnected();
      const effectiveShowOverlay = showOverlay && !options.hasActiveSession();
      setConnected(false);
      options.onSyncFailure?.();
      if (wasConnected) options.renderCategoryProgress();
      if (isPageHidden()) return;
      const retryJitterMs =
        Math.random() * Math.min(1000, retryIntervalMs * 0.5);
      const delay = Math.min(
        retryMaxDelayMs,
        Math.max(retryIntervalMs, backoffDelay(retryAttempt - 1)) +
          retryJitterMs,
      );
      const retryAt = Date.now() + delay;
      const renderCountdown = () => {
        const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
        options.updateSyncStatus(
          `<i class="fa-solid fa-xmark mr-1"></i> Database unavailable. Trying to reconnect (attempt ${retryAttempt}) in ${seconds}s...`,
          "warning",
          effectiveShowOverlay,
        );
        if (seconds === 0) lifecycle.clearInterval(countdownTimer);
      };
      renderCountdown();
      countdownTimer = lifecycle.setInterval(renderCountdown, 1000);
      retryTimer = lifecycle.setTimeout(() => {
        retryTimer = null;
        lifecycle.clearInterval(countdownTimer);
        countdownTimer = null;
        if (!options.isLeader() || isPageHidden()) return;
        syncDatabase(true, !effectiveShowOverlay);
      }, delay);
    }

    function schedulePendingSyncRetry(retryAfterMs = 5000) {
      if (isDisposed() || !options.isLeader()) return;
      cancelPoll();
      if (isPageHidden()) {
        clearRetryTimers();
        return;
      }
      if (retryTimer !== null) return;
      retryAttempt += 1;
      const minimumDelay = Math.min(
        retryMaxDelayMs,
        Math.max(1000, Number(retryAfterMs) || 5000),
      );
      const delay = Math.min(
        retryMaxDelayMs,
        Math.max(minimumDelay, backoffDelay(retryAttempt - 1)),
      );
      const hasCachedData = isCached();
      options.updateSyncStatus(
        hasCachedData
          ? '<i class="fa-solid fa-rotate mr-1"></i> Database update in progress. Using saved content and checking again automatically.'
          : '<i class="fa-solid fa-rotate mr-1"></i> Database update in progress. Initial sync will resume automatically.',
        "info",
        !hasCachedData && !options.hasActiveSession(),
      );
      retryTimer = lifecycle.setTimeout(() => {
        retryTimer = null;
        if (!options.isLeader() || isPageHidden()) return;
        syncDatabase(true, hasCachedData);
      }, delay);
    }

    return {
      scheduleRetry,
      schedulePendingSyncRetry,
      clearScheduledRetry,
      clearRetryTimers,
      resetRetryAttempt() {
        retryAttempt = 0;
      },
    };
  }

  function createSyncSnapshotHelpers({
    options,
    payloadSchemaVersion,
    requestTimeoutMs,
    isCached,
    hasPendingSummary,
  }) {
    async function checkSyncStatusLightweight(requestOptions = {}) {
      try {
        if (typeof options.network?.getSyncStatus !== "function")
          throw new Error("AppNetwork sync status API is unavailable.");
        return await options.network.getSyncStatus({
          ...requestOptions,
          timeoutMs: requestTimeoutMs,
          maxRetries: 0,
        });
      } catch (error) {
        options.logger.warn("[SYNC] Lightweight status check failed:", error);
        return null;
      }
    }

    async function getSyncSnapshot(requestOptions = {}) {
      if (typeof options.network?.getDeckSyncSnapshot === "function")
        return options.network.getDeckSyncSnapshot(requestOptions);

      const storedTimestamp = String(
        options.readStoredSyncStatusTimestamp() || "",
      ).trim();
      const storedCacheVersion = String(
        options.readStoredSyncStatusCacheVersion?.() || "",
      ).trim();
      let status = null;
      if (
        isCached() &&
        storedTimestamp &&
        storedCacheVersion &&
        typeof options.network?.getSyncStatus === "function"
      ) {
        status = await options.network.getSyncStatus({
          ...requestOptions,
          maxRetries: 0,
        });
        const statusSchemaVersion = Number(status?.payloadSchemaVersion);
        if (
          status?.status !== "ok" ||
          status.isColdStart === true ||
          (Number.isFinite(statusSchemaVersion) &&
            statusSchemaVersion !== payloadSchemaVersion)
        )
          return status;
        if (
          statusSchemaVersion === payloadSchemaVersion &&
          String(status.syncTimestamp || "").trim() === storedTimestamp &&
          String(status.cacheVersion || "").trim() === storedCacheVersion
        )
          return { ...status, notModified: true };
      }
      return status || checkSyncStatusLightweight(requestOptions);
    }

    function normalizeSummary(summary) {
      const normalized = options.normalizeSummaryData(summary);
      if (!Array.isArray(normalized)) return normalized;
      for (const [index, deck] of normalized.entries()) {
        if (
          !deck ||
          typeof deck !== "object" ||
          !String(deck.Subject || "").trim() ||
          !Number.isFinite(Number(deck.QuestionCount)) ||
          Number(deck.QuestionCount) < 0 ||
          !/^[a-f0-9]{64}$/i.test(String(deck.PayloadVersion || ""))
        ) {
          throw new Error(
            `Backend summary entry ${index} is malformed or incompatible with payload schema ${payloadSchemaVersion}.`,
          );
        }
      }
      return normalized;
    }

    function getDecision(summary, wasConnected, hasPending = hasPendingSummary()) {
      const changed =
        options.getSummarySignature(options.state.categorySummary || []) !==
        options.getSummarySignature(summary);
      const canApply =
        options.isImmediateUpdateMode() || !options.hasActiveSession();
      return {
        changed,
        canApply,
        shouldApply:
          canApply && (changed || !wasConnected || Boolean(hasPending)),
        shouldQueue: !canApply && changed,
      };
    }

    return {
      checkSyncStatusLightweight,
      getSyncSnapshot,
      normalizeSummary,
      getDecision,
    };
  }

  function createPendingSyncState({
    options,
    payloadSchemaVersion,
    notifySyncSuccess,
  }) {
    let pendingSummaryData = null;
    let pendingSyncTimestamp = "";
    let pendingSyncCacheVersion = "";

    function confirmPendingSummaryApplied() {
      if (!pendingSummaryData) return false;
      pendingSummaryData = null;
      if (pendingSyncTimestamp) {
        options.persistSyncStatusTimestamp(
          pendingSyncTimestamp,
          pendingSyncCacheVersion,
        );
        notifySyncSuccess({
          syncTimestamp: pendingSyncTimestamp,
          cacheVersion: pendingSyncCacheVersion,
          payloadSchemaVersion,
        });
        pendingSyncTimestamp = "";
        pendingSyncCacheVersion = "";
      }
      return true;
    }

    return {
      getPendingSummaryData: () => pendingSummaryData,
      setPendingSummaryData(value) {
        pendingSummaryData = value;
      },
      getPendingSyncTimestamp: () => pendingSyncTimestamp,
      getPendingSyncCacheVersion: () => pendingSyncCacheVersion,
      setPendingSyncStatus(timestamp, cacheVersion) {
        pendingSyncTimestamp = timestamp;
        pendingSyncCacheVersion = cacheVersion;
      },
      checkpointAppliedSyncStatus(timestamp, cacheVersion) {
        if (pendingSummaryData) {
          pendingSyncTimestamp = timestamp;
          pendingSyncCacheVersion = cacheVersion;
        } else {
          options.persistSyncStatusTimestamp(timestamp, cacheVersion);
        }
      },
      confirmPendingSummaryApplied,
    };
  }

  function createSummaryApplicationHelper(dependencies) {
    const {
      options,
      payloadSchemaVersion,
      isDisposed,
      isConnected,
      setConnected,
      setIsColdStart,
      getDecision,
      resetRetryAttempt,
      notifySyncSuccess,
      setPendingSummaryData,
      schedulePoll,
    } = dependencies;
    let initialSuccessShown = false;

    async function applySummary(
      summaryData,
      syncSnapshot,
      expectedSyncTimestamp,
      silent,
      requestSignal,
      scheduleFollowUpPoll,
    ) {
      const wasConnected = isConnected();
      resetRetryAttempt();
      setConnected(true);
      setIsColdStart(false);
      options.sanitizeDeletedDeckReferences();
      const decision = getDecision(summaryData, wasConnected);
      const localDecksPurged =
        (await options.purgeUnavailableDeckCache?.(summaryData)) === true;
      if (isDisposed() || requestSignal.aborted) return false;
      if (localDecksPurged) {
        decision.changed = true;
        decision.canApply =
          options.isImmediateUpdateMode() || !options.hasActiveSession();
        decision.shouldApply = decision.canApply;
        decision.shouldQueue = !decision.canApply;
      }
      if (decision.shouldApply) {
        setPendingSummaryData(null);
        options.setPendingSummaryData?.(null);
        options.applySummaryData(summaryData, decision.changed);
        options.setAccessMetadata(summaryData);
      } else if (!decision.canApply) {
        if (decision.shouldQueue) {
          setPendingSummaryData(summaryData);
          options.setPendingSummaryData?.(summaryData);
        }
        if (!wasConnected) options.renderCategoryProgress();
      }
      if (
        typeof options.persistSummaryData === "function" &&
        (await options.persistSummaryData()) === false
      ) {
        throw new Error("Unable to persist the synchronized summary.");
      }
      options.updateSyncStatus(
        `<i class="fa-solid fa-check mr-1"></i> Connected. ${decision.changed && !decision.canApply ? "Update waiting until your session ends." : `Checked ${summaryData.length} subjects.`}`,
        "success",
        !silent && !initialSuccessShown,
      );
      notifySyncSuccess({
        syncTimestamp: syncSnapshot?.syncTimestamp || expectedSyncTimestamp,
        cacheVersion: syncSnapshot?.cacheVersion || "",
        payloadSchemaVersion:
          syncSnapshot?.payloadSchemaVersion ?? payloadSchemaVersion,
      });
      options.setGlobalLoadingState(false);
      if (!silent && !initialSuccessShown) {
        initialSuccessShown = true;
        options.hideConnectionStatusAfterDelay();
      }
      if (scheduleFollowUpPoll) schedulePoll();
      return true;
    }

    return { applySummary };
  }

  function createSyncDatabaseRunner(dependencies) {
    const {
      options,
      lifecycle,
      requestTimeoutMs,
      payloadSchemaVersion,
      isDisposed,
      isCached,
      setConnected,
      setIsColdStart,
      getSyncSnapshot,
      normalizeSummary,
      scheduleRetry,
      schedulePendingSyncRetry,
      clearRetryTimers,
      cancelPoll,
      clearScheduledRetry,
      resetRetryAttempt,
      schedulePoll,
      notifySyncSuccess,
      applySummary,
    } = dependencies;
    let abortController = null;
    let inFlightPromise = null;
    let attempt = 0;

    async function requestSyncSnapshot({
      prefetchedSnapshot,
      requestController,
      bypassIdleGate,
    }) {
      let syncSnapshot = prefetchedSnapshot;
      if (
        !syncSnapshot &&
        (typeof options.network?.getDeckSyncSnapshot === "function" ||
          typeof options.network?.getSyncStatus === "function")
      ) {
        syncSnapshot = await getSyncSnapshot({
          since: isCached() ? options.readStoredSyncStatusTimestamp() : "",
          sinceCacheVersion: isCached()
            ? options.readStoredSyncStatusCacheVersion?.() || ""
            : "",
          timeoutMs: requestTimeoutMs,
          signal: requestController.signal,
          ...(bypassIdleGate ? { bypassIdleGate: true } : {}),
        });
      }
      return syncSnapshot;
    }

    function processSnapshotControlResponse({
      syncSnapshot,
      timeoutId,
      isBackgroundCheck,
      scheduleFollowUpPoll,
    }) {
      if (!syncSnapshot) return null;
      if (syncSnapshot.status !== "ok") {
        throw new Error(
          syncSnapshot.message || "Backend sync snapshot is invalid.",
        );
      }
      if (syncSnapshot.syncPending === true) {
        lifecycle.clearTimeout(timeoutId);
        schedulePendingSyncRetry(syncSnapshot.retryAfterMs);
        return false;
      }
      if (syncSnapshot.isColdStart === true) {
        lifecycle.clearTimeout(timeoutId);
        setIsColdStart(true);
        if (!isCached()) options.showColdStartNotification();
        scheduleRetry(!isBackgroundCheck && !isCached());
        return false;
      }
      if (Number(syncSnapshot.payloadSchemaVersion) !== payloadSchemaVersion) {
        throw new Error("Backend data format is incompatible with this app.");
      }
      if (syncSnapshot.notModified !== true) return null;

      const storedTimestamp = String(
        options.readStoredSyncStatusTimestamp() || "",
      ).trim();
      const storedCacheVersion = String(
        options.readStoredSyncStatusCacheVersion?.() || "",
      ).trim();
      const responseTimestamp = String(syncSnapshot.syncTimestamp || "").trim();
      const responseCacheVersion = String(syncSnapshot.cacheVersion || "").trim();
      if (
        !storedTimestamp ||
        responseTimestamp !== storedTimestamp ||
        (syncSnapshot.legacySnapshot !== true &&
          (!storedCacheVersion || responseCacheVersion !== storedCacheVersion)) ||
        (syncSnapshot.legacySnapshot === true &&
          responseCacheVersion &&
          responseCacheVersion !== storedCacheVersion)
      ) {
        throw new Error(
          "Backend returned an unchanged snapshot for a different sync token.",
        );
      }
      lifecycle.clearTimeout(timeoutId);
      attempt = 0;
      resetRetryAttempt();
      setConnected(true);
      setIsColdStart(false);
      options.updateSyncStatus(
        '<i class="fa-solid fa-check mr-1"></i> Connected. Database is up to date.',
        "success",
        false,
      );
      options.setGlobalLoadingState(false);
      notifySyncSuccess(syncSnapshot);
      if (scheduleFollowUpPoll) schedulePoll();
      return true;
    }

    async function getSummaryData({
      syncSnapshot,
      requestController,
      bypassIdleGate,
    }) {
      return normalizeSummary(
        syncSnapshot?.summary !== undefined && syncSnapshot?.summary !== null
          ? syncSnapshot.summary
          : await options.network.getDeckSummary({
              timeoutMs: requestTimeoutMs,
              signal: requestController.signal,
              maxRetries: 0,
              ...(bypassIdleGate ? { bypassIdleGate: true } : {}),
            }),
      );
    }

    async function confirmSummaryTimestamp({
      syncSnapshot,
      expectedSyncTimestamp,
      isBackgroundCheck,
      requestController,
      timeoutId,
      bypassIdleGate,
    }) {
      if (
        !expectedSyncTimestamp ||
        (Array.isArray(syncSnapshot?.summary) &&
          (syncSnapshot.legacySnapshot !== true ||
            syncSnapshot.consistencyVerified === true)) ||
        typeof options.network?.getSyncStatus !== "function"
      ) {
        return true;
      }
      const latestStatus = await options.network.getSyncStatus({
        timeoutMs: requestTimeoutMs,
        signal: requestController.signal,
        maxRetries: 0,
        ...(bypassIdleGate ? { bypassIdleGate: true } : {}),
      });
      if (isDisposed() || requestController.signal.aborted) return false;
      const latestTimestamp = String(latestStatus?.syncTimestamp || "").trim();
      if (
        latestStatus?.status === "ok" &&
        latestTimestamp === expectedSyncTimestamp
      ) {
        return true;
      }
      lifecycle.clearTimeout(timeoutId);
      options.logger.warn(
        "[SYNC] Discarding a summary fetched across a backend update.",
        { expectedSyncTimestamp, latestTimestamp },
      );
      scheduleRetry(!isBackgroundCheck && !options.hasActiveSession());
      return false;
    }

    async function syncDatabase(
      isRetry = false,
      isBackgroundCheck = false,
      expectedSyncTimestamp = "",
      prefetchedSnapshot = null,
      bypassIdleGate = false,
      scheduleFollowUpPoll = true,
      externalSignal = null,
    ) {
      if (isDisposed()) return false;
      if (inFlightPromise) return inFlightPromise;
      inFlightPromise = (async () => {
        clearRetryTimers();
        cancelPoll();
        abortController?.abort();
        const silent = isBackgroundCheck || options.hasActiveSession();
        if (!isRetry) attempt = 0;
        attempt += 1;
        abortController = new AbortController();
        const requestController = abortController;
        const abortFromExternal = () => requestController.abort();
        if (externalSignal) {
          if (externalSignal.aborted) requestController.abort();
          else
            externalSignal.addEventListener("abort", abortFromExternal, {
              once: true,
            });
        }
        let timedOut = false;
        const timeoutId = lifecycle.setTimeout(() => {
          timedOut = true;
          requestController.abort();
        }, requestTimeoutMs);
        if (!(isBackgroundCheck && isCached()))
          options.updateSyncStatus(
            `<i class="fa-solid fa-spinner fa-spin mr-1"></i> ${isRetry ? "Checking for database updates" : "Connecting to database"}...`,
            "info",
            !isBackgroundCheck,
          );
        try {
          const syncSnapshot = await requestSyncSnapshot({
            prefetchedSnapshot,
            requestController,
            bypassIdleGate,
          });
          if (isDisposed() || requestController.signal.aborted) return false;
          const snapshotResult = processSnapshotControlResponse({
            syncSnapshot,
            timeoutId,
            isBackgroundCheck,
            scheduleFollowUpPoll,
          });
          if (snapshotResult !== null) return snapshotResult;
          if (syncSnapshot) {
            expectedSyncTimestamp = String(
              syncSnapshot.syncTimestamp || expectedSyncTimestamp,
            ).trim();
          }

          const summaryData = await getSummaryData({
            syncSnapshot,
            requestController,
            bypassIdleGate,
          });
          if (isDisposed() || requestController.signal.aborted) return false;
          if (
            summaryData &&
            !Array.isArray(summaryData) &&
            summaryData.isColdStart === true
          ) {
            lifecycle.clearTimeout(timeoutId);
            setIsColdStart(true);
            if (!isCached()) options.showColdStartNotification();
            scheduleRetry(!isBackgroundCheck && !isCached());
            return false;
          }
          if (Array.isArray(summaryData)) {
            const isSummaryCurrent = await confirmSummaryTimestamp({
              syncSnapshot,
              expectedSyncTimestamp,
              isBackgroundCheck,
              requestController,
              timeoutId,
              bypassIdleGate,
            });
            if (!isSummaryCurrent) return false;
            lifecycle.clearTimeout(timeoutId);
            attempt = 0;
            return await applySummary(
              summaryData,
              syncSnapshot,
              expectedSyncTimestamp,
              silent,
              requestController.signal,
              scheduleFollowUpPoll,
            );
          }
          lifecycle.clearTimeout(timeoutId);
          if (isBackgroundCheck && isCached()) {
            options.updateSyncStatus(
              '<i class="fa-solid fa-exclamation-triangle mr-1"></i> Using locally cached deck list. Background sync temporarily unavailable.',
              "warning",
              false,
            );
            scheduleRetry(!silent);
            return false;
          }
          scheduleRetry(!silent);
          return false;
        } catch (error) {
          lifecycle.clearTimeout(timeoutId);
          if (requestController !== abortController) return false;
          if (error?.name === "AbortError" || error?.name === "TimeoutError") {
            if (externalSignal?.aborted) return false;
            if (timedOut || error?.name === "TimeoutError")
              options.logger.warn(
                `[SYNC] Database response exceeded ${requestTimeoutMs / 1000}s; retrying automatically.`,
              );
            scheduleRetry(!silent);
            return false;
          }
          options.logger.error("[SYNC] Error:", error);
          if (isBackgroundCheck && isCached()) {
            options.updateSyncStatus(
              '<i class="fa-solid fa-exclamation-triangle mr-1"></i> Database unavailable. Using cached deck list.',
              "warning",
              false,
            );
            scheduleRetry(!silent);
            return false;
          }
          scheduleRetry(!silent);
          options.setGlobalLoadingState(
            !silent,
            "Database reconnecting",
            "The app is retrying the connection automatically. This may take a moment.",
            "warning",
          );
          options.renderCategoryProgress();
          return false;
        } finally {
          lifecycle.clearTimeout(timeoutId);
          if (externalSignal)
            externalSignal.removeEventListener("abort", abortFromExternal);
          if (requestController === abortController) abortController = null;
          inFlightPromise = null;
        }
      })();
      return inFlightPromise;
    }

    return {
      syncDatabase,
      getInFlightPromise: () => inFlightPromise,
      abort: () => abortController?.abort(),
    };
  }

  function createBackgroundSyncRunner(dependencies) {
    const {
      options,
      lifecycle,
      requestTimeoutMs,
      payloadSchemaVersion,
      isDisposed,
      isLeader,
      isCached,
      setConnected,
      setIsColdStart,
      getSyncSnapshot,
      scheduleRetry,
      schedulePendingSyncRetry,
      clearScheduledRetry,
      schedulePoll,
      syncDatabase,
      getInFlightSyncPromise,
      notifySyncSuccess,
      getPendingSyncTimestamp,
      getPendingSyncCacheVersion,
      setPendingSyncStatus,
      checkpointAppliedSyncStatus,
    } = dependencies;
    let backgroundAbortController = null;
    let backgroundPromise = null;

    function processBackgroundStatus(status) {
      if (!status || typeof status !== "object" || status.status !== "ok") {
        if (isCached()) {
          setConnected(false);
          options.updateSyncStatus(
            '<i class="fa-solid fa-exclamation-triangle mr-1"></i> Database unavailable. Using cached deck list.',
            "warning",
            false,
          );
          scheduleRetry(false);
          return;
        }
        scheduleRetry(false);
        return;
      }
      if (status.syncPending === true) {
        schedulePendingSyncRetry(status.retryAfterMs);
        return false;
      }
      if (status.isColdStart === true) {
        setIsColdStart(true);
        if (!isCached()) options.showColdStartNotification();
        scheduleRetry(!isCached());
        return;
      }
      if (Number(status.payloadSchemaVersion) !== payloadSchemaVersion) {
        options.logger.warn(
          "[SYNC] Backend payload schema is incompatible with this app.",
          {
            expected: payloadSchemaVersion,
            received: status.payloadSchemaVersion ?? null,
          },
        );
        setConnected(false);
        options.updateSyncStatus(
          '<i class="fa-solid fa-triangle-exclamation mr-1"></i> Backend data format update required. Continuing with the last compatible cached data.',
          "warning",
          false,
        );
        scheduleRetry(false);
        return;
      }
      clearScheduledRetry();
      return null;
    }

    async function completeFromAppliedSnapshot({
      status,
      requestController,
      scheduleFollowUpPoll,
      message,
    }) {
      setConnected(true);
      setIsColdStart(false);
      await options.refreshPendingPayloads?.();
      if (isDisposed() || requestController.signal.aborted) return false;
      options.updateSyncStatus(message, "success", false);
      notifySyncSuccess(status);
      if (scheduleFollowUpPoll) schedulePoll();
      return true;
    }

    async function completeFromUnchangedSnapshot({
      status,
      storedTimestamp,
      timestamp,
      cacheVersion,
      storedCacheVersion,
      requestController,
      scheduleFollowUpPoll,
    }) {
      const timestampMs = Date.parse(timestamp);
      const storedTimestampMs = Date.parse(storedTimestamp);
      if (
        storedTimestamp &&
        timestamp &&
        Number.isFinite(timestampMs) &&
        Number.isFinite(storedTimestampMs) &&
        timestampMs < storedTimestampMs &&
        (!cacheVersion || cacheVersion === storedCacheVersion)
      ) {
        options.logger.warn(
          "[SYNC] Ignoring an older backend sync timestamp.",
          { timestamp, storedTimestamp },
        );
        return completeFromAppliedSnapshot({
          status,
          requestController,
          scheduleFollowUpPoll,
          message:
            '<i class="fa-solid fa-check mr-1"></i> Connected. Using the latest applied database data.',
        });
      }
      if (
        storedTimestamp &&
        storedTimestamp === timestamp &&
        (!cacheVersion || storedCacheVersion === cacheVersion)
      ) {
        return completeFromAppliedSnapshot({
          status,
          requestController,
          scheduleFollowUpPoll,
          message:
            '<i class="fa-solid fa-check mr-1"></i> Connected. Database is up to date.',
        });
      }
      return null;
    }

    async function applyBackgroundSnapshot({
      status,
      timestamp,
      cacheVersion,
      bypassIdleGate,
      scheduleFollowUpPoll,
      requestController,
      requestTimedOut,
    }) {
      if (
        timestamp &&
        getPendingSyncTimestamp() === timestamp &&
        getPendingSyncCacheVersion() === cacheVersion
      ) {
        if (options.hasActiveSession()) {
          setConnected(true);
          setIsColdStart(false);
          options.updateSyncStatus(
            '<i class="fa-solid fa-check mr-1"></i> Connected. An update is waiting until your session ends.',
            "success",
            false,
          );
          notifySyncSuccess(status);
          if (scheduleFollowUpPoll) schedulePoll();
          return true;
        }
        setPendingSyncStatus("", getPendingSyncCacheVersion());
      }
      const synchronized = await syncDatabase(
        true,
        true,
        timestamp,
        status,
        bypassIdleGate,
        scheduleFollowUpPoll,
        requestController.signal,
      );
      if (requestTimedOut) scheduleRetry(false);
      if (timestamp && synchronized)
        checkpointAppliedSyncStatus(timestamp, cacheVersion);
      return synchronized;
    }

    async function optimizedBackgroundSync({
      bypassIdleGate = false,
      scheduleFollowUpPoll = true,
    } = {}) {
      if (isDisposed()) return false;
      if (backgroundPromise) return backgroundPromise;
      if (getInFlightSyncPromise()) return getInFlightSyncPromise();
      const requestController = new AbortController();
      backgroundAbortController = requestController;
      let requestTimedOut = false;
      const timeoutId = bypassIdleGate
        ? lifecycle.setTimeout(
            () => {
              requestTimedOut = true;
              requestController.abort();
            },
            requestTimeoutMs,
          )
        : null;
      const requestOptions = {
        timeoutMs: requestTimeoutMs,
        signal: requestController.signal,
        ...(bypassIdleGate ? { bypassIdleGate: true } : {}),
      };
      const promise = (async () => {
        if (isDisposed() || !isLeader()) return false;
        try {
          const storedTimestamp = options.readStoredSyncStatusTimestamp();
          const storedCacheVersion =
            options.readStoredSyncStatusCacheVersion?.() || "";
          const status = await getSyncSnapshot({
            since: isCached() ? storedTimestamp : "",
            sinceCacheVersion: isCached() ? storedCacheVersion : "",
            ...requestOptions,
          });
          if (isDisposed() || requestController.signal.aborted) return false;
          const statusResult = processBackgroundStatus(status);
          if (statusResult !== null) return statusResult;
          const timestamp = String(status.syncTimestamp || "").trim();
          const cacheVersion = String(status.cacheVersion || "").trim();
          const unchangedResult = await completeFromUnchangedSnapshot({
            status,
            storedTimestamp,
            timestamp,
            cacheVersion,
            storedCacheVersion,
            requestController,
            scheduleFollowUpPoll,
          });
          if (unchangedResult !== null) return unchangedResult;
          const synchronized = await applyBackgroundSnapshot({
            status,
            timestamp,
            cacheVersion,
            bypassIdleGate,
            scheduleFollowUpPoll,
            requestController,
            requestTimedOut,
          });
          return synchronized;
        } catch (error) {
          if (isDisposed()) return;
          if (requestController.signal.aborted) {
            if (requestTimedOut) scheduleRetry(false);
            return false;
          }
          options.logger.error(
            "[SYNC] Simplified background sync error:",
            error,
          );
          if (isCached()) {
            setConnected(false);
            options.updateSyncStatus(
              '<i class="fa-solid fa-exclamation-triangle mr-1"></i> Database unavailable. Using cached deck list.',
              "warning",
              false,
            );
            scheduleRetry(false);
            return;
          }
          setConnected(false);
          options.updateSyncStatus(
            '<i class="fa-solid fa-exclamation-triangle mr-1"></i> Database unavailable. Retrying the backend sync automatically.',
            "warning",
            false,
          );
          scheduleRetry(false);
        } finally {
          lifecycle.clearTimeout(timeoutId);
          if (backgroundAbortController === requestController)
            backgroundAbortController = null;
          if (backgroundPromise === promise) backgroundPromise = null;
        }
      })();
      backgroundPromise = promise;
      return promise;
    }

    return {
      optimizedBackgroundSync,
      getPromise: () => backgroundPromise,
      abort: () => backgroundAbortController?.abort(),
    };
  }

  function createSyncRequestCoordinator(dependencies) {
    const {
      options,
      lifecycle,
      syncIntervalMs,
      payloadSchemaVersion,
      isDisposed,
      isLeader,
      isPageHidden,
      isCached,
      setConnected,
      setIsColdStart,
      notifySyncSuccess,
      schedulePendingSyncRetry,
      scheduleRetry,
      backgroundSyncRunner,
      syncDatabaseRunner,
      getPendingSyncTimestamp,
      getPendingSyncCacheVersion,
      setPendingSyncStatus,
      checkpointAppliedSyncStatus,
    } = dependencies;
    let pollTimer = null;
    let pollLoopToken = 0;
    let resumeSyncPromise = null;

    function cancelPoll() {
      lifecycle.clearTimeout(pollTimer);
      pollTimer = null;
    }

    function schedulePoll() {
      if (isDisposed() || !isLeader() || isPageHidden())
        return cancelPoll();
      if (pollTimer !== null) return;
      const activeToken = ++pollLoopToken;
      pollTimer = lifecycle.setTimeout(() => {
        pollTimer = null;
        if (activeToken !== pollLoopToken) return;
        if (isPageHidden()) return;
        backgroundSyncRunner.optimizedBackgroundSync().finally(() => {
          if (activeToken === pollLoopToken && isLeader()) schedulePoll();
        });
      }, syncIntervalMs);
    }

    function resumeSyncOnce() {
      if (isDisposed()) return Promise.resolve(false);
      if (resumeSyncPromise) return resumeSyncPromise;
      const resume = async () => {
        const currentBackgroundPromise = backgroundSyncRunner.getPromise();
        const currentSyncPromise = syncDatabaseRunner.getInFlightPromise();
        if (currentBackgroundPromise) backgroundSyncRunner.abort();
        if (currentSyncPromise) syncDatabaseRunner.abort();
        await Promise.all([
          currentBackgroundPromise?.catch(() => undefined),
          currentSyncPromise?.catch(() => undefined),
        ]);
        if (isDisposed() || !isLeader() || isPageHidden()) return false;
        return backgroundSyncRunner.optimizedBackgroundSync({
          bypassIdleGate: true,
          scheduleFollowUpPoll: false,
        });
      };
      resumeSyncPromise = resume().finally(() => {
        resumeSyncPromise = null;
      });
      return resumeSyncPromise;
    }

    async function syncPrefetchedSnapshot(snapshot) {
      if (isDisposed()) return false;
      if (backgroundSyncRunner.getPromise())
        return backgroundSyncRunner.getPromise();
      if (syncDatabaseRunner.getInFlightPromise())
        return syncDatabaseRunner.getInFlightPromise();
      if (!snapshot || typeof snapshot !== "object" || snapshot.status !== "ok")
        throw new Error("Backend sync snapshot is invalid.");
      if (snapshot.syncPending === true) {
        schedulePendingSyncRetry(snapshot.retryAfterMs);
        return false;
      }
      if (snapshot.isColdStart === true) {
        setIsColdStart(true);
        scheduleRetry(!isCached());
        return false;
      }
      if (Number(snapshot.payloadSchemaVersion) !== payloadSchemaVersion)
        throw new Error("Backend data format is incompatible with this app.");
      const timestamp = String(snapshot?.syncTimestamp || "").trim();
      const cacheVersion = String(snapshot?.cacheVersion || "").trim();
      const storedTimestamp = options.readStoredSyncStatusTimestamp();
      const storedCacheVersion =
        options.readStoredSyncStatusCacheVersion?.() || "";
      const timestampMs = Date.parse(timestamp);
      const storedTimestampMs = Date.parse(storedTimestamp);

      if (
        storedTimestamp &&
        timestamp &&
        Number.isFinite(timestampMs) &&
        Number.isFinite(storedTimestampMs) &&
        timestampMs < storedTimestampMs &&
        (!cacheVersion || cacheVersion === storedCacheVersion)
      ) {
        options.logger.warn(
          "[SYNC] Ignoring an older backend sync timestamp.",
          { timestamp, storedTimestamp },
        );
        setConnected(true);
        setIsColdStart(false);
        await options.refreshPendingPayloads?.();
        options.updateSyncStatus(
          '<i class="fa-solid fa-check mr-1"></i> Connected. Using the latest applied database data.',
          "success",
          false,
        );
        notifySyncSuccess(snapshot);
        schedulePoll();
        return true;
      }

      if (
        timestamp &&
        getPendingSyncTimestamp() === timestamp &&
        getPendingSyncCacheVersion() === cacheVersion &&
        options.hasActiveSession()
      ) {
        setConnected(true);
        setIsColdStart(false);
        options.updateSyncStatus(
          '<i class="fa-solid fa-check mr-1"></i> Connected. An update is waiting until your session ends.',
          "success",
          false,
        );
        notifySyncSuccess(snapshot);
        schedulePoll();
        return true;
      }

      const synchronized = await syncDatabaseRunner.syncDatabase(
        true,
        true,
        timestamp,
        snapshot,
      );
      if (timestamp && synchronized)
        checkpointAppliedSyncStatus(timestamp, cacheVersion);
      return synchronized;
    }

    return { cancelPoll, schedulePoll, resumeSyncOnce, syncPrefetchedSnapshot };
  }

  /** @param {SyncCoreOptions} options @returns {SyncCoreController & Object} */
  function createController(options) {
    const lifecycle = options.lifecycle;
    const config = options.appConfig || {};
    const retryIntervalMs = config.syncRetryIntervalMs ?? 3 * 1000;
    const syncIntervalMs = config.syncIntervalMs ?? 60 * 1000;
    const requestTimeoutMs = config.syncRequestTimeoutMs ?? 60000;
    const payloadSchemaVersion = Number(
      config.backendPayloadSchemaVersion ?? 2,
    );
    let connected = false;
    let coldStart = false;
    let disposed = false;
    let syncDatabaseRunner = null;
    let backgroundSyncRunner = null;
    let syncRequestCoordinator = null;

    function syncDatabase(...args) {
      return syncDatabaseRunner.syncDatabase(...args);
    }

    function optimizedBackgroundSync(...args) {
      return backgroundSyncRunner.optimizedBackgroundSync(...args);
    }
    function syncPrefetchedSnapshot(...args) {
      return syncRequestCoordinator.syncPrefetchedSnapshot(...args);
    }
    function resumeSyncOnce(...args) {
      return syncRequestCoordinator.resumeSyncOnce(...args);
    }
    function cancelPoll() {
      return syncRequestCoordinator.cancelPoll();
    }
    function schedulePoll() {
      return syncRequestCoordinator.schedulePoll();
    }
    const isCached = () => options.state.categorySummary.length > 0;
    const setConnected = (value) => {
      connected = Boolean(value);
      options.setSyncConnected(connected);
      if (connected && isCached()) {
        options.markInitialSyncCompleteFromCache?.();
      }
    };
    const setIsColdStart = (value) => {
      coldStart = Boolean(value);
      options.setColdStart(coldStart);
    };
    const notifySyncSuccess = (status = {}) => {
      options.onSyncSuccess?.({
        syncTimestamp: String(status.syncTimestamp || "").trim(),
        cacheVersion: String(status.cacheVersion || "").trim(),
        payloadSchemaVersion: Number(status.payloadSchemaVersion),
      });
    };
    const pendingSyncState = createPendingSyncState({
      options,
      payloadSchemaVersion,
      notifySyncSuccess,
    });
    const isPageHidden = () =>
      typeof document !== "undefined" && document.hidden;

    const retryScheduler = createRetryScheduler({
      lifecycle,
      options,
      retryIntervalMs,
      retryMaxDelayMs: config.syncRetryMaxDelayMs ?? 60 * 1000,
      isDisposed: () => disposed,
      isPageHidden,
      isCached,
      isConnected: () => connected,
      setConnected,
      cancelPoll: () => cancelPoll(),
      syncDatabase: (...args) => syncDatabase(...args),
    });
    const {
      scheduleRetry,
      schedulePendingSyncRetry,
      clearScheduledRetry,
      clearRetryTimers,
      resetRetryAttempt,
    } = retryScheduler;
    const {
      checkSyncStatusLightweight,
      getSyncSnapshot,
      normalizeSummary,
      getDecision,
    } = createSyncSnapshotHelpers({
      options,
      payloadSchemaVersion,
      requestTimeoutMs,
      isCached,
      hasPendingSummary: () =>
        Boolean(pendingSyncState.getPendingSummaryData()),
    });
    const { applySummary } = createSummaryApplicationHelper({
      options,
      payloadSchemaVersion,
      isDisposed: () => disposed,
      isConnected: () => connected,
      setConnected,
      setIsColdStart,
      getDecision,
      resetRetryAttempt,
      notifySyncSuccess,
      setPendingSummaryData: pendingSyncState.setPendingSummaryData,
      schedulePoll: () => schedulePoll(),
    });
    syncDatabaseRunner = createSyncDatabaseRunner({
      options,
      lifecycle,
      requestTimeoutMs,
      payloadSchemaVersion,
      isDisposed: () => disposed,
      isCached,
      setConnected,
      setIsColdStart,
      getSyncSnapshot,
      normalizeSummary,
      scheduleRetry,
      schedulePendingSyncRetry,
      clearRetryTimers,
      cancelPoll: () => cancelPoll(),
      clearScheduledRetry,
      resetRetryAttempt,
      schedulePoll: () => schedulePoll(),
      notifySyncSuccess,
      applySummary,
    });

    backgroundSyncRunner = createBackgroundSyncRunner({
      options,
      lifecycle,
      requestTimeoutMs,
      payloadSchemaVersion,
      isDisposed: () => disposed,
      isLeader: () => options.isLeader(),
      isCached,
      setConnected,
      setIsColdStart,
      getSyncSnapshot,
      scheduleRetry,
      schedulePendingSyncRetry,
      clearScheduledRetry,
      schedulePoll: () => schedulePoll(),
      syncDatabase: (...args) => syncDatabase(...args),
      getInFlightSyncPromise: () =>
        syncDatabaseRunner.getInFlightPromise(),
      notifySyncSuccess,
      getPendingSyncTimestamp: pendingSyncState.getPendingSyncTimestamp,
      getPendingSyncCacheVersion:
        pendingSyncState.getPendingSyncCacheVersion,
      setPendingSyncStatus: pendingSyncState.setPendingSyncStatus,
      checkpointAppliedSyncStatus:
        pendingSyncState.checkpointAppliedSyncStatus,
    });
    syncRequestCoordinator = createSyncRequestCoordinator({
      options,
      lifecycle,
      syncIntervalMs,
      payloadSchemaVersion,
      isDisposed: () => disposed,
      isLeader: () => options.isLeader(),
      isPageHidden,
      isCached,
      setConnected,
      setIsColdStart,
      notifySyncSuccess,
      schedulePendingSyncRetry,
      scheduleRetry,
      backgroundSyncRunner,
      syncDatabaseRunner,
      getPendingSyncTimestamp: pendingSyncState.getPendingSyncTimestamp,
      getPendingSyncCacheVersion:
        pendingSyncState.getPendingSyncCacheVersion,
      setPendingSyncStatus: pendingSyncState.setPendingSyncStatus,
      checkpointAppliedSyncStatus:
        pendingSyncState.checkpointAppliedSyncStatus,
    });

    return {
      syncDatabase: (...args) => syncDatabaseRunner.syncDatabase(...args),
      optimizedBackgroundSync,
      syncPrefetchedSnapshot,
      checkSyncStatusLightweight,
      scheduleSyncPoll: schedulePoll,
      resumeSyncOnce,
      scheduleSyncRetry: scheduleRetry,
      showColdStartNotification: options.showColdStartNotification,
      cancel: cancelPoll,
      handleVisibility(isHidden) {
        cancelPoll();
        if (isHidden) {
          backgroundSyncRunner.abort();
          syncDatabaseRunner.abort();
          clearRetryTimers();
          return;
        }
        if (!isPageHidden())
          return resumeSyncOnce();
      },
      confirmPendingSummaryApplied:
        pendingSyncState.confirmPendingSummaryApplied,
      getStatus: () => ({
        connected,
        coldStart,
        pendingSummaryData: pendingSyncState.getPendingSummaryData(),
      }),
      cleanup() {
        disposed = true;
        cancelPoll();
        clearRetryTimers();
        syncDatabaseRunner.abort();
      },
    };
  }

  globalScope.SyncCore = { createController, createLeaderCoordinator };
})(typeof window !== "undefined" ? window : globalThis);
