(function (globalScope) {
  "use strict";

  function create({
    document = globalScope.document,
    getAuthorizedEmail,
    getProfilePictureUrl,
    getProfileEditing,
    setProfileEditing,
    setProfilePictureUrl,
    renderWelcome,
  } = {}) {
    function capitalizeReviewerName(value) {
      return String(value || "").toLocaleUpperCase();
    }

    function normalizeReviewerIdentityText(value) {
      return String(value || "")
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
    }

    function reviewerEmailMatchesName(email, firstName, middleInitial, lastName) {
      const localPart = normalizeReviewerIdentityText(
        String(email || "").split("@")[0],
      );
      const nameParts = [firstName, middleInitial, lastName]
        .map(normalizeReviewerIdentityText)
        .filter((part) => part.length >= 3 && part !== "na");
      if (nameParts.some((part) => localPart.includes(part))) return true;
      const initials = [firstName, middleInitial, lastName]
        .map(normalizeReviewerIdentityText)
        .filter((part) => part !== "na")
        .filter(Boolean)
        .map((part) => part[0])
        .join("");
      return initials.length >= 2 && localPart.includes(initials);
    }

    function normalizeReviewerNameInput(input) {
      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;
      const normalized = capitalizeReviewerName(input.value);
      if (normalized === input.value) return;
      input.value = normalized;
      if (typeof selectionStart === "number" && typeof selectionEnd === "number")
        input.setSelectionRange(selectionStart, selectionEnd);
    }

    function normalizeReviewerMiddleInitialInput(input, event) {
      if (event?.inputType?.startsWith("delete")) {
        input.value = "";
        return;
      }
      const value = input.value.trim().toLocaleUpperCase();
      if (value === "N/A") {
        input.value = "";
        return;
      }
      const letters = value.replace(/[^A-Z]/g, "");
      if (!letters) {
        input.value = "";
        return;
      }
      const initial = letters[0];
      input.value =
        event?.inputType?.startsWith("delete") && letters.length === 1
          ? initial
          : `${initial}.`;
    }

    function updateReviewerEmailNameWarning() {
      const warning = document.getElementById(
        "resource-reviewer-email-name-warning",
      );
      if (!warning) return;
      const firstName = document.getElementById(
        "resource-reviewer-first-name",
      )?.value;
      const lastName = document.getElementById(
        "resource-reviewer-last-name",
      )?.value;
      const hasName = Boolean(
        String(firstName || "").trim() || String(lastName || "").trim(),
      );
      const email = getAuthorizedEmail();
      warning.hidden =
        !hasName ||
        !email ||
        reviewerEmailMatchesName(email, firstName, "", lastName);
    }

    function initializeEnrollmentInputs() {
      [
        document.getElementById("resource-reviewer-last-name"),
        document.getElementById("resource-reviewer-first-name"),
      ].forEach((input) => {
        if (!input || input.dataset.nameCapitalizationInitialized) return;
        input.addEventListener("input", () => {
          normalizeReviewerNameInput(input);
          updateReviewerEmailNameWarning();
        });
        input.dataset.nameCapitalizationInitialized = "true";
      });
      updateReviewerEmailNameWarning();
      const middleInitialInput = document.getElementById(
        "resource-reviewer-middle-initial",
      );
      if (
        middleInitialInput &&
        !middleInitialInput.dataset.middleInitialInitialized
      ) {
        const normalizeMiddleInitial = (event) =>
          normalizeReviewerMiddleInitialInput(middleInitialInput, event);
        middleInitialInput.addEventListener("input", normalizeMiddleInitial);
        middleInitialInput.addEventListener("change", () =>
          normalizeReviewerMiddleInitialInput(middleInitialInput),
        );
        middleInitialInput.addEventListener("blur", () =>
          normalizeReviewerMiddleInitialInput(middleInitialInput),
        );
        middleInitialInput.dataset.middleInitialInitialized = "true";
      }
      document
        .querySelectorAll(".resource-reviewer-input-wrap")
        .forEach((wrapper) => {
          const input = wrapper.querySelector("input");
          const clearButton = wrapper.querySelector(
            ".resource-reviewer-input-clear",
          );
          if (!input || !clearButton || clearButton.dataset.initialized) return;
          clearButton.addEventListener("click", () => {
            input.value = "";
            updateReviewerEmailNameWarning();
            input.focus();
          });
          clearButton.dataset.initialized = "true";
        });
    }

    function openProfileEditor() {
      const form = document.getElementById(
        "resource-reviewer-enrollment-form",
      );
      const cancelButton = document.getElementById(
        "resource-reviewer-cancel-edit",
      );
      const submitButton = form?.querySelector('button[type="submit"]');
      if (!form) return;
      setProfileEditing(true);
      form.hidden = false;
      const profileDetails = document.getElementById(
        "resource-profile-account-details",
      );
      if (profileDetails) profileDetails.hidden = true;
      if (cancelButton) cancelButton.hidden = false;
      if (submitButton) submitButton.textContent = "Save changes for approval";
      document.getElementById("resource-reviewer-first-name")?.focus();
    }

    function closeProfileEditor() {
      const form = document.getElementById(
        "resource-reviewer-enrollment-form",
      );
      const cancelButton = document.getElementById(
        "resource-reviewer-cancel-edit",
      );
      const submitButton = form?.querySelector('button[type="submit"]');
      if (!form) return;
      setProfileEditing(false);
      form.hidden = true;
      const profileDetails = document.getElementById(
        "resource-profile-account-details",
      );
      if (profileDetails) profileDetails.hidden = false;
      if (cancelButton) cancelButton.hidden = true;
      if (submitButton) submitButton.textContent = "Submit";
      form.querySelectorAll("input").forEach((input) => {
        input.value = input.dataset.savedValue || "";
      });
    }

    function populateProfile(response) {
      const email = String(response.email || "");
      const profileDetails = document.getElementById(
        "resource-profile-account-details",
      );
      const profileName = document.getElementById("resource-profile-name");
      const profileEmail = document.getElementById("resource-profile-email");
      const profilePicture = document.getElementById(
        "resource-profile-picture",
      );
      const profilePictureFallback = document.getElementById(
        "resource-profile-avatar-fallback",
      );
      const headerProfilePicture = document.getElementById(
        "resource-dashboard-profile-picture",
      );
      const headerProfileIcon = document.querySelector(
        "#resource-dashboard-profile-nav > i",
      );
      const displayName = [
        response.firstName,
        response.middleInitial,
        response.lastName,
      ]
        .filter(Boolean)
        .join(" ");
      const profileSignature = JSON.stringify([
        email,
        displayName,
        response.accountStatus || "",
        getProfilePictureUrl(response.picture),
      ]);
      const profileChanged =
        profileDetails?.dataset.profileSignature !== profileSignature;
      const nextDisplayName = displayName || email;
      if (profileName && profileName.textContent !== nextDisplayName)
        profileName.textContent = nextDisplayName;
      if (profileEmail && profileEmail.textContent !== email)
        profileEmail.textContent = email;
      if (profileDetails) {
        const shouldHideProfile =
          getProfileEditing() || response.accountStatus === "NOT_FOUND";
        if (profileDetails.hidden !== shouldHideProfile)
          profileDetails.hidden = shouldHideProfile;
        profileDetails.dataset.profileSignature = profileSignature;
      }
      renderAccessStatus(response.accountStatus);
      const pictureUrl = getProfilePictureUrl(response.picture);
      setProfilePictureUrl(pictureUrl);
      if (profileChanged)
        renderWelcome(
          response.accountStatus === "NOT_FOUND" ? "" : displayName,
          email,
          pictureUrl,
          response.lastName,
          response.accountStatus,
        );
      [profilePicture, headerProfilePicture].forEach((image) => {
        if (!image) return;
        if (image.dataset.errorHandlerInitialized !== "true") {
          image.onerror = () => {
            image.hidden = true;
            image.removeAttribute("src");
            if (image === profilePicture && profilePictureFallback)
              profilePictureFallback.hidden = false;
            if (image === headerProfilePicture && headerProfileIcon)
              headerProfileIcon.hidden = false;
          };
          image.dataset.errorHandlerInitialized = "true";
        }
        const currentPictureUrl = image.getAttribute("src") || "";
        if (currentPictureUrl !== pictureUrl) {
          if (pictureUrl) image.setAttribute("src", pictureUrl);
          else image.removeAttribute("src");
          image.hidden = !pictureUrl;
        } else if (!pictureUrl && !image.hidden) {
          image.hidden = true;
        }
      });
      if (
        profilePictureFallback &&
        profilePictureFallback.hidden !== Boolean(pictureUrl)
      )
        profilePictureFallback.hidden = Boolean(pictureUrl);
      if (headerProfileIcon && headerProfileIcon.hidden !== Boolean(pictureUrl))
        headerProfileIcon.hidden = Boolean(pictureUrl);
    }

    function prefillNameFromGoogle(profile) {
      if (profile?.accountStatus !== "NOT_FOUND") return false;
      const lastNameInput = document.getElementById(
        "resource-reviewer-last-name",
      );
      const firstNameInput = document.getElementById(
        "resource-reviewer-first-name",
      );
      if (
        lastNameInput &&
        !lastNameInput.value.trim() &&
        profile.suggestedLastName
      ) {
        lastNameInput.value = capitalizeReviewerName(
          profile.suggestedLastName,
        ).trim();
        lastNameInput.dataset.savedValue = lastNameInput.value;
      }
      if (
        firstNameInput &&
        !firstNameInput.value.trim() &&
        profile.suggestedFirstName
      ) {
        firstNameInput.value = capitalizeReviewerName(
          profile.suggestedFirstName,
        ).trim();
        firstNameInput.dataset.savedValue = firstNameInput.value;
      }
      updateReviewerEmailNameWarning();
      return Boolean(lastNameInput?.value || firstNameInput?.value);
    }

    function renderAccessStatus(accountStatus) {
      const status = document.getElementById("resource-profile-access-status");
      if (!status) return;
      const statusPresentation = {
        TRUE: {
          label: "ACCESS GRANTED",
          className: "is-granted",
          icon: "fa-check",
        },
        FALSE: {
          label: "ACCESS PENDING",
          className: "is-pending",
          icon: "fa-triangle-exclamation",
        },
        DENIED: {
          label: "ACCESS DENIED",
          className: "is-denied",
          icon: "fa-xmark",
        },
        RESTRICTED: {
          label: "ACCESS RESTRICTED",
          className: "is-restricted",
          icon: "fa-ban",
        },
      }[accountStatus];
      if (
        status.dataset.accountStatus === String(accountStatus || "") &&
        status.hidden === !statusPresentation
      )
        return;
      status.className =
        `resource-profile-access-status ${statusPresentation?.className || ""}`.trim();
      status.dataset.accountStatus = String(accountStatus || "");
      status.replaceChildren();
      if (!statusPresentation) {
        status.hidden = true;
        return;
      }
      const icon = document.createElement("i");
      icon.className = `fa-solid ${statusPresentation.icon}`;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = statusPresentation.label;
      status.append(icon, label);
      status.hidden = false;
    }

    return Object.freeze({
      capitalizeReviewerName,
      closeProfileEditor,
      initializeEnrollmentInputs,
      normalizeMiddleInitialInput: normalizeReviewerMiddleInitialInput,
      normalizeReviewerNameInput,
      normalizeReviewerIdentityText,
      openProfileEditor,
      populateProfile,
      prefillNameFromGoogle,
      renderAccessStatus,
      reviewerEmailMatchesName,
      updateReviewerEmailNameWarning,
    });
  }

  globalScope.ReviewerProfileUICore = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
