export const TOTAL_CARDS = 726;
export const TARGET_CARD = 482;
export const PACK_SIZE = 15;
export const STARTING_PACKS = 10;
export const STORAGE_VERSION = 1;

export function createNewState() {
  return {
    version: STORAGE_VERSION,
    status: "playing",
    packsAvailable: STARTING_PACKS,
    packsOpened: 0,
    duplicates: 0,
    cardsRevealed: 0,
    runsCompleted: 0,
    seenCounts: {},
    runPool: [],
    currentPack: null,
    currentIndex: 0,
    lastCard: null,
    lastWasDuplicate: false,
    lastRun: null,
    eventMessage: "Find card #482 before your supply runs dry."
  };
}

export function createPack(random = Math.random) {
  const numbers = Array.from({ length: TOTAL_CARDS }, (_, index) => index + 1);

  // Partial Fisher-Yates shuffle: only shuffle the 15 positions we need.
  for (let index = 0; index < PACK_SIZE; index += 1) {
    const swapIndex = index + Math.floor(random() * (TOTAL_CARDS - index));
    [numbers[index], numbers[swapIndex]] = [numbers[swapIndex], numbers[index]];
  }

  return numbers.slice(0, PACK_SIZE);
}

export function openPack(state, random = Math.random) {
  if (state.status !== "playing" || state.currentPack || state.packsAvailable < 1) {
    return { opened: false };
  }

  state.packsAvailable -= 1;
  state.packsOpened += 1;
  state.currentPack = createPack(random);
  state.currentIndex = 0;
  state.lastCard = null;
  state.lastWasDuplicate = false;
  state.lastRun = null;
  state.eventMessage = `Pack ${state.packsOpened} is open. Reveal the first card.`;

  return { opened: true, pack: [...state.currentPack] };
}

export function revealNextCard(state, targetCard = TARGET_CARD) {
  if (
    state.status !== "playing" ||
    !state.currentPack ||
    state.currentIndex >= state.currentPack.length
  ) {
    return { revealed: false };
  }

  const cardNumber = state.currentPack[state.currentIndex];
  state.currentIndex += 1;
  state.cardsRevealed += 1;

  const previousCount = Number(state.seenCounts[cardNumber] || 0);
  const isDuplicate = previousCount > 0;
  state.seenCounts[cardNumber] = previousCount + 1;

  let completedRun = null;
  if (isDuplicate) {
    state.duplicates += 1;
    state.eventMessage = `Duplicate #${padCardNumber(cardNumber)} added to the trade pile.`;
  } else {
    state.runPool.push(cardNumber);
    state.runPool.sort((a, b) => a - b);
    completedRun = findCompletedRun(state.runPool, cardNumber);

    if (completedRun) {
      const consumed = new Set(completedRun);
      state.runPool = state.runPool.filter((number) => !consumed.has(number));
      state.packsAvailable += 1;
      state.runsCompleted += 1;
      state.eventMessage = `${formatRun(completedRun)} completes a run — bonus pack earned!`;
    } else {
      state.eventMessage = `New card #${padCardNumber(cardNumber)} can help build a five-card run.`;
    }
  }

  state.lastCard = cardNumber;
  state.lastWasDuplicate = isDuplicate;
  state.lastRun = completedRun;

  const isTarget = cardNumber === targetCard;
  if (isTarget) {
    state.status = "won";
    state.eventMessage = `You found #${padCardNumber(cardNumber)} Rickey Henderson!`;
  }

  return {
    revealed: true,
    cardNumber,
    isDuplicate,
    completedRun,
    isTarget,
    packComplete: state.currentIndex >= state.currentPack.length
  };
}

export function finishPack(state) {
  if (!state.currentPack || state.currentIndex < state.currentPack.length) {
    return { finished: false, lost: false };
  }

  state.currentPack = null;
  state.currentIndex = 0;
  state.lastCard = null;
  state.lastWasDuplicate = false;
  state.lastRun = null;

  const lost = checkForLoss(state);
  if (!lost) {
    if (state.packsAvailable > 0) {
      state.eventMessage = `${state.packsAvailable} pack${state.packsAvailable === 1 ? "" : "s"} ready to open.`;
    } else {
      state.eventMessage = "No packs remain. Trade duplicates to continue.";
    }
  }

  return { finished: true, lost };
}

export function tradeDuplicates(state, duplicateCost, packReward) {
  if (
    state.status !== "playing" ||
    !Number.isInteger(duplicateCost) ||
    !Number.isInteger(packReward) ||
    duplicateCost < 1 ||
    packReward < 1 ||
    state.duplicates < duplicateCost
  ) {
    return { traded: false };
  }

  state.duplicates -= duplicateCost;
  state.packsAvailable += packReward;
  state.eventMessage = `Traded ${duplicateCost} duplicates for ${packReward} pack${packReward === 1 ? "" : "s"}.`;

  return { traded: true };
}

export function checkForLoss(state) {
  if (
    state.status === "playing" &&
    !state.currentPack &&
    state.packsAvailable === 0 &&
    state.duplicates < 10
  ) {
    state.status = "lost";
    state.eventMessage = "No packs and not enough duplicates for a trade. The run is over.";
    return true;
  }

  return false;
}

export function findCompletedRun(runPool, newlyAddedCard) {
  const available = new Set(runPool);
  const earliestStart = Math.max(1, newlyAddedCard - 4);
  const latestStart = Math.min(newlyAddedCard, TOTAL_CARDS - 4);

  for (let start = earliestStart; start <= latestStart; start += 1) {
    const candidate = Array.from({ length: 5 }, (_, index) => start + index);
    if (candidate.every((number) => available.has(number))) {
      return candidate;
    }
  }

  return null;
}

export function getClosestRuns(runPool, limit = 3) {
  const available = new Set(runPool);
  const candidates = [];

  for (let start = 1; start <= TOTAL_CARDS - 4; start += 1) {
    const numbers = Array.from({ length: 5 }, (_, index) => start + index);
    const hits = numbers.reduce(
      (total, number) => total + (available.has(number) ? 1 : 0),
      0
    );

    if (hits >= 2) {
      candidates.push({ start, numbers, hits });
    }
  }

  candidates.sort((a, b) => b.hits - a.hits || a.start - b.start);

  // Avoid showing three nearly identical overlapping windows when possible.
  const selected = [];
  for (const candidate of candidates) {
    const heavilyOverlaps = selected.some((existing) => {
      const overlap = candidate.numbers.filter((number) => existing.numbers.includes(number)).length;
      return overlap >= 4;
    });

    if (!heavilyOverlaps) {
      selected.push(candidate);
    }
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

export function normalizeState(value) {
  if (!value || typeof value !== "object" || value.version !== STORAGE_VERSION) {
    return createNewState();
  }

  const state = createNewState();
  state.status = ["playing", "won", "lost"].includes(value.status) ? value.status : "playing";
  state.packsAvailable = safeNonNegativeInteger(value.packsAvailable, STARTING_PACKS);
  state.packsOpened = safeNonNegativeInteger(value.packsOpened, 0);
  state.duplicates = safeNonNegativeInteger(value.duplicates, 0);
  state.cardsRevealed = safeNonNegativeInteger(value.cardsRevealed, 0);
  state.runsCompleted = safeNonNegativeInteger(value.runsCompleted, 0);
  state.seenCounts = normalizeSeenCounts(value.seenCounts);
  state.runPool = normalizeNumberArray(value.runPool);
  state.currentPack = Array.isArray(value.currentPack)
    ? normalizePack(value.currentPack)
    : null;
  state.currentIndex = state.currentPack
    ? Math.min(safeNonNegativeInteger(value.currentIndex, 0), state.currentPack.length)
    : 0;
  state.lastCard = isValidCardNumber(value.lastCard) ? value.lastCard : null;
  state.lastWasDuplicate = Boolean(value.lastWasDuplicate);
  state.lastRun = Array.isArray(value.lastRun) ? normalizeNumberArray(value.lastRun).slice(0, 5) : null;
  state.eventMessage = typeof value.eventMessage === "string"
    ? value.eventMessage.slice(0, 240)
    : state.eventMessage;

  return state;
}

export function padCardNumber(number) {
  return String(number).padStart(3, "0");
}

export function formatRun(run) {
  return `#${padCardNumber(run[0])}–#${padCardNumber(run[run.length - 1])}`;
}

function normalizeSeenCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized = {};
  for (const [key, count] of Object.entries(value)) {
    const number = Number(key);
    if (isValidCardNumber(number)) {
      normalized[number] = Math.max(1, safeNonNegativeInteger(count, 1));
    }
  }
  return normalized;
}

function normalizeNumberArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter(isValidCardNumber))].sort((a, b) => a - b);
}

function normalizePack(value) {
  const seen = new Set();
  const normalized = [];

  for (const number of value) {
    if (isValidCardNumber(number) && !seen.has(number)) {
      seen.add(number);
      normalized.push(number);
    }
    if (normalized.length >= PACK_SIZE) {
      break;
    }
  }

  return normalized.length > 0 ? normalized : null;
}

function isValidCardNumber(value) {
  return Number.isInteger(value) && value >= 1 && value <= TOTAL_CARDS;
}

function safeNonNegativeInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}
