import { createStandardDeck, drawCards, shuffleDeck } from "../../lib/poker/deck";
import type {
  ActionRecord,
  HandRevealPlayerResult,
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
    lastHandResult: state.lastHandResult
      ? {
          ...state.lastHandResult,
          winnerIds: [...state.lastHandResult.winnerIds],
          playerResults: state.lastHandResult.playerResults.map((result) => ({
            ...result,
            cardsUsed: result.cardsUsed.map((card) => ({ ...card })),
          })),
        }
      : null,
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

type HandRank = {
  category: number;
  tiebreakers: number[];
};

type HandEvaluation = HandRank & {
  cards: GameState["board"];
  label: string;
};

function rankCardValue(rank: string): number {
  const values: Record<string, number> = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
  };

  return values[rank] ?? 0;
}

function compareHandRanks(left: HandRank, right: HandRank): number {
  if (left.category !== right.category) {
    return left.category - right.category;
  }

  const tiebreakerCount = Math.max(left.tiebreakers.length, right.tiebreakers.length);

  for (let index = 0; index < tiebreakerCount; index += 1) {
    const leftValue = left.tiebreakers[index] ?? 0;
    const rightValue = right.tiebreakers[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function getStraightHighCard(ranks: number[]): number | null {
  const uniqueRanks = [...new Set(ranks)].sort((left, right) => right - left);

  if (uniqueRanks.length !== 5) {
    return null;
  }

  const wheel = [14, 5, 4, 3, 2];
  const isWheel = wheel.every((rank, index) => uniqueRanks[index] === rank);

  if (isWheel) {
    return 5;
  }

  for (let index = 0; index < uniqueRanks.length - 1; index += 1) {
    if (uniqueRanks[index] - 1 !== uniqueRanks[index + 1]) {
      return null;
    }
  }

  return uniqueRanks[0];
}

function getRankLabel(rank: number): string {
  const labels: Record<number, string> = {
    2: "2",
    3: "3",
    4: "4",
    5: "5",
    6: "6",
    7: "7",
    8: "8",
    9: "9",
    10: "T",
    11: "J",
    12: "Q",
    13: "K",
    14: "A",
  };

  return labels[rank] ?? `${rank}`;
}

function getRankWord(rank: number): string {
  const words: Record<number, string> = {
    2: "deuces",
    3: "treys",
    4: "fours",
    5: "fives",
    6: "sixes",
    7: "sevens",
    8: "eights",
    9: "nines",
    10: "tens",
    11: "jacks",
    12: "queens",
    13: "kings",
    14: "aces",
  };

  return words[rank] ?? `${rank}s`;
}

function buildHandLabel(rank: HandRank): string {
  const [first = 0, second = 0, third = 0] = rank.tiebreakers;

  switch (rank.category) {
    case 8:
      return `Straight flush, ${getRankLabel(first)} high`;
    case 7:
      return `Four of a kind, ${getRankWord(first)} with ${getRankLabel(second)} kicker`;
    case 6:
      return `Full house, ${getRankWord(first)} full of ${getRankWord(second)}`;
    case 5:
      return `Flush, ${getRankLabel(first)} high`;
    case 4:
      return `Straight, ${getRankLabel(first)} high`;
    case 3:
      return `Three of a kind, ${getRankWord(first)} with ${getRankLabel(second)} and ${getRankLabel(third)} kickers`;
    case 2:
      return `Two pair, ${getRankWord(first)} and ${getRankWord(second)} with ${getRankLabel(third)} kicker`;
    case 1:
      return `Pair of ${getRankWord(first)} with ${getRankLabel(second)}, ${getRankLabel(third)} and ${getRankLabel(rank.tiebreakers[3] ?? 0)} kickers`;
    default:
      return `High card ${getRankLabel(first)}`;
  }
}

function getFiveCardHandRank(cards: GameState["board"]): HandRank {
  const ranks = cards.map((card) => rankCardValue(card.rank)).sort((left, right) => right - left);
  const suits = new Set(cards.map((card) => card.suit));
  const isFlush = suits.size === 1;
  const straightHighCard = getStraightHighCard(ranks);
  const counts = new Map<number, number>();

  for (const rank of ranks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }

  const groupedRanks = [...counts.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return right.rank - left.rank;
    });

  if (isFlush && straightHighCard !== null) {
    return { category: 8, tiebreakers: [straightHighCard] };
  }

  if (groupedRanks[0]?.count === 4) {
    const quadRank = groupedRanks[0].rank;
    const kicker = groupedRanks.find((entry) => entry.rank !== quadRank)?.rank ?? 0;
    return { category: 7, tiebreakers: [quadRank, kicker] };
  }

  if (groupedRanks[0]?.count === 3 && groupedRanks[1]?.count === 2) {
    return {
      category: 6,
      tiebreakers: [groupedRanks[0].rank, groupedRanks[1].rank],
    };
  }

  if (isFlush) {
    return { category: 5, tiebreakers: ranks };
  }

  if (straightHighCard !== null) {
    return { category: 4, tiebreakers: [straightHighCard] };
  }

  if (groupedRanks[0]?.count === 3) {
    const tripsRank = groupedRanks[0].rank;
    const kickers = groupedRanks
      .filter((entry) => entry.rank !== tripsRank)
      .map((entry) => entry.rank)
      .sort((left, right) => right - left);

    return { category: 3, tiebreakers: [tripsRank, ...kickers] };
  }

  if (groupedRanks[0]?.count === 2 && groupedRanks[1]?.count === 2) {
    const pairRanks = [groupedRanks[0].rank, groupedRanks[1].rank].sort((left, right) => right - left);
    const kicker = groupedRanks.find((entry) => entry.count === 1)?.rank ?? 0;

    return { category: 2, tiebreakers: [...pairRanks, kicker] };
  }

  if (groupedRanks[0]?.count === 2) {
    const pairRank = groupedRanks[0].rank;
    const kickers = groupedRanks
      .filter((entry) => entry.rank !== pairRank)
      .map((entry) => entry.rank)
      .sort((left, right) => right - left);

    return { category: 1, tiebreakers: [pairRank, ...kickers] };
  }

  return { category: 0, tiebreakers: ranks };
}

function getFiveCardHandEvaluation(cards: GameState["board"]): HandEvaluation {
  const rank = getFiveCardHandRank(cards);

  return {
    ...rank,
    cards,
    label: buildHandLabel(rank),
  };
}

function getBestHandEvaluation(cards: GameState["board"]): HandEvaluation {
  if (cards.length < 5) {
    const rank = {
      category: 0,
      tiebreakers: cards.map((card) => rankCardValue(card.rank)).sort((left, right) => right - left),
    };

    return {
      ...rank,
      cards,
      label: buildHandLabel(rank),
    };
  }

  let bestRank: HandEvaluation | null = null;

  for (let first = 0; first < cards.length - 4; first += 1) {
    for (let second = first + 1; second < cards.length - 3; second += 1) {
      for (let third = second + 1; third < cards.length - 2; third += 1) {
        for (let fourth = third + 1; fourth < cards.length - 1; fourth += 1) {
          for (let fifth = fourth + 1; fifth < cards.length; fifth += 1) {
            const rank = getFiveCardHandEvaluation([
              cards[first],
              cards[second],
              cards[third],
              cards[fourth],
              cards[fifth],
            ]);

            if (!bestRank || compareHandRanks(rank, bestRank) > 0) {
              bestRank = rank;
            }
          }
        }
      }
    }
  }

  return bestRank ?? { category: 0, tiebreakers: [], cards: [], label: "High card" };
}

function chooseShowdownWinners(state: GameState): PlayerState[] {
  const contenders = getContendingPlayers(state);

  if (contenders.length <= 1) {
    return contenders;
  }

  const rankedContenders = contenders.map((player) => ({
    player,
    rank: getBestHandEvaluation([...player.holeCards, ...state.board]),
  }));

  rankedContenders.sort((left, right) => compareHandRanks(right.rank, left.rank));
  const bestRank = rankedContenders[0]?.rank;

  if (!bestRank) {
    return [];
  }

  return rankedContenders
    .filter((entry) => compareHandRanks(entry.rank, bestRank) === 0)
    .map((entry) => entry.player);
}

function settleHandPot(state: GameState): GameState {
  const nextState = cloneState(state);
  const winners = chooseShowdownWinners(nextState);
  const potTotal = nextState.pot.mainPot;

  if (winners.length === 0 || nextState.pot.mainPot === 0) {
    nextState.pot = {
      mainPot: 0,
      sidePots: [],
    };
    nextState.street = "hand_complete";
    nextState.betting.currentActorSeatIndex = null;
    return nextState;
  }

  const share = Math.floor(potTotal / winners.length);
  let remainder = potTotal % winners.length;

  const winnersBySeatOrder = [...winners].sort((left, right) => left.seatIndex - right.seatIndex);
  const winnerIds = winnersBySeatOrder.map((winner) => winner.id);
  const playerResults: HandRevealPlayerResult[] = [];

  for (const winner of winnersBySeatOrder) {
    winner.stack += share + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
  }

  if (state.street === "showdown") {
    for (const player of nextState.players) {
      const evaluation = getBestHandEvaluation([...player.holeCards, ...nextState.board]);
      const isWinner = winnerIds.includes(player.id);

      playerResults.push({
        playerId: player.id,
        seatIndex: player.seatIndex,
        name: player.name,
        isWinner,
        handLabel: isWinner ? evaluation.label : evaluation.label,
        cardsUsed: isWinner ? evaluation.cards.map((card) => ({ ...card })) : [],
      });
    }
  } else {
    for (const player of nextState.players) {
      const isWinner = winnerIds.includes(player.id);

      playerResults.push({
        playerId: player.id,
        seatIndex: player.seatIndex,
        name: player.name,
        isWinner,
        handLabel: isWinner ? "Won by fold" : "Folded",
        cardsUsed: isWinner ? player.holeCards.map((card) => ({ ...card })) : [],
      });
    }
  }

  nextState.pot = {
    mainPot: 0,
    sidePots: [],
  };
  nextState.lastHandResult = {
    kind: state.street === "showdown" ? "showdown" : "fold",
    potAwarded: potTotal,
    winnerIds,
    playerResults: playerResults.sort((left, right) => left.seatIndex - right.seatIndex),
  };
  nextState.street = "hand_complete";
  nextState.betting.currentActorSeatIndex = null;

  return nextState;
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

  return settleHandPot(nextState);
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
  nextState.lastHandResult = null;

  return nextState;
}

export function rebuyPlayer(state: GameState, playerId: string): GameState {
  const nextState = cloneState(state);
  const player = getPlayerById(nextState, playerId);

  player.stack = nextState.config.startingStack;
  player.status = "waiting";
  player.holeCards = [];
  player.currentStreetBet = 0;
  player.totalCommittedThisHand = 0;
  player.hasActedThisStreet = false;

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
    return settleHandPot(nextState);
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
