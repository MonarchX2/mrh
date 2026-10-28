(function (globalScope) {
  "use strict";

  const REQUEST_TIMEOUT_MS = {
    accountStatus: 15000,
    enrollment: 30000,
    restore: 15000,
    revocation: 15000,
    verification: 30000,
  };

  function create({ getAppNetwork } = {}) {
    let signInButtonResizeHandler = null;
    let signInButtonResizeObserver = null;

    function getNetwork() {
      const network = getAppNetwork?.();
      if (typeof network?.callBackend !== "function")
        throw new Error("Reviewer authentication service is unavailable.");
      return network;
    }

    function verifyAccess(idToken, eventId, sessionPublicKey) {
      return getNetwork().callBackend(
        {
          type: "verify_reviewer_access",
          idToken,
          eventId,
          sessionPublicKey,
        },
        { timeoutMs: REQUEST_TIMEOUT_MS.verification, maxRetries: 0 },
      );
    }

    function getAuthConfig() {
      return getNetwork().callBackend(
        { type: "get_reviewer_auth_config" },
        { timeoutMs: REQUEST_TIMEOUT_MS.accountStatus, maxRetries: 0 },
      );
    }

    function restoreSession(sessionId, options = {}) {
      return getNetwork().callBackend(
        { type: "restore_reviewer_session", sessionId },
        {
          timeoutMs: options.timeoutMs || REQUEST_TIMEOUT_MS.restore,
          maxRetries: options.maxRetries ?? 0,
        },
      );
    }

    function getAccountStatus(sessionId, options = {}) {
      return getNetwork().callBackend(
        { type: "get_reviewer_account_status", sessionId },
        {
          timeoutMs: options.timeoutMs || REQUEST_TIMEOUT_MS.accountStatus,
          maxRetries: options.maxRetries ?? 0,
        },
      );
    }

    function requestEnrollment(
      sessionId,
      eventId,
      { lastName, firstName, middleInitial },
    ) {
      return getNetwork().callBackend(
        {
          type: "request_reviewer_enrollment",
          sessionId,
          eventId,
          lastName,
          firstName,
          middleInitial,
        },
        { timeoutMs: REQUEST_TIMEOUT_MS.enrollment, maxRetries: 0 },
      );
    }

    function revokeSession(sessionId, eventId) {
      return getNetwork().callBackend(
        {
          type: "sign_out_reviewer",
          sessionId,
          eventId,
        },
        { timeoutMs: REQUEST_TIMEOUT_MS.revocation, maxRetries: 0 },
      );
    }

    function loadIdentityProvider() {
      if (globalScope.google?.accounts?.id) return Promise.resolve(null);
      return new Promise((resolve, reject) => {
        const script = globalScope.document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client?hl=en";
        script.async = true;
        script.defer = true;
        script.onload = () => resolve(null);
        script.onerror = () =>
          reject(new Error("Unable to load Google sign-in."));
        globalScope.document.head.appendChild(script);
      });
    }

    function initializeIdentityProvider(clientId, signInButton, onCredential) {
      const identity = globalScope.google?.accounts?.id;
      if (!identity) throw new Error("Google sign-in did not initialize.");
      identity.initialize({
        client_id: clientId,
        callback: (credentialResponse) => {
          const credential =
            typeof credentialResponse?.credential === "string"
              ? credentialResponse.credential.trim()
              : "";
          onCredential(credential);
        },
        auto_select: false,
        button_auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
      });
      if (!signInButton) return;
      let renderedButtonLayout = "";
      const renderResponsiveSignInButton = () => {
        const width = Math.max(
          120,
          Math.min(280, Math.floor(signInButton.clientWidth || 280)),
        );
        const buttonText = width < 187 ? "signin" : "signin_with";
        const layout = `${width}:${buttonText}`;
        if (layout === renderedButtonLayout) return;
        signInButton.replaceChildren();
        identity.renderButton(signInButton, {
          type: "standard",
          theme: "filled_blue",
          size: "large",
          text: buttonText,
          shape: "rectangular",
          logo_alignment: "left",
          width,
          locale: "en",
        });
        renderedButtonLayout = layout;
      };
      renderResponsiveSignInButton();
      if (signInButtonResizeHandler)
        globalScope.removeEventListener(
          "resize",
          signInButtonResizeHandler,
        );
      signInButtonResizeHandler = renderResponsiveSignInButton;
      globalScope.addEventListener("resize", signInButtonResizeHandler);
      if (typeof globalScope.ResizeObserver === "function") {
        signInButtonResizeObserver?.disconnect();
        signInButtonResizeObserver = new globalScope.ResizeObserver(
          renderResponsiveSignInButton,
        );
        signInButtonResizeObserver.observe(signInButton);
      }
    }

    function cleanup() {
      signInButtonResizeObserver?.disconnect();
      signInButtonResizeObserver = null;
      if (!signInButtonResizeHandler) return;
      globalScope.removeEventListener("resize", signInButtonResizeHandler);
      signInButtonResizeHandler = null;
    }

    function disableAutoSelect() {
      globalScope.google?.accounts?.id?.disableAutoSelect?.();
    }

    return Object.freeze({
      cleanup,
      getAccountStatus,
      getAuthConfig,
      initializeIdentityProvider,
      loadIdentityProvider,
      disableAutoSelect,
      requestEnrollment,
      restoreSession,
      revokeSession,
      verifyAccess,
    });
  }

  globalScope.ReviewerAuthCore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
