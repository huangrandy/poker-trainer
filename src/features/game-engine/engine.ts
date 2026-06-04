import { createStandardDeck, drawCards, shuffleDeck } from "../../lib/poker/deck";
import type {
  ActionRecord,
  GameState,
  LegalAction,
  PlayerAction,
  PlayerState,
  SeatIndex,
} from "./types";

type StartHandOptions = {
  random?: () => number;
};

function clonePlayer(player: PlayerState): PlayerState {
  return {
    ...player,
    holeCards: [...player.holeCards],
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map(clonePlayer),
    board: [...state.board],
    deck: {
      ...state.deck,
      cards: [...state.deck.cards],
    },
    betting: {
      ...state.betting,
    },
    pot: {
      mainPot: state.pot.mainPot,
      sidePots: state.pot.sidePots.map((sidePot) => ({
        amount: sidePot.amount,
        eligiblePlayerIds: [...sidePot.eligiblePlayerIds],
      })),
    },
    actionHistory: state.actionHistory.map((record) => ({
      ...record,
    })),
  };
}

function getPlayerById(state: GameState, playerId: string): PlayerState {
  const player = state.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    throw new Error(`Unknown player: ${playerId}`);
  }

  return player;
}

function getPlayerBySeatIndex(state: GameState, seatIndex: SeatIndex): PlayerState | undefined {
  return state.players.find((player) => player.seatIndex === seatIndex);
}

function getOrderedActiveSeatIndexes(state: GameState): SeatIndex[] {
  return state.players
    .filter((player) => player.status !== "out" && player.stack > 0)
    .map((player) => player.seatIndex)
    .sort((left, right) => left - right);
}

function getEligibleActingSeatIndexes(state: GameState): SeatIndex[] {
  return state.players
    .filter((player) => player.status === "active")
    .map((player) => player.seatIndex)
    .sort((left, right) => left - right);
}

function getContendingPlayers(state: GameState): PlayerState[] {
  return state.players.filter((player) => player.status !== "folded" && player.status !== "out");
}

function getNextSeatIndex(seatIndexes: SeatIndex[], currentSeatIndex: SeatIndex | null): SeatIndex | null {
  if (seatIndexes.length === 0) {
    return null;
  }

  if (currentSeatIndex === null) {
    return seatIndexes[0];
  }

  const currentIndex = seatIndexes.indexOf(currentSeatIndex);

  if (currentIndex === -1) {
    return seatIndexes[0];
  }

  return seatIndexes[(currentIndex + 1) % seatIndexes.length];
}

function getPostBlindAmount(player: PlayerState, amount: number): number {
  return Math.min(player.stack, amount);
}

function getStreetCardCount(street: GameState["street"]): number {
  if (street === "flop") {
    return 3;
  }

  if (street === "turn" || street === "river") {
    return 1;
  }

  return 0;
}

function getNextStreet(street: GameState["street"]): GameState["street"] {
  if (street === "not_started") {
    return "preflop";
  }

  if (street === "preflop") {
    return "flop";
  }

  if (street === "flop") {
    return "turn";
  }

  if (street === "turn") {
    return "river";
  }

  if (street === "river") {
    return "showdown";
  }

  return "hand_complete";
}

function getPostflopFirstActorSeatIndex(state: GameState): SeatIndex | null {
  const activeSeatIndexes = getEligibleActingSeatIndexes(state);

  if (activeSeatIndexes.length === 0) {
    return null;
  }

  const buttonSeatIndex = state.buttonSeatIndex ?? state.dealerSeatIndex;

  if (buttonSeatIndex === null) {
    return activeSeatIndexes[0];
  }

  if (activeSeatIndexes.length === 2 && activeSeatIndexes.includes(buttonSeatIndex)) {
    return buttonSeatIndex;
  }

  return getNextSeatIndex(activeSeatIndexes, buttonSeatIndex);
}

function drawCommunityCards(state: GameState, count: number): GameState {
  if (count === 0) {
    return state;
  }

  const { cards, deck } = drawCards(state.deck, count);

  return {
    ...state,
    board: [...state.board, ...cards],
    deck,
  };
}

function resetStreetBetting(state: GameState): void {
  for (const player of state.players) {
    if (player.status !== "out") {
      player.currentStreetBet = 0;
      player.hasActedThisStreet = false;
    }
  }

  state.betting.currentBet = 0;
  state.betting.minRaiseTo = state.config.blinds.bigBlind;
  state.betting.lastAggressorSeatIndex = null;
  state.betting.currentActorSeatIndex = null;
}

function advanceToNextStreet(state: GameState): GameState {
  const nextState = cloneState(state);
  const nextStreet = getNextStreet(nextState.street);

  nextState.street = nextStreet;
  resetStreetBetting(nextState);

  const cardCount = getStreetCardCount(nextStreet);
  if (cardCount > 0) {
    const withBoard = drawCommunityCards(nextState, cardCount);
    nextState.board = withBoard.board;
    nextState.deck = withBoard.deck;
  }

  nextState.actionHistory = [
    ...nextState.actionHistory,
    createActionRecord(nextState, {
      type: "deal_next_street",
      playerId: null,
    }),
  ];

  return nextState;
}

function finishHandAtShowdown(state: GameState): GameState {
  const nextState = cloneState(state);
  nextState.street = "showdown";
  nextState.betting.currentActorSeatIndex = null;
  nextState.actionHistory = [
    ...nextState.actionHistory,
    createActionRecord(nextState, {
      type: "showdown",
      playerId: null,
    }),
  ];
  nextState.street = "hand_complete";

  return nextState;
}

function runOutBoardAndFinishHand(state: GameState): GameState {
  const nextState = cloneState(state);
  const cardsNeeded = Math.max(0, 5 - nextState.board.length);

  if (cardsNeeded > 0) {
    const withBoard = drawCommunityCards(nextState, cardsNeeded);
    nextState.board = withBoard.board;
    nextState.deck = withBoard.deck;
  }

  return finishHandAtShowdown(nextState);
}

function postBlind(player: PlayerState, amount: number): number {
  const postedAmount = getPostBlindAmount(player, amount);

  player.stack -= postedAmount;
  player.currentStreetBet += postedAmount;
  player.totalCommittedThisHand += postedAmount;
  if (player.stack === 0) {
    player.status = "all_in";
  }

  return postedAmount;
}

function dealHoleCards(state: GameState): GameState {
  const orderedSeatIndexes = getOrderedActiveSeatIndexes(state);
  const dealerSeatIndex = state.buttonSeatIndex ?? state.dealerSeatIndex;

  if (orderedSeatIndexes.length === 0 || dealerSeatIndex === null) {
    return state;
  }

  let deck = state.deck;
  const dealtHands = new Map<SeatIndex, GameState["players"][number]["holeCards"]>();
  const startSeatIndex = getNextSeatIndex(orderedSeatIndexes, dealerSeatIndex);

  for (let round = 0; round < 2; round += 1) {
    const seatOrder: SeatIndex[] = [];
    let currentSeat = startSeatIndex;

    for (let index = 0; index < orderedSeatIndexes.length; index += 1) {
      if (currentSeat === null) {
        break;
      }

      seatOrder.push(currentSeat);
      currentSeat = getNextSeatIndex(orderedSeatIndexes, currentSeat);
    }

    for (const seatIndex of seatOrder) {
      const { cards, deck: nextDeck } = drawCards(deck, 1);
      deck = nextDeck;
      const currentCards = dealtHands.get(seatIndex) ?? [];
      dealtHands.set(seatIndex, [...currentCards, cards[0]]);
    }
  }

  const nextState = cloneState(state);
  nextState.deck = deck;
  for (const player of nextState.players) {
    player.holeCards = dealtHands.get(player.seatIndex) ?? [];
  }

  return nextState;
}

function resetPlayersForNewHand(state: GameState): GameState {
  const nextState = cloneState(state);

  for (const player of nextState.players) {
    if (player.status === "out" || player.stack === 0) {
      player.status = "out";
      player.holeCards = [];
      player.currentStreetBet = 0;
      player.totalCommittedThisHand = 0;
      player.hasActedThisStreet = false;
      continue;
    }

    player.status = "active";
    player.holeCards = [];
    player.currentStreetBet = 0;
    player.totalCommittedThisHand = 0;
    player.hasActedThisStreet = false;
  }

  nextState.board = [];
  nextState.pot = {
    mainPot: 0,
    sidePots: [],
  };
  nextState.betting = {
    currentBet: 0,
    minRaiseTo: nextState.config.blinds.bigBlind,
    lastAggressorSeatIndex: null,
    currentActorSeatIndex: null,
  };
  nextState.street = "not_started";
  nextState.dealerSeatIndex = null;
  nextState.buttonSeatIndex = null;

  return nextState;
}

function createActionRecord(state: GameState, action: PlayerAction): ActionRecord {
  return {
    ...action,
    id: `${state.handNumber}:${state.actionHistory.length + 1}`,
    street: state.street,
    handNumber: state.handNumber,
    timestampMs: state.actionHistory.length + 1,
  };
}

function isBettingRoundSettled(state: GameState): boolean {
  const activePlayers = state.players.filter((player) => player.status === "active");

  if (activePlayers.length <= 1) {
    return true;
  }

  return activePlayers.every(
    (player) =>
      player.hasActedThisStreet && player.currentStreetBet === state.betting.currentBet
  );
}

function finalizeTurn(state: GameState): GameState {
  const nextState = cloneState(state);
  const activePlayers = nextState.players.filter((player) => player.status === "active");
  const contendingPlayers = getContendingPlayers(nextState);

  if (contendingPlayers.length <= 1) {
    nextState.street = "hand_complete";
    nextState.betting.currentActorSeatIndex = null;
    return nextState;
  }

  if (activePlayers.length === 0) {
    return runOutBoardAndFinishHand(nextState);
  }

  if (isBettingRoundSettled(nextState)) {
    const nextStreet = getNextStreet(nextState.street);

    if (nextStreet === "showdown") {
      return finishHandAtShowdown(nextState);
    }

    const advancedState = advanceToNextStreet(nextState);
    advancedState.betting.currentActorSeatIndex = getPostflopFirstActorSeatIndex(advancedState);
    return advancedState;
  }

  const eligibleSeatIndexes = getEligibleActingSeatIndexes(nextState);
  nextState.betting.currentActorSeatIndex = getNextSeatIndex(
    eligibleSeatIndexes,
    nextState.betting.currentActorSeatIndex
  );

  return nextState;
}

function setOtherPlayersNeedToActAgain(state: GameState, currentSeatIndex: SeatIndex): void {
  for (const player of state.players) {
    if (player.seatIndex !== currentSeatIndex && player.status === "active") {
      player.hasActedThisStreet = false;
    }
  }
}

function applyChipMovement(
  state: GameState,
  player: PlayerState,
  targetTotalStreetCommitment: number
): number {
  const chipsToCommit = targetTotalStreetCommitment - player.currentStreetBet;
  const amount = Math.min(chipsToCommit, player.stack);

  player.stack -= amount;
  player.currentStreetBet += amount;
  player.totalCommittedThisHand += amount;

  if (player.stack === 0) {
    player.status = "all_in";
  }

  state.pot.mainPot += amount;

  return amount;
}

export function startHand(state: GameState, options: StartHandOptions = {}): GameState {
  const nextState = resetPlayersForNewHand(state);
  const activeSeatIndexes = getOrderedActiveSeatIndexes(nextState);

  if (activeSeatIndexes.length < 2) {
    nextState.street = "hand_complete";
    return nextState;
  }

  nextState.deck = shuffleDeck(nextState.deck, options.random);

  const previousDealerSeatIndex = state.buttonSeatIndex ?? state.dealerSeatIndex;
  const dealerSeatIndex =
    previousDealerSeatIndex === null
      ? activeSeatIndexes[0]
      : getNextSeatIndex(activeSeatIndexes, previousDealerSeatIndex) ?? activeSeatIndexes[0];

  const isHeadsUp = activeSeatIndexes.length === 2;
  const buttonSeatIndex = dealerSeatIndex;
  const smallBlindSeatIndex = isHeadsUp
    ? dealerSeatIndex
    : getNextSeatIndex(activeSeatIndexes, dealerSeatIndex);
  const bigBlindSeatIndex = isHeadsUp
    ? getNextSeatIndex(activeSeatIndexes, dealerSeatIndex)
    : getNextSeatIndex(activeSeatIndexes, smallBlindSeatIndex);
  const firstActorSeatIndex = isHeadsUp
    ? dealerSeatIndex
    : getNextSeatIndex(activeSeatIndexes, bigBlindSeatIndex);

  if (smallBlindSeatIndex === null || bigBlindSeatIndex === null || firstActorSeatIndex === null) {
    nextState.street = "hand_complete";
    return nextState;
  }

  nextState.dealerSeatIndex = dealerSeatIndex;
  nextState.buttonSeatIndex = buttonSeatIndex;

  const smallBlindPlayer = getPlayerBySeatIndex(nextState, smallBlindSeatIndex);
  const bigBlindPlayer = getPlayerBySeatIndex(nextState, bigBlindSeatIndex);

  if (!smallBlindPlayer || !bigBlindPlayer) {
    nextState.street = "hand_complete";
    return nextState;
  }

  const smallBlindAmount = postBlind(smallBlindPlayer, nextState.config.blinds.smallBlind);
  const bigBlindAmount = postBlind(bigBlindPlayer, nextState.config.blinds.bigBlind);

  nextState.pot.mainPot += smallBlindAmount + bigBlindAmount;
  nextState.betting.currentBet = bigBlindAmount;
  nextState.betting.minRaiseTo = bigBlindAmount + nextState.config.blinds.bigBlind;
  nextState.betting.lastAggressorSeatIndex = bigBlindSeatIndex;
  nextState.betting.currentActorSeatIndex = firstActorSeatIndex;
  nextState.street = "preflop";

  const dealtState = dealHoleCards(nextState);
  dealtState.actionHistory = [
    ...dealtState.actionHistory,
    createActionRecord(dealtState, {
      type: "start_hand",
      playerId: null,
    }),
  ];

  return dealtState;
}

export function startNextHand(state: GameState, options: StartHandOptions = {}): GameState {
  const previousButtonSeatIndex = state.buttonSeatIndex ?? state.dealerSeatIndex;
  const nextState = resetPlayersForNewHand({
    ...cloneState(state),
    handNumber: state.handNumber + 1,
  });
  const activeSeatIndexes = getOrderedActiveSeatIndexes(nextState);

  if (activeSeatIndexes.length < 2) {
    nextState.street = "hand_complete";
    return nextState;
  }

  nextState.deck = shuffleDeck(createStandardDeck(), options.random);

  const dealerSeatIndex =
    previousButtonSeatIndex === null
      ? activeSeatIndexes[0]
      : getNextSeatIndex(activeSeatIndexes, previousButtonSeatIndex) ?? activeSeatIndexes[0];

  const isHeadsUp = activeSeatIndexes.length === 2;
  const buttonSeatIndex = dealerSeatIndex;
  const smallBlindSeatIndex = isHeadsUp
    ? dealerSeatIndex
    : getNextSeatIndex(activeSeatIndexes, dealerSeatIndex);
  const bigBlindSeatIndex = isHeadsUp
    ? getNextSeatIndex(activeSeatIndexes, dealerSeatIndex)
    : getNextSeatIndex(activeSeatIndexes, smallBlindSeatIndex);
  const firstActorSeatIndex = isHeadsUp
    ? dealerSeatIndex
    : getNextSeatIndex(activeSeatIndexes, bigBlindSeatIndex);

  if (smallBlindSeatIndex === null || bigBlindSeatIndex === null || firstActorSeatIndex === null) {
    nextState.street = "hand_complete";
    return nextState;
  }

  nextState.dealerSeatIndex = dealerSeatIndex;
  nextState.buttonSeatIndex = buttonSeatIndex;

  const smallBlindPlayer = getPlayerBySeatIndex(nextState, smallBlindSeatIndex);
  const bigBlindPlayer = getPlayerBySeatIndex(nextState, bigBlindSeatIndex);

  if (!smallBlindPlayer || !bigBlindPlayer) {
    nextState.street = "hand_complete";
    return nextState;
  }

  const smallBlindAmount = postBlind(smallBlindPlayer, nextState.config.blinds.smallBlind);
  const bigBlindAmount = postBlind(bigBlindPlayer, nextState.config.blinds.bigBlind);

  nextState.pot.mainPot += smallBlindAmount + bigBlindAmount;
  nextState.betting.currentBet = bigBlindAmount;
  nextState.betting.minRaiseTo = bigBlindAmount + nextState.config.blinds.bigBlind;
  nextState.betting.lastAggressorSeatIndex = bigBlindSeatIndex;
  nextState.betting.currentActorSeatIndex = firstActorSeatIndex;
  nextState.street = "preflop";

  const dealtState = dealHoleCards(nextState);
  dealtState.actionHistory = [
    ...state.actionHistory,
    createActionRecord(dealtState, {
      type: "start_hand",
      playerId: null,
    }),
  ];

  return dealtState;
}

export function getLegalActions(state: GameState, playerId: string): LegalAction[] {
  if (state.betting.currentActorSeatIndex === null) {
    return [];
  }

  const player = getPlayerById(state, playerId);

  if (player.seatIndex !== state.betting.currentActorSeatIndex || player.status !== "active") {
    return [];
  }

  const stack = player.stack;
  const amountToCall = Math.max(0, state.betting.currentBet - player.currentStreetBet);
  const totalAllInAmount = player.currentStreetBet + stack;
  const legalActions: LegalAction[] = [];

  if (amountToCall > 0) {
    legalActions.push({ type: "fold" });
    legalActions.push({ type: "call", callAmount: amountToCall });
  } else {
    legalActions.push({ type: "check" });
  }

  if (stack > 0) {
    if (state.betting.currentBet === 0) {
      legalActions.push({
        type: "bet",
        minAmount: state.config.blinds.bigBlind,
        maxAmount: totalAllInAmount,
      });
    } else if (totalAllInAmount > state.betting.currentBet) {
      legalActions.push({
        type: "raise",
        minAmount: state.betting.minRaiseTo,
        maxAmount: totalAllInAmount,
      });
    }

    legalActions.push({
      type: "all_in",
      minAmount: totalAllInAmount,
      maxAmount: totalAllInAmount,
    });
  }

  return legalActions;
}

export function applyAction(state: GameState, action: PlayerAction): GameState {
  if (action.type === "start_hand") {
    return startHand(state);
  }

  const playerId = action.playerId;

  if (!playerId) {
    throw new Error("Player action requires a playerId.");
  }

  if (state.betting.currentActorSeatIndex === null) {
    return state;
  }

  const nextState = cloneState(state);
  const player = getPlayerById(nextState, playerId);

  if (player.seatIndex !== nextState.betting.currentActorSeatIndex) {
    throw new Error("Action submitted out of turn.");
  }

  const amountToCall = Math.max(0, nextState.betting.currentBet - player.currentStreetBet);
  const previousCurrentBet = nextState.betting.currentBet;

  switch (action.type) {
    case "fold": {
      player.status = "folded";
      player.hasActedThisStreet = true;
      break;
    }
    case "check": {
      if (amountToCall !== 0) {
        throw new Error("Check is not legal when facing a bet.");
      }

      player.hasActedThisStreet = true;
      break;
    }
    case "call": {
      if (amountToCall === 0) {
        throw new Error("Call is not legal when there is nothing to call.");
      }

      applyChipMovement(nextState, player, player.currentStreetBet + amountToCall);
      player.hasActedThisStreet = true;
      break;
    }
    case "bet":
    case "raise": {
      if (action.amount === undefined) {
        throw new Error(`${action.type} requires an amount.`);
      }

      const minimumAllowedAmount =
        action.type === "bet"
          ? state.config.blinds.bigBlind
          : state.betting.minRaiseTo;
      const targetTotal = Math.min(action.amount, player.currentStreetBet + player.stack);

      if (action.amount < minimumAllowedAmount) {
        throw new Error(`${action.type} amount is below the legal minimum.`);
      }

      if (targetTotal <= player.currentStreetBet) {
        throw new Error(`${action.type} amount must increase the current commitment.`);
      }

      applyChipMovement(nextState, player, targetTotal);
      player.hasActedThisStreet = true;

      if (targetTotal > previousCurrentBet) {
        const raiseSize = targetTotal - previousCurrentBet;
        nextState.betting.currentBet = targetTotal;
        nextState.betting.minRaiseTo = targetTotal + Math.max(raiseSize, nextState.config.blinds.bigBlind);
        nextState.betting.lastAggressorSeatIndex = player.seatIndex;
        setOtherPlayersNeedToActAgain(nextState, player.seatIndex);
      }

      break;
    }
    case "all_in": {
      const targetTotal = player.currentStreetBet + player.stack;
      applyChipMovement(nextState, player, targetTotal);
      player.hasActedThisStreet = true;

      if (targetTotal > previousCurrentBet) {
        const raiseSize = targetTotal - previousCurrentBet;
        nextState.betting.currentBet = targetTotal;
        nextState.betting.minRaiseTo = targetTotal + Math.max(raiseSize, nextState.config.blinds.bigBlind);
        nextState.betting.lastAggressorSeatIndex = player.seatIndex;
        setOtherPlayersNeedToActAgain(nextState, player.seatIndex);
      }

      break;
    }
    default:
      throw new Error(`Unsupported action: ${action.type}`);
  }

  nextState.actionHistory = [
    ...nextState.actionHistory,
    createActionRecord(nextState, action),
  ];

  return finalizeTurn(nextState);
}
