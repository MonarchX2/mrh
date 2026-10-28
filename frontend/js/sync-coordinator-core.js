(function (globalScope) {
  "use strict";

  function create({
    engine,
    engineProvider = () => globalScope.SyncCore,
    getControllerOptions,
    leaderOptions = {},
    onLeaderChange = () => undefined,
  } = {}) {
    if (typeof getControllerOptions !== "function") {
      throw new TypeError("Sync controller options are required.");
    }

    let controller = null;
    let leaderCoordinator = null;
    let started = false;
    let disposed = false;
    let leader = false;

    function handleLeaderChange(value) {
      leader = Boolean(value);
      onLeaderChange(leader);
    }

    function getEngine() {
      const resolvedEngine = engine || engineProvider();
      if (!resolvedEngine || typeof resolvedEngine.createController !== "function") {
        throw new Error("The synchronization engine is unavailable.");
      }
      return resolvedEngine;
    }

    function getController() {
      if (disposed) {
        throw new Error("The synchronization coordinator has been disposed.");
      }
      if (!controller)
        controller = getEngine().createController(getControllerOptions());
      return controller;
    }

    function start() {
      if (disposed) {
        throw new Error("The synchronization coordinator has been disposed.");
      }
      if (started) return false;
      started = true;
      const resolvedEngine = getEngine();
      if (typeof resolvedEngine.createLeaderCoordinator !== "function") {
        handleLeaderChange(true);
        return false;
      }
      leaderCoordinator = resolvedEngine.createLeaderCoordinator({
        ...leaderOptions,
        onLeaderChange: handleLeaderChange,
      });
      leaderCoordinator.start();
      return true;
    }

    function cleanup() {
      if (disposed) return;
      disposed = true;
      leaderCoordinator?.cleanup();
      leaderCoordinator = null;
      controller?.cleanup?.();
      controller = null;
      started = false;
      leader = false;
    }

    return Object.freeze({
      cleanup,
      getController,
      isLeader: () => Boolean(leaderCoordinator?.isLeader() ?? leader),
      start,
    });
  }

  globalScope.SyncCoordinatorCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
