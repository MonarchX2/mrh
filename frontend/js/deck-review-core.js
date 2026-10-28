// ============================================================================
// Deck Review Core - Deck study/review controller and pagination
// ============================================================================

(function (globalScope) {
  const lifecycle = globalScope.LifecycleUtils || globalScope;
  const state = globalScope.state;
  let currentReviewSubject = null;
  let currentReviewQuestions = [];
  let derivedQuestionsCache = null;
  let reviewRenderFrame = null;
  let virtualReviewScrollFrame = null;
  let lastVirtualRenderKey = null;
  let reviewMainElement = null;
  let reviewContainerElement = null;
  let cachedReviewContainerTop = 0;
  let pendingReviewScrollPosition = null;
  const REVIEW_ESTIMATED_CARD_HEIGHT = 420;
  const REVIEW_VIRTUAL_OVERSCAN = 4;

  function scheduleVirtualReviewRender() {
    if (virtualReviewScrollFrame !== null) return;
    const render = () => {
      virtualReviewScrollFrame = null;
      if (
        document
          .getElementById("view-deck-review")
          ?.classList.contains("active") &&
        getStudySetting("studyLayout") !== "single" &&
        getStudySetting("studyPageSize") === "All"
      ) {
        reRenderDeckReview(true);
      }
    };
    virtualReviewScrollFrame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(render)
        : lifecycle.setTimeout(render, 0);
  }

  function reRenderDeckReview(isVirtualScroll = false) {
    if (reviewRenderFrame !== null) return;

    const render = () => {
      reviewRenderFrame = null;
      renderDeckReview(
        currentReviewSubject,
        currentReviewQuestions,
        isVirtualScroll,
      );
    };

    if (typeof requestAnimationFrame === "function") {
      reviewRenderFrame = requestAnimationFrame(render);
    } else {
      reviewRenderFrame = lifecycle.setTimeout(render, 0);
    }
  }

  function formatChoiceText(choiceText) {
    return typeof globalScope.formatQuestionText === "function"
      ? globalScope.formatQuestionText(choiceText, { formatLists: false })
      : escapeHTML(choiceText);
  }

  function buildReviewChoicesHTML(question, showAllChoices, hideABCD) {
    const answer = question.Answer ? String(question.Answer).trim() : "";
    const isMultipleChoice = !getQuestionTypeMode(question).isIdent;
    let correctText = isMultipleChoice
      ? question[`Choice${answer.toUpperCase()}`] || answer
      : question.ChoiceA || answer;
    if (!correctText || correctText.toLowerCase() === "undefined") {
      correctText = "Answer missing from database";
    }

    if (isMultipleChoice && showAllChoices) {
      let choicesHTML = `<div class="mt-4 flex flex-col gap-2">`;
      ["A", "B", "C", "D", "E"].forEach((letter) => {
        const choiceText = question[`Choice${letter}`];
        if (!choiceText) return;
        const prefix = hideABCD ? "" : `${letter}. `;
        if (letter === answer.toUpperCase()) {
          choicesHTML += `
            <div class="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-3 rounded-r-lg">
              <p class="text-sm font-bold text-green-700 dark:text-green-400">${prefix}${formatChoiceText(choiceText)}</p>
            </div>`;
        } else {
          choicesHTML += `
            <div class="bg-gray-50 dark:bg-gray-800/50 border-l-4 border-gray-300 dark:border-gray-600 p-3 rounded-r-lg opacity-70">
              <p class="text-sm font-medium text-gray-500 dark:text-gray-400">${prefix}${formatChoiceText(choiceText)}</p>
            </div>`;
        }
      });
      return `${choicesHTML}</div>`;
    }

    const prefix = hideABCD
      ? ""
      : isMultipleChoice
        ? `${answer.toUpperCase()}. `
        : "";
    return `
      <div class="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-3 rounded-r-lg mt-4">
        <p class="text-sm font-bold text-green-700 dark:text-green-400">
          ${prefix}${formatChoiceText(correctText)}
        </p>
      </div>`;
  }

  function updateQuestionChoices(
    questionId = null,
    questions = currentReviewQuestions,
  ) {
    const container =
      reviewContainerElement ||
      (reviewContainerElement = document.getElementById("deck-review-cards"));
    if (!container) return false;

    const questionsById = new Map(
      questions.map((question) => [
        String(question.ID),
        question,
      ]),
    );
    const globalShowWrong = getStudySetting("showWrongChoices") !== false;
    const showAnswers = getStudySetting("studyShowAnswers") !== false;
    const hideABCD = getStudySetting("hideABCD") === true;
    const cards = container.querySelectorAll(".review-question-card");
    const scrollContainer =
      reviewMainElement || document.querySelector("main");
    const scrollTop = scrollContainer?.scrollTop;

    cards.forEach((card) => {
      const id = String(card.dataset.questionId || "");
      if (questionId !== null && id !== String(questionId)) return;
      const question = questionsById.get(id);
      if (!question) return;
      const choices = card.querySelector("[data-review-choices]");
      if (getQuestionTypeMode(question).isIdent) {
        if (choices && !showAnswers) choices.innerHTML = "";
        return;
      }

      const showAllChoices =
        state.prefs.qToggles?.[id] === undefined
          ? globalShowWrong
          : Boolean(state.prefs.qToggles[id]);
      if (choices) {
        choices.innerHTML = showAnswers
          ? buildReviewChoicesHTML(question, showAllChoices, hideABCD)
          : "";
      }

      const toggle = card.querySelector("[data-review-choice-toggle]");
      if (toggle) {
        const label = showAllChoices ? "Hide Choices" : "Show Choices";
        toggle.innerHTML = showAllChoices
          ? '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i><span class="hidden md:inline ml-1">Hide Choices</span>'
          : '<i class="fa-solid fa-eye" aria-hidden="true"></i><span class="hidden md:inline ml-1">Show Choices</span>';
        toggle.setAttribute("aria-label", label);
        toggle.title = label;
      }
    });

    if (scrollContainer && Number.isFinite(scrollTop)) {
      scrollContainer.scrollTop = scrollTop;
    }
    updateStudyProgressIndicator();
    return true;
  }

  function updateStudyProgressIndicator() {
    const progress = state?.prefs?.studyProgress?.[currentReviewSubject] || {};
    const reviewQuestions =
      derivedQuestionsCache?.questions === currentReviewQuestions
        ? derivedQuestionsCache.sortedQuestions
        : currentReviewQuestions;
    const total = reviewQuestions.length;
    const layout = getStudySetting("studyLayout") || "scroll";
    const pageSize = getStudySetting("studyPageSize") || 10;
    const questionIndexById = new Map(
      reviewQuestions.map((question, index) => [
        String(question.ID),
        index,
      ]),
    );
    let viewQuestionCount = 0;
    if (total > 0) {
      if (layout === "single") {
        viewQuestionCount = 1;
      } else if (pageSize === "All") {
        viewQuestionCount = total;
      } else {
        const totalPages = Math.ceil(total / pageSize);
        const page = Math.min(totalPages, Math.max(1, progress.page || 1));
        viewQuestionCount = Math.min(pageSize, total - (page - 1) * pageSize);
      }
    }
    let current =
      total > 0
        ? Math.min(total, Math.max(1, (progress.index || 0) + 1))
        : 0;
    let label = "";

    if (total > 0) {
      const container = reviewContainerElement;
      const viewport = reviewMainElement?.getBoundingClientRect();
      const viewportTop = viewport?.top ?? 0;
      const viewportBottom = viewport?.bottom ?? window.innerHeight;
      const visibleCards = Array.from(
        container?.querySelectorAll(".review-question-card") || [],
      ).filter((card) => {
        const bounds = card.getBoundingClientRect();
        return bounds.bottom > viewportTop && bounds.top < viewportBottom;
      });
      const visibleCard =
        visibleCards.find(
          (card) => card.getBoundingClientRect().top <= viewportTop + 1,
        ) || visibleCards[0];
      const questionId = String(visibleCard?.dataset.questionId || "");
      const visibleIndex = questionIndexById.get(questionId);

      if (Number.isSafeInteger(visibleIndex)) {
        progress.index = visibleIndex;
        progress.questionId = questionId;
        markStudyProgressChanged(progress);
        current = visibleIndex + 1;

        if (
          !progress.questionScrollOffsets ||
          typeof progress.questionScrollOffsets !== "object" ||
          Array.isArray(progress.questionScrollOffsets)
        ) {
          progress.questionScrollOffsets = {};
        }
        progress.questionScrollOffsets = {
          ...progress.questionScrollOffsets,
          [questionId]: Math.round(
            visibleCard.getBoundingClientRect().top - viewportTop,
          ),
        };
      } else if (layout === "single") {
        current = Math.min(total, Math.max(1, (progress.index || 0) + 1));
      }

      if (layout === "single") {
        label = `Question ${current} / ${total}`;
      } else if (pageSize !== "All") {
        const totalPages = Math.ceil(total / pageSize);
        const page = Math.min(totalPages, Math.max(1, progress.page || 1));
        const start = (page - 1) * pageSize + 1;
        const end = Math.min(total, page * pageSize);
        const questionLabel =
          viewQuestionCount === 1 ? "Question" : "Questions";
        label = `${questionLabel} ${start} - ${end} / ${total}`;
      } else {
        const questionLabel =
          viewQuestionCount === 1 ? "Question" : "Questions";
        label = `${questionLabel} ${current} / ${total}`;
      }
    }
    document
      .querySelectorAll("[data-review-question-range]")
      .forEach((text) => {
        text.textContent = label;
      });
  }

  function renderDeckReviewImplementation(
    subject,
    questions,
    isVirtualScroll = false,
  ) {
    currentReviewSubject = subject;
    currentReviewQuestions = questions;

    const container =
      reviewContainerElement ||
      (reviewContainerElement = document.getElementById("deck-review-cards"));
    const titleElement = document.getElementById("deck-review-title");
    if (titleElement) {
      titleElement.textContent = getShortSubjectLabel(subject, "General");
    }
    const parentElement = document.getElementById("deck-review-parent");
    if (parentElement) {
      const subjectParts = String(subject ?? "")
        .split("::")
        .map((part) => part.trim())
        .filter(Boolean);
      parentElement.textContent = (subjectParts.at(-2) || "").toLocaleUpperCase();
      parentElement.hidden = subjectParts.length < 2;
    }
    if (!reviewMainElement && typeof document !== "undefined") {
      reviewMainElement = document.querySelector("main");
    }
    if (reviewMainElement && container && !isVirtualScroll) {
      cachedReviewContainerTop =
        reviewMainElement === container ? 0 : container.offsetTop;
    }

    const globalShowWrong = getStudySetting("showWrongChoices") !== false;
    const showAnswers = getStudySetting("studyShowAnswers") !== false;
    const showExplanations =
      getStudySetting("studyShowExplanations") !== false;
    const hideABCD = getStudySetting("hideABCD") === true;
    let layout = getStudySetting("studyLayout") || "scroll";
    let pageSize = getStudySetting("studyPageSize") || 10;
    const reviewNavigationPosition = getStudyNavigationPosition(layout);

    if (!state.prefs.studyProgress[subject]) {
      state.prefs.studyProgress[subject] = {
        page: 1,
        index: 0,
        scrollY: 0,
        updatedAt: Date.now(),
      };
    }
    let progress = state.prefs.studyProgress[subject];
    let currentPage = progress.page || 1;
    let currentIndex = progress.index || 0;

    const wrongToggle = document.getElementById("toggle-wrong-choices");
    if (wrongToggle) wrongToggle.checked = globalShowWrong;
    const hideABCDToggle = document.getElementById("toggle-hide-abcd");
    if (hideABCDToggle) hideABCDToggle.checked = hideABCD;

    let html = "";
    const favoriteQuestions = new Set(
      Array.isArray(state.prefs.favoriteQuestions)
        ? state.prefs.favoriteQuestions
            .filter(Boolean)
            .map((questionId) => String(questionId))
        : [],
    );

    const studyFilterMode = getStudySetting("studyFilterMode") || "all";
    const favoriteSignature = [...favoriteQuestions].join("\u001f");
    const canReuseCache =
      derivedQuestionsCache &&
      derivedQuestionsCache.questions === questions &&
      derivedQuestionsCache.filterMode === studyFilterMode &&
      derivedQuestionsCache.favoriteSignature === favoriteSignature;

    let filteredQuestions;
    let sortedQuestions;
    if (canReuseCache) {
      ({ filteredQuestions, sortedQuestions } = derivedQuestionsCache);
    } else {
      filteredQuestions =
        studyFilterMode === "favorites"
          ? questions.filter((question) =>
              favoriteQuestions.has(String(question.ID)),
            )
          : questions;
      sortedQuestions = filteredQuestions;
      derivedQuestionsCache = {
        questions,
        filterMode: studyFilterMode,
        favoriteSignature,
        filteredQuestions,
        sortedQuestions,
        questionIndexById: new Map(
          sortedQuestions.map((question, index) => [
            String(question.ID),
            index,
          ]),
        ),
      };
    }

    const questionIndexById = derivedQuestionsCache.questionIndexById;
    const savedQuestionIndex = questionIndexById.get(
      String(progress.questionId || ""),
    );
    if (Number.isSafeInteger(savedQuestionIndex)) {
      currentIndex = savedQuestionIndex;
      progress.index = savedQuestionIndex;
      if (layout !== "single" && pageSize !== "All") {
        currentPage = Math.floor(savedQuestionIndex / pageSize) + 1;
        progress.page = currentPage;
      }
    } else if (progress.questionId) {
      delete progress.questionId;
    }

    if (filteredQuestions.length === 0) {
      container.innerHTML = `
      <div class="text-center p-8 text-gray-500 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <i class="fa-solid fa-star text-yellow-500 text-2xl mb-3"></i>
        <p class="font-bold text-lg">No favorite questions in this deck.</p>
        <p class="text-sm mt-1">Switch the study filter to All to see every question.</p>
      </div>
    `;
      navigate("deck-review");
      globalScope.updateSessionNavigationUrl?.(subject, "study");
      updateStudyProgressIndicator();
      return;
    }

    if (questions.length === 0) {
      container.innerHTML =
        html +
        `<div class="text-center p-8 text-gray-500">No questions found for this deck.</div>`;
      navigate("deck-review");
      globalScope.updateSessionNavigationUrl?.(subject, "study");
      updateStudyProgressIndicator();
      return;
    }

    let displayQuestions = [];
    let virtualStartIndex = 0;
    let virtualEndIndex = filteredQuestions.length;
    let totalPages = 1;

    displayQuestions = sortedQuestions;

    if (layout === "single") {
      if (currentIndex < 0) currentIndex = 0;
      if (currentIndex >= filteredQuestions.length)
        currentIndex = filteredQuestions.length - 1;
      progress.index = currentIndex;

      displayQuestions = [sortedQuestions[currentIndex]];
    } else {
      if (pageSize === "All") {
        const main = reviewMainElement;
        const containerTop = cachedReviewContainerTop;
        const viewportTop =
          !isVirtualScroll && Number.isSafeInteger(savedQuestionIndex)
            ? savedQuestionIndex * REVIEW_ESTIMATED_CARD_HEIGHT
            : Math.max(0, (main?.scrollTop || 0) - containerTop);
        const viewportHeight = main?.clientHeight || window.innerHeight || 800;
        virtualStartIndex = Math.max(
          0,
          Math.floor(viewportTop / REVIEW_ESTIMATED_CARD_HEIGHT) -
            REVIEW_VIRTUAL_OVERSCAN,
        );
        virtualEndIndex = Math.min(
          filteredQuestions.length,
          Math.ceil(
            (viewportTop + viewportHeight) / REVIEW_ESTIMATED_CARD_HEIGHT,
          ) + REVIEW_VIRTUAL_OVERSCAN,
        );
        displayQuestions = sortedQuestions.slice(
          virtualStartIndex,
          virtualEndIndex,
        );
      } else {
        totalPages = Math.ceil(filteredQuestions.length / pageSize);
        if (currentPage < 1) currentPage = 1;
        if (currentPage > totalPages) currentPage = totalPages;
        progress.page = currentPage;

        let start = (currentPage - 1) * pageSize;
        displayQuestions = sortedQuestions.slice(start, start + pageSize);
      }
    }

    const virtualRenderKey = `${subject}|${layout}|${pageSize}|${virtualStartIndex}|${virtualEndIndex}`;
    if (
      isVirtualScroll &&
      pageSize === "All" &&
      lastVirtualRenderKey === virtualRenderKey
    ) {
      return;
    }
    lastVirtualRenderKey = pageSize === "All" ? virtualRenderKey : null;

    const pageCount = document.getElementById("review-page-count");
    const pageSizeInput = document.getElementById("review-page-size-input");
    if (pageSizeInput) pageSizeInput.value = pageSize === "All" ? "" : pageSize;
    if (pageCount)
      pageCount.innerText = pageSize === "All" ? "1" : Math.max(1, totalPages);

    let navigationHTML = "";
    if (layout === "single") {
      navigationHTML = `
        <div class="flex justify-between items-center {{navigation-placement}} p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 gap-2">
            <button data-action="changeStudyIndex" data-action-args="[-1]" ${currentIndex === 0 ? "disabled" : ""} class="px-4 py-2 bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600 transition-colors">
                <i class="fa-solid fa-arrow-left"></i> <span class="hidden sm:inline ml-1">Previous</span>
            </button>
          <span data-review-card-count class="text-sm font-bold text-gray-600 dark:text-gray-300 flex-1 text-center">Card ${currentIndex + 1} / ${sortedQuestions.length}</span>
          <button data-action="changeStudyIndex" data-action-args="[1]" ${currentIndex === sortedQuestions.length - 1 ? "disabled" : ""} class="px-4 py-2 bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600 transition-colors">
                <span class="hidden sm:inline mr-1">Next</span> <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>
    `;
    } else if (pageSize !== "All" && totalPages > 1) {
      navigationHTML = `
            <div class="flex justify-between items-center {{navigation-placement}} p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 gap-2">
                <button data-action="changeStudyPage" data-action-args='[-1,"{{navigation-position}}"]' class="px-4 py-2 bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600 transition-colors">
                    <i class="fa-solid fa-arrow-left"></i> <span class="hidden sm:inline ml-1">Previous</span>
                </button>
                <div class="flex-1 flex flex-col items-center justify-center">
                    <div class="flex items-center justify-center gap-1 text-sm font-bold text-gray-600 dark:text-gray-300">
                        <span>Page</span>
                        <label class="sr-only" for="study-page-input">Go to page</label>
                        <input
                            id="study-page-input"
                            type="text"
                            inputmode="numeric"
                            pattern="[0-9]*"
                            min="1"
                            max="${totalPages}"
                            value="${currentPage}"
                            data-action="jumpToStudyPage"
                            data-action-event="change"
                            data-action-args='[{"__mrhActionArgument":"value"}]'
                            data-action-input="resizeStudyPageInput"
                            data-action-default-length="${String(currentPage).length}"
                            class="border-0 border-b border-gray-300 dark:border-gray-600 bg-transparent px-0 py-0 text-center text-sm font-bold text-gray-800 dark:text-gray-100 outline-none focus:border-brand-500 focus:ring-0 [-moz-appearance:textfield]"
                            style="width: ${Math.max(1.8, String(currentPage).length + 1.2)}ch;"
                        />
                        <span>of ${totalPages}</span>
                    </div>
                    <span data-review-question-range class="text-sm font-bold text-gray-600 dark:text-gray-300"></span>
                </div>
                <button data-action="changeStudyPage" data-action-args="[1]" class="px-4 py-2 bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600 transition-colors">
                    <span class="hidden sm:inline mr-1">Next</span> <i class="fa-solid fa-arrow-right"></i>
                </button>
            </div>
        `;
    }

    const showTopNavigation = ["top", "both"].includes(
      reviewNavigationPosition,
    );
    const showBottomNavigation = ["bottom", "both"].includes(
      reviewNavigationPosition,
    );
    const renderNavigation = (placement) =>
      navigationHTML
        .replace(/\{\{navigation-placement\}\}/g, () =>
          placement === "top" ? "mb-6 sticky top-4 z-20" : "mt-6",
        )
        .replace(/\{\{navigation-position\}\}/g, placement);

    if (showTopNavigation) html += renderNavigation("top");

    if (pageSize === "All" && virtualStartIndex > 0) {
      html += `<div aria-hidden="true" style="height: ${virtualStartIndex * REVIEW_ESTIMATED_CARD_HEIGHT}px"></div>`;
    }

    displayQuestions.forEach((q, displayIndex) => {
      const originalIndex =
        questionIndexById.get(String(q.ID)) ?? displayIndex;
      const isQuestionFavorite = favoriteQuestions.has(String(q.ID));

      let rawQuestionText = q.Question ? String(q.Question) : "";
      let cleanQuestionText = rawQuestionText.replace(/^\s*\d+\.\s*/, "");
      const imageUrl = String(q.ImageURL || "").trim();
      const imageHTML =
        imageUrl &&
        typeof globalScope.isSafeImageURL === "function" &&
        globalScope.isSafeImageURL(imageUrl)
          ? `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(cleanQuestionText)}" loading="lazy" decoding="async" class="block w-full max-w-2xl max-h-96 object-contain rounded-lg mt-3 mb-4">`
          : "";

      const isMultipleChoice = !getQuestionTypeMode(q).isIdent;
      const explanation = String(q.Explanation || "").trim();

      let showWrongForThisQ = state.prefs.qToggles?.[q.ID];
      if (showWrongForThisQ === undefined) showWrongForThisQ = globalShowWrong;

      const choicesHTML = showAnswers
        ? buildReviewChoicesHTML(q, Boolean(showWrongForThisQ), hideABCD)
        : "";

      html += `
            <div data-question-id="${escapeHTML(String(q.ID))}" data-review-index="${originalIndex}" class="review-question-card bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                <div class="flex flex-nowrap justify-between items-center gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                    <div class="flex min-w-0 items-center gap-2">
                        <span class="bg-brand-50 text-brand-600 text-xs px-2 py-1 rounded font-semibold dark:bg-brand-900/30 dark:text-white">Question ${originalIndex + 1}</span>
                    </div>

                        <div class="review-question-actions flex flex-nowrap shrink-0 gap-1 items-center">
                        ${
                          explanation && !showExplanations
                                ? `<button data-review-explanation-toggle data-action="toggleStudyExplanation" data-action-args='[{"__mrhActionArgument":"element"}]' data-action-stop-propagation="true" class="review-action-button review-explanation-action-button inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" aria-label="Show explanation" aria-expanded="false" title="Show explanation" type="button">
                              <i class="fa-solid fa-eye" aria-hidden="true"></i>
                                  <span class="review-explanation-action-label" data-explanation-action-label>Show Explanation</span>
                            </button>`
                            : ""
                        }
                        ${
                          isMultipleChoice
                                ? `<button data-review-choice-toggle data-action="toggleSpecificChoices" data-action-args="${escapeHTML(JSON.stringify([globalScope.encodeHandlerValue(String(q.ID))]))}" class="review-action-button review-choice-action-button inline-flex flex-shrink-0 items-center whitespace-nowrap text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" aria-label="${showWrongForThisQ ? "Hide Choices" : "Show Choices"}" title="${showWrongForThisQ ? "Hide Choices" : "Show Choices"}" type="button">
                                  ${showWrongForThisQ ? '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i><span class="review-choice-action-label ml-1">Hide Choices</span>' : '<i class="fa-solid fa-eye" aria-hidden="true"></i><span class="review-choice-action-label ml-1">Show Choices</span>'}
                            </button>`
                            : ""
                        }

                        <button type="button" data-review-favorite-toggle data-action="toggleQuestionFavorite" data-action-args="${escapeHTML(JSON.stringify([globalScope.encodeHandlerValue(String(q.ID))]))}" data-action-stop-propagation="true" class="${isQuestionFavorite ? "text-yellow-500" : "text-gray-400 hover:text-yellow-500"} text-xs font-bold flex items-center justify-center w-7 h-7 border border-gray-200 dark:border-gray-700 rounded-md shadow-sm active:scale-95 transition-all" title="${isQuestionFavorite ? "Remove from Favorites" : "Add to Favorites"}" aria-label="${isQuestionFavorite ? "Remove from Favorites" : "Add to Favorites"}" aria-pressed="${isQuestionFavorite}">
                            <i class="fa-solid fa-star"></i>
                        </button>

                    </div>
                </div>

                <p class="user-text-content font-medium text-gray-800 dark:text-gray-100 mb-2 text-lg">${formatQuestionText(cleanQuestionText)}</p>

                ${imageHTML}

                <div data-review-choices>${choicesHTML}</div>

                ${
                  explanation
                    ? `
                    <div data-review-explanation class="${showExplanations ? "" : "hidden"} user-text-content mt-4 text-sm text-gray-700 dark:text-gray-300 bg-blue-50 dark:bg-gray-900/50 p-3 rounded-lg border border-blue-100 dark:border-gray-700">
                        <strong class="text-blue-800 dark:text-blue-400"><i class="fa-solid fa-lightbulb mr-1"></i> Explanation:</strong>
                        <div class="mt-2 leading-relaxed">${formatQuestionText(explanation, { formatLists: false })}</div>
                    </div>
                `
                    : ""
                }
            </div>
        `;
    });

    if (showBottomNavigation) html += renderNavigation("bottom");

    if (pageSize === "All" && virtualEndIndex < filteredQuestions.length) {
      html += `<div aria-hidden="true" style="height: ${(filteredQuestions.length - virtualEndIndex) * REVIEW_ESTIMATED_CARD_HEIGHT}px"></div>`;
    }

    if (pageSize === "All") {
      const template = document.createElement("template");
      template.innerHTML = html;

      const fragment = document.createDocumentFragment();
      const existingCards = new Map(
        Array.from(container.querySelectorAll(".review-question-card"))
          .filter((card) => card.dataset.questionId)
          .map((card) => [card.dataset.questionId, card]),
      );

      Array.from(template.content.childNodes).forEach((node) => {
        if (!(node instanceof Element)) {
          fragment.appendChild(node.cloneNode(true));
          return;
        }

        const questionId = node.dataset.questionId;
        if (questionId && existingCards.has(questionId)) {
          const existingCard = existingCards.get(questionId);
          existingCard.replaceWith(node);
        }
        fragment.appendChild(node);
      });

      container.replaceChildren(fragment);
    } else if (layout === "single") {
      const host = document.createElement("div");
      host.innerHTML = html;
      const fragment = document.createDocumentFragment();
      Array.from(host.childNodes).forEach((node) =>
        fragment.appendChild(node),
      );
      container.replaceChildren(fragment);
    } else {
      const fragment = document.createDocumentFragment();
      const host = document.createElement("div");
      host.innerHTML = html;
      Array.from(host.childNodes).forEach((node) => fragment.appendChild(node));
      container.replaceChildren(fragment);
    }
    const navigation = navigate("deck-review");
    globalScope.updateSessionNavigationUrl?.(subject, "study");
    updateStudyProgressIndicator();

    if (!isVirtualScroll) {
      const requestedScrollPosition = pendingReviewScrollPosition;
      pendingReviewScrollPosition = null;
      if (
        reviewMainElement &&
        layout === "scroll" &&
        requestedScrollPosition
      ) {
        const restoreScrollPosition = () => {
          const scrollContainer = scrollReviewContent(
            requestedScrollPosition,
          );
          if (scrollContainer) {
            progress.scrollY = scrollContainer.scrollTop;
          }
          updateStudyProgressIndicator();
          saveState("prefs");
        };
        if (navigation && typeof navigation.then === "function") {
          navigation.then(restoreScrollPosition);
        } else {
          restoreScrollPosition();
        }
      } else if (
        reviewMainElement &&
        layout === "scroll" &&
        (progress.questionId || progress.scrollY)
      ) {
        const restoreScrollPosition = () =>
          requestAnimationFrame(() => {
            const questionCard = progress.questionId
              ? Array.from(
                  container.querySelectorAll(".review-question-card"),
                ).find(
                  (card) =>
                    String(card.dataset.questionId) ===
                    String(progress.questionId),
                )
              : null;
            const questionOffset =
              progress.questionScrollOffsets?.[progress.questionId];
            if (
              reviewMainElement &&
              questionCard &&
              Number.isFinite(questionOffset)
            ) {
              const mainTop = reviewMainElement.getBoundingClientRect().top;
              const cardTop = questionCard.getBoundingClientRect().top;
              reviewMainElement.scrollTop +=
                cardTop - mainTop - questionOffset;
            } else if (reviewMainElement) {
              reviewMainElement.scrollTop = progress.scrollY || 0;
            }
            updateStudyProgressIndicator();
          });
        if (navigation && typeof navigation.then === "function") {
          navigation.then(restoreScrollPosition);
        } else {
          restoreScrollPosition();
        }
      }
      if (typeof applyTitleMode === "function") applyTitleMode();
    }
  }

  if (typeof globalThis !== "undefined") {
  }

  function renderDeckReview(subject, questions, isVirtualScroll = false) {
    currentReviewSubject = subject;
    currentReviewQuestions = Array.isArray(questions) ? questions : [];

    return renderDeckReviewImplementation(
      subject,
      currentReviewQuestions,
      isVirtualScroll,
    );
  }

  function scrollReviewContent(position) {
    const main = reviewMainElement;
    const mainIsScrollable =
      main && main.scrollHeight > main.clientHeight + 1;
    const scrollContainer = mainIsScrollable
      ? main
      : document.scrollingElement || document.documentElement || document.body;
    if (!scrollContainer) return null;

    const top =
      position === "bottom"
        ? Math.max(
            0,
            scrollContainer.scrollHeight - scrollContainer.clientHeight,
          )
        : 0;
    const previousScrollBehavior = scrollContainer.style.scrollBehavior;
    scrollContainer.style.scrollBehavior = "auto";
    scrollContainer.scrollTop = top;
    scrollContainer.style.scrollBehavior = previousScrollBehavior;
    return scrollContainer;
  }

  function getOrderedReviewQuestions() {
    return derivedQuestionsCache?.questions === currentReviewQuestions
      ? derivedQuestionsCache.sortedQuestions
      : currentReviewQuestions;
  }

  function updateQuestionFavorite(questionId, isFavorite) {
    const normalizedId = String(questionId || "");
    if (!normalizedId) return false;

    if (getStudySetting("studyFilterMode") === "favorites") {
      const progress = state.prefs.studyProgress[currentReviewSubject];
      if (!isFavorite && progress?.questionId === normalizedId) {
        const favoriteQuestions = Array.isArray(
          state.prefs.favoriteQuestions,
        )
          ? state.prefs.favoriteQuestions
          : [];
        const remainingQuestions = currentReviewQuestions.filter((question) =>
          favoriteQuestions.some(
            (favoriteId) => String(favoriteId) === String(question.ID),
          ),
        );
        const previousIndex =
          derivedQuestionsCache?.questionIndexById.get(normalizedId) ??
          progress.index ??
          0;
        if (remainingQuestions.length) {
          const nextIndex = Math.min(previousIndex, remainingQuestions.length - 1);
          const nextQuestion = remainingQuestions[nextIndex];
          progress.index = nextIndex;
          progress.questionId = String(nextQuestion.ID);
          const pageSize = getStudySetting("studyPageSize") || 10;
          if (
            getStudySetting("studyLayout") !== "single" &&
            pageSize !== "All"
          ) {
            progress.page = Math.floor(nextIndex / pageSize) + 1;
          }
        } else {
          progress.index = 0;
          progress.page = 1;
          progress.scrollY = 0;
          delete progress.questionId;
        }
        markStudyProgressChanged(progress);
      }
      return false;
    }

    const container =
      reviewContainerElement ||
      (reviewContainerElement = document.getElementById("deck-review-cards"));
    const matchingCards = Array.from(
      container?.querySelectorAll(".review-question-card") || [],
    ).filter((card) => String(card.dataset.questionId) === normalizedId);
    matchingCards.forEach((card) => {
      const button = card.querySelector("[data-review-favorite-toggle]");
      if (!button) return;
      button.classList.toggle("text-yellow-500", isFavorite);
      button.classList.toggle("text-gray-400", !isFavorite);
      button.classList.toggle("hover:text-yellow-500", !isFavorite);
      const label = isFavorite ? "Remove from Favorites" : "Add to Favorites";
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(isFavorite));
      button.title = label;
    });
    return true;
  }

  function markStudyProgressChanged(progress) {
    if (progress && typeof progress === "object") {
      progress.updatedAt = Date.now();
    }
  }

  const saveState = globalScope.saveState;
  function getStudySetting(key) {
    return (
      globalScope.getDeckSessionSetting?.("study", key, currentReviewSubject) ??
      state.prefs[key]
    );
  }

  function changeStudyLayout(layout) {
    if (!(state && ["scroll", "single"].includes(layout))) return false;
    const resetPageSize =
      layout === "scroll" && Number(getStudySetting("studyPageSize")) === 1;
    if (
      globalScope.setDeckSessionSetting?.(
        "study",
        "studyLayout",
        layout,
        currentReviewSubject,
      ) !== true
    ) {
      if (typeof globalScope.showToast === "function") {
        globalScope.showToast(
          "Open a deck in Study Mode before changing this setting.",
          "warning",
        );
        return false;
      }
      throw new Error("Unable to save Study settings without an active deck.");
    }
    if (
      resetPageSize &&
      globalScope.setDeckSessionSetting?.(
        "study",
        "studyPageSize",
        10,
        currentReviewSubject,
      ) !== true
    ) {
      if (
        globalScope.setDeckSessionSetting(
          "study",
          "studyLayout",
          "single",
          currentReviewSubject,
        ) !== true
      ) {
        throw new Error("Unable to restore the Single Flashcard Study layout.");
      }
      const layoutSelect = document.getElementById("review-layout-select");
      if (layoutSelect) layoutSelect.value = "single";
      document
        .getElementById("review-per-page-container")
        ?.classList.add("hidden");
      if (typeof globalScope.showToast === "function") {
        globalScope.showToast(
          "Open a deck in Study Mode before changing this setting.",
          "warning",
        );
        return false;
      }
      throw new Error("Unable to save Study settings without an active deck.");
    }
    if (resetPageSize) {
      const pageSizeInput = document.getElementById("review-page-size-input");
      if (pageSizeInput) pageSizeInput.value = "10";
      if (state.prefs.studyProgress[currentReviewSubject]) {
        state.prefs.studyProgress[currentReviewSubject].page = 1;
        markStudyProgressChanged(
          state.prefs.studyProgress[currentReviewSubject],
        );
      }
    }
    if (
      layout === "single" &&
      !state.prefs.studyProgress[currentReviewSubject]
    ) {
      state.prefs.studyProgress[currentReviewSubject] = {
        page: 1,
        index: 0,
        scrollY: 0,
        updatedAt: Date.now(),
      };
    }
    const layoutSelect = document.getElementById("review-layout-select");
    if (layoutSelect) layoutSelect.value = layout;
    const perPageContainer = document.getElementById(
      "review-per-page-container",
    );
    perPageContainer?.classList.toggle("hidden", layout === "single");
    saveState();
    reRenderDeckReview();
    return true;
  }

  function toggleStudyExplanation(button) {
    const card = button?.closest?.(".review-question-card");
    const explanation = card?.querySelector("[data-review-explanation]");
    if (!button || !explanation) return false;

    const isHidden = explanation.classList.toggle("hidden");
    const toggles = card.querySelectorAll(
      "[data-review-explanation-toggle]",
    );
    toggles.forEach((toggle) => {
      const label = isHidden ? "Show explanation" : "Hide explanation";
      toggle.setAttribute("aria-expanded", String(!isHidden));
      toggle.setAttribute("aria-label", label);
      toggle.title = label;
      const actionLabel = toggle.querySelector("[data-explanation-action-label]");
      if (actionLabel) {
        actionLabel.textContent = isHidden
          ? "Show Explanation"
          : "Hide Explanation";
      }
    });
    return true;
  }

  function changeStudyPageSize(size) {
    const pageSizeInput = document.getElementById("review-page-size-input");
    const previousPageSize = getStudySetting("studyPageSize") || 10;
    const normalizedSize =
      size === "" ? 10 : size === "All" ? "All" : Number(size);
    if (
      normalizedSize !== "All" &&
      (!Number.isSafeInteger(normalizedSize) || normalizedSize < 1)
    ) {
      if (pageSizeInput) {
        pageSizeInput.setCustomValidity(
          "Enter a positive whole number of items per page.",
        );
        pageSizeInput.reportValidity();
      }
      return false;
    }
    if (pageSizeInput) pageSizeInput.setCustomValidity("");

    const shouldUseSingleLayout =
      normalizedSize === 1 && getStudySetting("studyLayout") !== "single";
    if (
      globalScope.setDeckSessionSetting?.(
        "study",
        "studyPageSize",
        normalizedSize,
        currentReviewSubject,
      ) !== true
    ) {
      if (typeof globalScope.showToast === "function") {
        globalScope.showToast(
          "Open a deck in Study Mode before changing this setting.",
          "warning",
        );
        return false;
      }
      throw new Error("Unable to save Study settings without an active deck.");
    }
    if (
      shouldUseSingleLayout &&
      globalScope.setDeckSessionSetting?.(
        "study",
        "studyLayout",
        "single",
        currentReviewSubject,
      ) !== true
    ) {
      if (
        globalScope.setDeckSessionSetting(
          "study",
          "studyPageSize",
          previousPageSize,
          currentReviewSubject,
        ) !== true
      ) {
        throw new Error("Unable to restore the previous Study page size.");
      }
      if (pageSizeInput)
        pageSizeInput.value =
          previousPageSize === "All" ? "" : String(previousPageSize);
      if (typeof globalScope.showToast === "function") {
        globalScope.showToast(
          "Open a deck in Study Mode before changing this setting.",
          "warning",
        );
        return false;
      }
      throw new Error("Unable to save Study settings without an active deck.");
    }
    if (
      normalizedSize === 1 &&
      !state.prefs.studyProgress[currentReviewSubject]
    ) {
      state.prefs.studyProgress[currentReviewSubject] = {
        page: 1,
        index: 0,
        scrollY: 0,
        updatedAt: Date.now(),
      };
    }
    if (state.prefs.studyProgress[currentReviewSubject]) {
      state.prefs.studyProgress[currentReviewSubject].page = 1;
      markStudyProgressChanged(
        state.prefs.studyProgress[currentReviewSubject],
      );
    }
    if (normalizedSize === 1) {
      const layoutSelect = document.getElementById("review-layout-select");
      if (layoutSelect) layoutSelect.value = "single";
      document
        .getElementById("review-per-page-container")
        ?.classList.add("hidden");
    }
    saveState();
    reRenderDeckReview();
    return true;
  }

  function changeStudyPage(delta, navigationPosition = "top") {
    const progress = state.prefs.studyProgress[currentReviewSubject];
    if (!progress) return;
    const currentPage = progress.page || 1;
    const pageSize = getStudySetting("studyPageSize") || 10;
    const totalPages =
      pageSize === "All"
        ? 1
        : Math.max(
            1,
            Math.ceil(getOrderedReviewQuestions().length / Number(pageSize)),
          );
    if (delta > 0 && currentPage >= totalPages)
      return returnFromStudyMode(
        "You are on the last page. Do you want to exit this review session? Your progress will be saved.",
        "Exit Review Session",
      );
    if (delta < 0 && currentPage <= 1) {
      void returnFromStudyMode();
      return;
    }
    const nextPage = Math.max(1, currentPage + delta);
    if (nextPage === currentPage) return;
    progress.page = nextPage;
    if (pageSize !== "All") {
      const targetQuestion =
        getOrderedReviewQuestions()[(nextPage - 1) * pageSize];
      if (targetQuestion) {
        progress.index = (nextPage - 1) * pageSize;
        progress.questionId = String(targetQuestion.ID);
      }
    }
    if (typeof window !== "undefined") clearTimeout(window.scrollSaveTimeout);
    progress.scrollY = 0;
    markStudyProgressChanged(progress);
    pendingReviewScrollPosition =
      delta > 0 || navigationPosition !== "bottom" ? "top" : "bottom";
    saveState("prefs");
    reRenderDeckReview();
  }

  async function returnFromStudyMode(
    message = "Do you want to return to the Main Menu? Your study progress will be saved.",
    title = "Return to Main Menu",
  ) {
    const confirmed = await globalScope.requestConfirmation?.(
      message,
      title,
    );
    if (!confirmed) return false;

    updateStudyProgressIndicator();
    const progress = state.prefs.studyProgress[currentReviewSubject];
    if (progress && reviewMainElement) {
      progress.scrollY = reviewMainElement.scrollTop;
      markStudyProgressChanged(progress);
    }
    const saved = await saveState("prefs");
    if (saved === false) {
      globalScope.showToast?.(
        "Your study progress could not be saved. Please try again.",
        "error",
      );
      return false;
    }

    if (typeof globalScope.navigate === "function") {
      return globalScope.navigate("dashboard");
    }
    return false;
  }

  function changeStudyIndex(delta) {
    const progress = state.prefs.studyProgress[currentReviewSubject];
    if (!progress) return;
    const orderedQuestions = getOrderedReviewQuestions();
    const maxIndex = Math.max(0, orderedQuestions.length - 1);
    progress.index = Math.max(
      0,
      Math.min(maxIndex, (progress.index || 0) + delta),
    );
    const targetQuestion = orderedQuestions[progress.index];
    if (targetQuestion) {
      progress.questionId = String(targetQuestion.ID);
    }
    markStudyProgressChanged(progress);
    renderDeckReview(currentReviewSubject, currentReviewQuestions);
    saveState("prefs");
  }

  function jumpToStudyPage(pageNumber) {
    const progress = state.prefs.studyProgress[currentReviewSubject];
    const page = parseInt(pageNumber, 10);
    if (!progress || Number.isNaN(page)) return;
    progress.page = Math.max(1, page);
    const pageSize = getStudySetting("studyPageSize") || 10;
    if (pageSize !== "All") {
      const targetIndex = (progress.page - 1) * pageSize;
      const targetQuestion = getOrderedReviewQuestions()[targetIndex];
      if (targetQuestion) {
        progress.index = targetIndex;
        progress.questionId = String(targetQuestion.ID);
      }
    }
    if (typeof window !== "undefined") clearTimeout(window.scrollSaveTimeout);
    progress.scrollY = 0;
    markStudyProgressChanged(progress);
    pendingReviewScrollPosition = "top";
    saveState("prefs");
    reRenderDeckReview();
  }

  function cleanup() {
    if (reviewRenderFrame !== null) {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(reviewRenderFrame);
      }
      lifecycle.clearTimeout(reviewRenderFrame);
      reviewRenderFrame = null;
    }
    if (virtualReviewScrollFrame !== null) {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(virtualReviewScrollFrame);
      }
      lifecycle.clearTimeout(virtualReviewScrollFrame);
      virtualReviewScrollFrame = null;
    }
  }

  // ===================== MODULE EXPORT =====================
  const DeckReviewCore = {
    renderDeckReview,
    reRenderDeckReview,
    updateQuestionFavorite,
    updateQuestionChoices,
    updateStudyProgressIndicator,
    scheduleVirtualReviewRender,
    changeStudyLayout,
    changeStudyPageSize,
    toggleStudyExplanation,
    changeStudyPage,
    changeStudyIndex,
    jumpToStudyPage,
    returnFromStudyMode,
    cleanup,
    renderDeckReviewImplementation,
    // Expose state accessors
    getCurrentReviewSubject: () => currentReviewSubject,
    getCurrentReviewQuestions: () => currentReviewQuestions,
  };

  globalScope.LifecycleUtils?.registerCleanup(cleanup);

  // Export to global scope
  globalScope.DeckReviewCore = DeckReviewCore;

  // Export individual functions for backward compatibility
  globalScope.renderDeckReview = renderDeckReview;
  globalScope.reRenderDeckReview = reRenderDeckReview;
  globalScope.updateStudyProgressIndicator = updateStudyProgressIndicator;
  globalScope.scheduleVirtualReviewRender = scheduleVirtualReviewRender;
  globalScope.changeStudyLayout = changeStudyLayout;
  globalScope.changeStudyPageSize = changeStudyPageSize;
  globalScope.toggleStudyExplanation = toggleStudyExplanation;
  globalScope.changeStudyPage = changeStudyPage;
  globalScope.changeStudyIndex = changeStudyIndex;
  globalScope.jumpToStudyPage = jumpToStudyPage;
  globalScope.returnFromStudyMode = returnFromStudyMode;

  // For Node.js testing - export as CommonJS if in test environment
  if (typeof module !== "undefined" && module.exports) {
    module.exports = DeckReviewCore;
  }
})(
  typeof globalScope !== "undefined"
    ? globalScope
    : typeof globalThis !== "undefined"
      ? globalThis
      : this,
);
