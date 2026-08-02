import {
  ONE_PACK_TRADE_COST,
  STARTING_PACKS,
  THREE_PACK_TRADE_COST,
  createNewState,
  finishPack,
  formatRun,
  getClosestRuns,
  normalizeState,
  openPack,
  padCardNumber,
  revealNextCard,
  tradeDuplicates
} from "./game-core.js";

const STORAGE_KEY = "rickeyWaxPackSolitaire.v1";

const elements = {
  packsStat: document.querySelector("#packsStat"),
  duplicatesStat: document.querySelector("#duplicatesStat"),
  openedStat: document.querySelector("#openedStat"),
  runsStat: document.querySelector("#runsStat"),
  playHeading: document.querySelector("#playHeading"),
  packProgress: document.querySelector("#packProgress"),
  stageButton: document.querySelector("#stageButton"),
  packView: document.querySelector("#packView"),
  cardView: document.querySelector("#cardView"),
  cardBack: document.querySelector("#cardBack"),
  cardFace: document.querySelector("#cardFace"),
  cardImage: document.querySelector("#cardImage"),
  cardFallback: document.querySelector("#cardFallback"),
  fallbackNumber: document.querySelector("#fallbackNumber"),
  fallbackName: document.querySelector("#fallbackName"),
  cardNumber: document.querySelector("#cardNumber"),
  cardName: document.querySelector("#cardName"),
  cardDescription: document.querySelector("#cardDescription"),
  duplicateBadge: document.querySelector("#duplicateBadge"),
  targetBadge: document.querySelector("#targetBadge"),
  stageInstruction: document.querySelector("#stageInstruction"),
  eventMessage: document.querySelector("#eventMessage"),
  tradeTenButton: document.querySelector("#tradeTenButton"),
  tradeTwentyFiveButton: document.querySelector("#tradeTwentyFiveButton"),
  onePackTradeCost: document.querySelector("#onePackTradeCost"),
  threePackTradeCost: document.querySelector("#threePackTradeCost"),
  rulesStartingPacks: document.querySelector("#rulesStartingPacks"),
  rulesOnePackTradeCost: document.querySelector("#rulesOnePackTradeCost"),
  rulesThreePackTradeCost: document.querySelector("#rulesThreePackTradeCost"),
  runBoard: document.querySelector("#runBoard"),
  rulesButton: document.querySelector("#rulesButton"),
  newGameButton: document.querySelector("#newGameButton"),
  rulesDialog: document.querySelector("#rulesDialog"),
  resultDialog: document.querySelector("#resultDialog"),
  resultBurst: document.querySelector("#resultBurst"),
  resultEyebrow: document.querySelector("#resultEyebrow"),
  resultTitle: document.querySelector("#resultTitle"),
  resultText: document.querySelector("#resultText"),
  resultPacks: document.querySelector("#resultPacks"),
  resultCards: document.querySelector("#resultCards"),
  resultRuns: document.querySelector("#resultRuns"),
  playAgainButton: document.querySelector("#playAgainButton")
};

let cardData = [];
let cardsByNumber = new Map();
let state = loadState();
let resultTimer = null;

boot();

async function boot() {
  try {
    const response = await fetch("data/cards.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Checklist request failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload.cards) || payload.cards.length !== 726) {
      throw new Error("The checklist must contain exactly 726 cards.");
    }

    cardData = payload.cards;
    cardsByNumber = new Map(cardData.map((card) => [card.number, card]));
    bindEvents();
    renderSettingsText();
    render();

    if (state.status !== "playing") {
      showResult();
    }
  } catch (error) {
    console.error(error);
    elements.stageButton.disabled = true;
    elements.playHeading.textContent = "Checklist could not load";
    elements.stageInstruction.textContent = "Serve this folder from a web server instead of opening index.html directly.";
    elements.eventMessage.textContent = "Try: python -m http.server 8000, then open http://localhost:8000";
    elements.eventMessage.classList.add("is-error");
  }
}

function bindEvents() {
  elements.stageButton.addEventListener("click", handleStageClick);
  elements.tradeTenButton.addEventListener("click", () => handleTrade(ONE_PACK_TRADE_COST, 1));
  elements.tradeTwentyFiveButton.addEventListener("click", () => handleTrade(THREE_PACK_TRADE_COST, 3));

  elements.rulesButton.addEventListener("click", () => elements.rulesDialog.showModal());
  elements.newGameButton.addEventListener("click", () => {
    const shouldReset = window.confirm("Start a new game? Your current run will be erased.");
    if (shouldReset) {
      resetGame();
    }
  });

  elements.playAgainButton.addEventListener("click", () => {
    elements.resultDialog.close();
    resetGame();
  });

  elements.cardImage.addEventListener("load", () => {
    elements.cardImage.hidden = false;
    elements.cardFallback.hidden = true;
  });

  elements.cardImage.addEventListener("error", () => {
    elements.cardImage.hidden = true;
    elements.cardFallback.hidden = false;
  });
}

function handleStageClick() {
  if (state.status !== "playing") {
    showResult();
    return;
  }

  if (!state.currentPack) {
    if (state.packsAvailable < 1) {
      state.eventMessage = "Trade duplicates for a pack to keep playing.";
      persistAndRender();
      pulse(elements.tradeTenButton);
      return;
    }

    openPack(state);
    const result = revealNextCard(state);
    persistAndRender();
    animateStage(result.isTarget ? "is-target" : "is-revealing");

    if (result.completedRun) {
      pulse(elements.packsStat.closest(".stat-card"));
    }

    if (result.isTarget) {
      window.clearTimeout(resultTimer);
      resultTimer = window.setTimeout(showResult, 700);
    }
    return;
  }

  if (state.currentIndex < state.currentPack.length) {
    const result = revealNextCard(state);
    persistAndRender();
    animateStage(result.isTarget ? "is-target" : "is-revealing");

    if (result.completedRun) {
      pulse(elements.packsStat.closest(".stat-card"));
    }

    if (result.isTarget) {
      window.clearTimeout(resultTimer);
      resultTimer = window.setTimeout(showResult, 700);
    }
    return;
  }

  const result = finishPack(state);
  persistAndRender();
  if (result.lost) {
    showResult();
  }
}

function handleTrade(cost, reward) {
  const result = tradeDuplicates(state, cost, reward);
  if (!result.traded) {
    return;
  }

  persistAndRender();
  pulse(elements.packsStat.closest(".stat-card"));
  pulse(elements.duplicatesStat.closest(".stat-card"));
}

function render() {
  renderStats();
  renderStage();
  renderTrades();
  renderRuns();
  elements.eventMessage.textContent = state.eventMessage;
}

function renderStats() {
  elements.packsStat.textContent = state.packsAvailable;
  elements.duplicatesStat.textContent = state.duplicates;
  elements.openedStat.textContent = state.packsOpened;
  elements.runsStat.textContent = state.runsCompleted;
}

function renderStage() {
  const hasPack = Array.isArray(state.currentPack);
  const packComplete = hasPack && state.currentIndex >= state.currentPack.length;

  if (!hasPack) {
    show(elements.packView);
    hide(elements.cardView);
    elements.packProgress.textContent = state.packsAvailable > 0 ? "Ready" : "No packs";
    elements.playHeading.textContent = state.status === "playing" ? "Open the next pack" : "Run complete";
    elements.stageButton.setAttribute("aria-label", state.packsAvailable > 0 ? "Open a wax pack" : "No pack available");

    if (state.status === "lost") {
      elements.stageInstruction.textContent = "The run is over. Tap New Game to try again.";
    } else if (state.status === "won") {
      elements.stageInstruction.textContent = "Rickey found! Tap to see your result.";
    } else if (state.packsAvailable > 0) {
      elements.stageInstruction.textContent = `You have ${state.packsAvailable} pack${state.packsAvailable === 1 ? "" : "s"}. Tap the wrapper to continue.`;
    } else {
      elements.stageInstruction.textContent = "Trade duplicates to get another pack.";
    }
    return;
  }

  hide(elements.packView);
  show(elements.cardView);
  elements.playHeading.textContent = `Pack ${state.packsOpened}`;
  elements.packProgress.textContent = `${state.currentIndex} / ${state.currentPack.length}`;

  if (state.currentIndex === 0 || state.lastCard === null) {
    show(elements.cardBack);
    hide(elements.cardFace);
    elements.stageInstruction.textContent = "Tap the card stack to reveal card 1 of 15.";
    elements.stageButton.setAttribute("aria-label", "Reveal card 1 of 15");
    return;
  }

  hide(elements.cardBack);
  show(elements.cardFace);
  renderCard(state.lastCard);

  if (state.status === "won") {
    elements.stageInstruction.textContent = "You found Rickey Henderson!";
    elements.stageButton.setAttribute("aria-label", "Show winning result");
  } else if (packComplete) {
    elements.stageInstruction.textContent = "Pack complete. Tap to return to the unopened packs.";
    elements.stageButton.setAttribute("aria-label", "Finish this pack");
  } else {
    const nextPosition = state.currentIndex + 1;
    elements.stageInstruction.textContent = `Tap to reveal card ${nextPosition} of ${state.currentPack.length}.`;
    elements.stageButton.setAttribute("aria-label", `Reveal card ${nextPosition} of ${state.currentPack.length}`);
  }
}

function renderCard(number) {
  const card = cardsByNumber.get(number);
  if (!card) {
    return;
  }

  elements.cardImage.hidden = true;
  elements.cardFallback.hidden = false;
  elements.cardImage.src = card.image;
  elements.cardImage.alt = `${card.numberLabel} ${card.name}${card.description ? `, ${card.description}` : ""}`;

  elements.fallbackNumber.textContent = `#${card.numberLabel}`;
  elements.fallbackName.textContent = card.name;
  elements.cardNumber.textContent = `#${card.numberLabel}`;
  elements.cardName.textContent = card.name;
  elements.cardDescription.textContent = card.description;
  elements.cardDescription.hidden = !card.description;
  elements.duplicateBadge.hidden = !state.lastWasDuplicate;
  elements.targetBadge.hidden = !card.target;
  elements.cardFace.classList.toggle("is-duplicate", state.lastWasDuplicate);
  elements.cardFace.classList.toggle("is-target", card.target);
}

function renderSettingsText() {
  elements.onePackTradeCost.textContent = ONE_PACK_TRADE_COST;
  elements.threePackTradeCost.textContent = THREE_PACK_TRADE_COST;
  elements.rulesStartingPacks.textContent = STARTING_PACKS;
  elements.rulesOnePackTradeCost.textContent = ONE_PACK_TRADE_COST;
  elements.rulesThreePackTradeCost.textContent = THREE_PACK_TRADE_COST;
}

function renderTrades() {
  const disabled = state.status !== "playing";
  const onePackShortfall = ONE_PACK_TRADE_COST - state.duplicates;
  const threePackShortfall = THREE_PACK_TRADE_COST - state.duplicates;

  elements.tradeTenButton.disabled =
    disabled || state.duplicates < ONE_PACK_TRADE_COST;

  elements.tradeTwentyFiveButton.disabled =
    disabled || state.duplicates < THREE_PACK_TRADE_COST;

  elements.tradeTenButton.setAttribute(
    "aria-label",
    state.duplicates < ONE_PACK_TRADE_COST
      ? `Need ${onePackShortfall} more duplicate${onePackShortfall === 1 ? "" : "s"} to trade for one pack`
      : `Trade ${ONE_PACK_TRADE_COST} duplicates for one pack`
  );

  elements.tradeTwentyFiveButton.setAttribute(
    "aria-label",
    state.duplicates < THREE_PACK_TRADE_COST
      ? `Need ${threePackShortfall} more duplicate${threePackShortfall === 1 ? "" : "s"} to trade for three packs`
      : `Trade ${THREE_PACK_TRADE_COST} duplicates for three packs`
  );
}

function renderRuns() {
  const runs = getClosestRuns(state.runPool, 3);
  elements.runBoard.replaceChildren();

  if (runs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "run-empty";
    empty.textContent = state.runPool.length === 0
      ? "Reveal unique cards to start building runs."
      : `${state.runPool.length} unique number${state.runPool.length === 1 ? " is" : "s are"} waiting for neighbors.`;
    elements.runBoard.append(empty);
    return;
  }

  const available = new Set(state.runPool);
  for (const run of runs) {
    const row = document.createElement("div");
    row.className = "run-row";

    const label = document.createElement("span");
    label.className = "run-label";
    label.textContent = `${run.hits}/5`;
    label.setAttribute("aria-label", `${run.hits} of 5 cards found for run ${formatRun(run.numbers)}`);
    row.append(label);

    const slots = document.createElement("div");
    slots.className = "run-slots";
    for (const number of run.numbers) {
      const slot = document.createElement("span");
      slot.className = `run-slot ${available.has(number) ? "is-found" : "is-missing"}`;
      slot.textContent = padCardNumber(number);
      slots.append(slot);
    }
    row.append(slots);
    elements.runBoard.append(row);
  }
}

function showResult() {
  window.clearTimeout(resultTimer);
  resultTimer = null;

  const won = state.status === "won";
  elements.resultDialog.classList.toggle("is-win", won);
  elements.resultBurst.textContent = won ? "★" : "×";
  elements.resultEyebrow.textContent = won ? "CHASE COMPLETE" : "RUN COMPLETE";
  elements.resultTitle.textContent = won ? "You found Rickey!" : "The packs ran out";
  elements.resultText.textContent = won
    ? `Card #482 appeared after ${state.packsOpened} pack${state.packsOpened === 1 ? "" : "s"}.`
    : `You survived ${state.packsOpened} pack${state.packsOpened === 1 ? "" : "s"} without finding #482.`;
  elements.resultPacks.textContent = state.packsOpened;
  elements.resultCards.textContent = state.cardsRevealed;
  elements.resultRuns.textContent = state.runsCompleted;

  if (!elements.resultDialog.open) {
    elements.resultDialog.showModal();
  }
}

function resetGame() {
  window.clearTimeout(resultTimer);
  resultTimer = null;
  state = createNewState();
  saveState();
  render();
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createNewState();
  } catch (error) {
    console.warn("Could not restore the saved game.", error);
    return createNewState();
  }
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Could not save the current game.", error);
  }
}

function persistAndRender() {
  saveState();
  render();
}

function show(element) {
  element.hidden = false;
}

function hide(element) {
  element.hidden = true;
}

function animateStage(className) {
  elements.stageButton.classList.remove("is-opening", "is-revealing", "is-target");
  void elements.stageButton.offsetWidth;
  elements.stageButton.classList.add(className);
  window.setTimeout(() => elements.stageButton.classList.remove(className), 460);
}

function pulse(element) {
  if (!element) {
    return;
  }
  element.classList.remove("is-pulsing");
  void element.offsetWidth;
  element.classList.add("is-pulsing");
  window.setTimeout(() => element.classList.remove("is-pulsing"), 520);
}
