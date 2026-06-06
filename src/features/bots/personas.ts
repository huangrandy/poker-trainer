import type { Card, GameState, LegalAction, PlayerAction, PlayerState } from "../game-engine/types";

export type BotPersonaId = "tag" | "general" | "lag" | "nit" | "call_station";

export type BotPersonaProfile = {
  id: BotPersonaId;
  label: string;
  description: string;
  enabled: boolean;
  tightness: number;
  aggression: number;
  callDown: number;
  bluffiness: number;
};

export const BOT_PERSONA_PROFILES: Record<BotPersonaId, BotPersonaProfile> = {
  tag: {
    id: "tag",
    label: "TAG",
    description: "Tight-aggressive baseline bot.",
    enabled: true,
    tightness: 0.56,
    aggression: 0.28,
    callDown: 0.44,
    bluffiness: 0.08,
  },
  general: {
    id: "general",
    label: "General",
    description: "Balanced practice opponent with a real mix of value bets and calls.",
    enabled: true,
    tightness: 0.38,
    aggression: 0.46,
    callDown: 0.48,
    bluffiness: 0.16,
  },
  lag: {
    id: "lag",
    label: "LAG",
    description: "Loose-aggressive pressure bot that attacks more often.",
    enabled: true,
    tightness: 0.28,
    aggression: 0.78,
    callDown: 0.28,
    bluffiness: 0.34,
  },
  nit: {
    id: "nit",
    label: "Nit",
    description: "Very tight, low-volatility opponent.",
    enabled: true,
    tightness: 0.86,
    aggression: 0.18,
    callDown: 0.14,
    bluffiness: 0.06,
  },
  call_station: {
    id: "call_station",
    label: "Call station",
    description: "Sticky passive opponent with low folding frequency.",
    enabled: false,
    tightness: 0.18,
    aggression: 0.24,
    callDown: 0.9,
    bluffiness: 0.03,
  },
};

export const DEFAULT_BOT_PERSONA_ID: BotPersonaId = "tag";

export function normalizeBotPersonaId(value: unknown): BotPersonaId {
  if (value === "tag" || value === "general" || value === "lag" || value === "nit" || value === "call_station") {
    return value;
  }

  return DEFAULT_BOT_PERSONA_ID;
}

export function getBotPersonaProfile(botPersonaId: unknown): BotPersonaProfile {
  const normalizedId = normalizeBotPersonaId(botPersonaId);
  const profile = BOT_PERSONA_PROFILES[normalizedId];

  if (profile.enabled) {
    return profile;
  }

  return BOT_PERSONA_PROFILES[DEFAULT_BOT_PERSONA_ID];
}

function rankValue(rank: Card["rank"]): number {
  const values: Record<Card["rank"], number> = {
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

  return values[rank];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function getStraightHighCard(ranks: number[]): number | null {
  const uniqueRanks = [...new Set(ranks)].sort((left, right) => right - left);

  if (uniqueRanks.length < 5) {
    return null;
  }

  const wheel = [14, 5, 4, 3, 2];
  if (wheel.every((rank, index) => uniqueRanks[index] === rank)) {
    return 5;
  }

  for (let index = 0; index <= uniqueRanks.length - 5; index += 1) {
    let isRun = true;

    for (let offset = 0; offset < 4; offset += 1) {
      if (uniqueRanks[index + offset] - 1 !== uniqueRanks[index + offset + 1]) {
        isRun = false;
        break;
      }
    }

    if (isRun) {
      return uniqueRanks[index];
    }
  }

  return null;
}

function scorePreflopHoleCards(holeCards: Card[]): number {
  const [first, second] = holeCards;

  if (!first || !second) {
    return 0;
  }

  const firstRank = rankValue(first.rank);
  const secondRank = rankValue(second.rank);
  const highRank = Math.max(firstRank, secondRank);
  const lowRank = Math.min(firstRank, secondRank);
  const gap = Math.abs(firstRank - secondRank);

  let score = 0.18;
  score += ((highRank - 2) / 12) * 0.24;
  score += ((lowRank - 2) / 12) * 0.12;

  if (first.rank === second.rank) {
    score += 0.28 + ((highRank - 2) / 12) * 0.16;
  }

  if (first.suit === second.suit) {
    score += 0.07;
  }

  if (gap === 1) {
    score += 0.05;
  } else if (gap === 2) {
    score += 0.03;
  }

  if (highRank >= 11 && lowRank >= 10) {
    score += 0.08;
  } else if (highRank >= 13) {
    score += 0.05;
  }

  return clamp01(score);
}

function scorePostflopHand(cards: Card[]): number {
  const ranks = cards.map((card) => rankValue(card.rank)).sort((left, right) => right - left);
  const rankCounts = new Map<number, number>();
  const suitCounts = new Map<Card["suit"], number>();

  for (const card of cards) {
    const rank = rankValue(card.rank);
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  }

  const groupedRanks = [...rankCounts.values()].sort((left, right) => right - left);
  const suitMax = Math.max(...suitCounts.values(), 0);
  const straightHighCard = getStraightHighCard(ranks);

  if (groupedRanks[0] === 4) {
    return 0.98;
  }

  if (groupedRanks[0] === 3 && groupedRanks[1] === 2) {
    return 0.94;
  }

  if (suitMax >= 5) {
    return 0.9;
  }

  if (straightHighCard !== null) {
    return 0.87;
  }

  if (groupedRanks[0] === 3) {
    return 0.72;
  }

  if (groupedRanks[0] === 2 && groupedRanks[1] === 2) {
    return 0.58;
  }

  if (groupedRanks[0] === 2) {
    return 0.42;
  }

  if (suitMax === 4) {
    return 0.48;
  }

  if (straightHighCard === 5) {
    return 0.7;
  }

  return clamp01(0.16 + ((ranks[0] ?? 0) - 2) / 12 * 0.18);
}

function scoreHandStrength(state: GameState, player: PlayerState): number {
  const preflopScore = scorePreflopHoleCards(player.holeCards);
  const postflopScore = scorePostflopHand([...player.holeCards, ...state.board]);

  if (state.board.length === 0) {
    return preflopScore;
  }

  return clamp01(Math.max(preflopScore * 0.7, postflopScore));
}

function getUniqueRankValues(cards: Card[]): number[] {
  return [...new Set(cards.map((card) => rankValue(card.rank)))].sort((left, right) => right - left);
}

function estimateStraightDrawOuts(cards: Card[]): number {
  const uniqueRanks = getUniqueRankValues(cards);
  const rankSet = new Set(uniqueRanks);

  let bestOuts = 0;

  for (let start = 2; start <= 10; start += 1) {
    const window = [start, start + 1, start + 2, start + 3, start + 4];
    const presentCount = window.filter((rank) => rankSet.has(rank)).length;

    if (presentCount !== 4) {
      continue;
    }

    const missingIndex = window.findIndex((rank) => !rankSet.has(rank));
    const isOpenEnded = missingIndex === 0 || missingIndex === 4;
    bestOuts = Math.max(bestOuts, isOpenEnded ? 8 : 4);
  }

  const wheelWindow = [14, 5, 4, 3, 2];
  const wheelPresentCount = wheelWindow.filter((rank) => rankSet.has(rank)).length;

  if (wheelPresentCount === 4) {
    const missingIndex = wheelWindow.findIndex((rank) => !rankSet.has(rank));
    const isOpenEnded = missingIndex === 0 || missingIndex === 4;
    bestOuts = Math.max(bestOuts, isOpenEnded ? 8 : 4);
  }

  return bestOuts;
}

function estimateFlushDrawOuts(cards: Card[]): number {
  const suitCounts = new Map<Card["suit"], number>();

  for (const card of cards) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
  }

  const maxSuitCount = Math.max(...suitCounts.values(), 0);

  if (maxSuitCount === 4) {
    return 9;
  }

  if (maxSuitCount === 3 && cards.length <= 5) {
    return 9;
  }

  return 0;
}

function estimateDrawEquity(state: GameState, player: PlayerState): number {
  const cards = [...player.holeCards, ...state.board];
  const street = state.street;
  const drawOuts = Math.max(estimateStraightDrawOuts(cards), estimateFlushDrawOuts(cards));

  if (drawOuts <= 0) {
    return 0;
  }

  const cardsToCome = street === "flop" ? 2 : street === "turn" ? 1 : 0;
  if (cardsToCome <= 0) {
    return 0;
  }

  const ruleMultiplier = cardsToCome === 2 ? 4 : 2;
  const rawEquity = (drawOuts * ruleMultiplier) / 100;
  return clamp01(rawEquity);
}

function estimateCallEquity(state: GameState, player: PlayerState): number {
  const madeHandStrength = scoreHandStrength(state, player);
  const drawEquity = estimateDrawEquity(state, player);
  const profile = getBotPersonaProfile(player.botPersonaId);
  const texture = getBoardTexture(state);
  const boardPressure = state.board.length >= 4 ? 0.03 : state.board.length === 3 ? 0.02 : 0;
  const impliedOdds =
    drawEquity > 0
      ? Math.min(0.12, (player.stack / Math.max(1, state.pot.mainPot)) * 0.015)
      : 0;
  const callStationBonus = profile.callDown > 0.7 ? 0.02 : 0;
  const reverseImpliedPenalty = madeHandStrength < 0.55 && state.board.length >= 3 ? 0.03 : 0.01;
  const texturePenalty =
    texture === "monotone"
      ? madeHandStrength < 0.75
        ? 0.06
        : 0.02
      : texture === "paired"
        ? madeHandStrength < 0.7
          ? 0.05
          : 0.02
        : texture === "polarized"
          ? madeHandStrength < 0.8
            ? 0.04
            : 0.01
          : 0;
  const drawPenalty =
    (texture === "monotone" || texture === "paired") && drawEquity > 0
      ? 0.02
      : 0;

  return clamp01(
    Math.max(
      madeHandStrength - texturePenalty,
      drawEquity + impliedOdds + callStationBonus - reverseImpliedPenalty - boardPressure - drawPenalty
    )
  );
}

function estimatePotOddsRequirement(state: GameState, player: PlayerState): number {
  const amountToCall = Math.max(0, state.betting.currentBet - player.currentStreetBet);
  if (amountToCall <= 0) {
    return 0;
  }

  return amountToCall / Math.max(1, state.pot.mainPot + amountToCall);
}

function estimateCallEdge(state: GameState, player: PlayerState): number {
  return estimateCallEquity(state, player) - estimatePotOddsRequirement(state, player);
}

function hashString(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getDecisionRoll(state: GameState, player: PlayerState): number {
  return getDeterministicRoll(state, player);
}

function getDeterministicRoll(state: GameState, player: PlayerState, salt = ""): number {
  const seed = [
    state.handNumber,
    state.street,
    state.betting.currentBet,
    state.betting.minRaiseTo,
    state.board.map((card) => `${card.rank}${card.suit[0]}`).join(""),
    player.holeCards.map((card) => `${card.rank}${card.suit[0]}`).join(""),
    player.id,
    salt,
  ].join("|");
  const hash = hashString(seed);

  return (hash % 1000) / 1000;
}

export function getBotPersonaScore(
  state: GameState,
  player: PlayerState,
  actionType: string
): number {
  const profile = getBotPersonaProfile(player.botPersonaId);
  const strength = scoreHandStrength(state, player);
  const amountToCall = Math.max(0, state.betting.currentBet - player.currentStreetBet);
  const pressure = amountToCall / Math.max(1, player.stack + amountToCall);
  const facingBet = amountToCall > 0;

  if (actionType === "check") {
    return facingBet ? -1 : 0.48 + (1 - strength) * 0.08 - profile.aggression * 0.04;
  }

  if (actionType === "call") {
    return profile.callDown + strength * 0.55 - pressure * 0.4 + (profile.id === "lag" ? 0.06 : 0);
  }

  if (actionType === "fold") {
    return profile.tightness + (1 - strength) * 0.55 + pressure * 0.2;
  }

  if (actionType === "bet") {
    const tagMarginalPenalty = profile.id === "tag" && strength < 0.75 ? 0.2 : 0;

    return (
      profile.aggression +
      strength * 0.58 +
      profile.bluffiness * (1 - strength) * 0.6 -
      pressure * 0.08 -
      (profile.id === "tag" ? 0.12 : 0) -
      tagMarginalPenalty
    );
  }

  if (actionType === "raise") {
    return profile.aggression + strength * 0.7 + profile.bluffiness * (1 - strength) * 0.75 - pressure * 0.04 + (profile.id === "lag" ? 0.05 : 0);
  }

  if (actionType === "all_in") {
    return profile.aggression * 0.1 + strength * 0.2 - 0.25;
  }

  return -1;
}

type WeightedChoice<T> = {
  value: T;
  weight: number;
};

function sampleWeightedChoice<T>(choices: Array<WeightedChoice<T>>, roll: number): T | null {
  const totalWeight = choices.reduce((sum, choice) => sum + Math.max(0, choice.weight), 0);

  if (totalWeight <= 0) {
    return null;
  }

  let running = 0;
  const target = roll * totalWeight;

  for (const choice of choices) {
    running += Math.max(0, choice.weight);

    if (target <= running) {
      return choice.value;
    }
  }

  return choices[choices.length - 1]?.value ?? null;
}

function buildSizingCandidates(minAmount: number, maxAmount: number, step: number): number[] {
  if (maxAmount <= minAmount) {
    return [minAmount];
  }

  const rawCandidates = [
    minAmount,
    minAmount + (maxAmount - minAmount) * 0.25,
    minAmount + (maxAmount - minAmount) * 0.5,
    minAmount + (maxAmount - minAmount) * 0.75,
    maxAmount,
  ];

  const roundedCandidates = rawCandidates.map((amount) => {
    const rounded = Math.round(amount / step) * step;
    return Math.min(maxAmount, Math.max(minAmount, rounded));
  });

  return [...new Set(roundedCandidates)].sort((left, right) => left - right);
}

type BoardTexture =
  | "preflop"
  | "ace_high_dry"
  | "dry"
  | "connected_two_tone"
  | "paired"
  | "monotone"
  | "dynamic"
  | "polarized";

function getBoardTexture(state: GameState): BoardTexture {
  if (state.board.length < 3) {
    return "preflop";
  }

  const ranks = state.board.map((card) => rankValue(card.rank)).sort((left, right) => right - left);
  const suitCounts = new Map<Card["suit"], number>();
  const rankCounts = new Map<number, number>();
  const topRank = ranks[0] ?? 0;

  for (const card of state.board) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
    const rank = rankValue(card.rank);
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
  }

  const suitMax = Math.max(...suitCounts.values(), 0);
  const hasPair = [...rankCounts.values()].some((count) => count >= 2);
  const gaps = ranks.slice(0, -1).map((rank, index) => Math.abs(rank - (ranks[index + 1] ?? rank)));
  const closeGaps = gaps.filter((gap) => gap <= 2).length;
  const isConnected = closeGaps >= 2;
  const isTwoTone = suitMax === 2;
  const isMonotone = suitMax >= 3;
  const isPaired = hasPair;
  const isAceHighDry = topRank >= 14 && !isPaired && !isTwoTone && !isMonotone && closeGaps === 0;

  if (isMonotone) {
    return state.board.length >= 5 && isConnected ? "polarized" : "monotone";
  }

  if (isPaired && isConnected) {
    return "polarized";
  }

  if (isPaired) {
    return "paired";
  }

  if (isTwoTone && isConnected) {
    return "connected_two_tone";
  }

  if (isAceHighDry) {
    return "ace_high_dry";
  }

  if (isConnected) {
    return "dynamic";
  }

  if (suitMax >= 3) {
    return "polarized";
  }

  return "dry";
}

function getSizingFractions(
  state: GameState,
  player: PlayerState,
  profile: BotPersonaProfile,
  actionType: "bet" | "raise"
): number[] {
  const strength = scoreHandStrength(state, player);
  const texture = getBoardTexture(state);

  if (state.street === "preflop") {
    if (actionType === "bet") {
      return [2, 2.5, 3];
    }

    return [2.5, 3, 4];
  }

  if (actionType === "raise") {
    if (texture === "ace_high_dry") {
      return strength >= 0.8 ? [0.5, 0.66, 0.75] : [0.33, 0.5, 0.66];
    }

    if (texture === "paired") {
      return strength >= 0.8 ? [0.5, 0.75, 1] : [0.33, 0.5, 0.75];
    }

    if (texture === "monotone") {
      return strength >= 0.8 ? [0.5, 0.75, 1] : [0.33, 0.5, 0.66];
    }

    if (texture === "polarized") {
      return strength >= 0.8
        ? [0.66, 0.75, 1]
        : [0.5, 0.75, 1];
    }

    if (texture === "connected_two_tone") {
      return strength >= 0.8
        ? [0.5, 0.66, 0.75]
        : [0.33, 0.5, 0.66];
    }

    if (texture === "dynamic") {
      return strength >= 0.8
        ? [0.5, 0.66, 0.75]
        : [0.33, 0.5, 0.66];
    }

    if (profile.id === "lag" && strength >= 0.65) {
      return [0.5, 0.75, 1];
    }

    if (strength >= 0.8) {
      return [0.5, 0.75, 1];
    }

    if (strength >= 0.5) {
      return [0.33, 0.5, 0.75];
    }

    return [0.25, 0.33, 0.5];
  }

  if (texture === "polarized") {
    return strength >= 0.8
      ? [0.66, 0.75, 1]
      : [0.5, 0.66, 0.75];
  }

  if (texture === "ace_high_dry") {
    return strength >= 0.8
      ? [0.25, 0.33, 0.5]
      : [0.2, 0.25, 0.33];
  }

  if (texture === "paired") {
    return strength >= 0.8
      ? [0.33, 0.5, 0.66]
      : [0.25, 0.33, 0.5];
  }

  if (texture === "monotone") {
    return strength >= 0.8
      ? [0.33, 0.5, 0.66]
      : [0.25, 0.33, 0.5];
  }

  if (texture === "connected_two_tone") {
    return strength >= 0.8
      ? [0.33, 0.5, 0.66]
      : [0.25, 0.33, 0.5];
  }

  if (texture === "dynamic") {
    return strength >= 0.8
      ? [0.5, 0.66, 0.75]
      : [0.33, 0.5, 0.66];
  }

  if (profile.id === "lag" && strength >= 0.7) {
    return [0.5, 0.75, 1];
  }

  if (strength >= 0.8) {
    return [0.5, 0.66, 0.75];
  }

  if (strength >= 0.5) {
    return [0.25, 0.33, 0.5];
  }

  return [0.2, 0.25, 0.33];
}

function chooseBettingAmount(
  state: GameState,
  player: PlayerState,
  profile: BotPersonaProfile,
  legalAction: LegalAction,
  actionType: "bet" | "raise"
): number {
  const minAmount = legalAction.minAmount ?? legalAction.maxAmount ?? 0;
  const maxAmount = legalAction.maxAmount ?? legalAction.minAmount ?? minAmount;
  const step = Math.max(1, state.config.blinds.smallBlind);
  const potBase = Math.max(1, state.pot.mainPot);

  if (maxAmount <= minAmount) {
    return minAmount;
  }

  const strength = scoreHandStrength(state, player);
  const sizingRoll = getDeterministicRoll(state, player, `${actionType}:size`);
  const sizingFractions = getSizingFractions(state, player, profile, actionType);
  const boardTexture = getBoardTexture(state);
  const preferredFraction = actionType === "bet"
    ? clamp01(
        boardTexture === "polarized" || boardTexture === "monotone" || boardTexture === "paired"
          ? 0.72 + profile.aggression * 0.1 + strength * 0.12
          : boardTexture === "connected_two_tone" || boardTexture === "dynamic"
            ? 0.45 + profile.aggression * 0.12 + strength * 0.1
            : boardTexture === "ace_high_dry"
              ? 0.22 + profile.aggression * 0.08 + strength * 0.06
              : 0.28 + profile.aggression * 0.08 + strength * 0.08
      )
    : clamp01(
        boardTexture === "polarized" || boardTexture === "monotone" || boardTexture === "paired"
          ? 0.68 + profile.aggression * 0.08 + strength * 0.12
          : boardTexture === "connected_two_tone" || boardTexture === "dynamic"
            ? 0.48 + profile.aggression * 0.1 + strength * 0.1
            : boardTexture === "ace_high_dry"
              ? 0.22 + profile.aggression * 0.06 + strength * 0.06
              : 0.32 + profile.aggression * 0.08 + strength * 0.08
      );
  const candidates = sizingFractions
    .map((fraction) => {
      const targetAmount =
        state.street === "preflop"
          ? actionType === "bet"
            ? state.config.blinds.bigBlind * fraction
            : Math.max(minAmount, state.betting.currentBet * fraction)
          : actionType === "bet"
            ? potBase * fraction
            : Math.max(
                minAmount,
                player.currentStreetBet + Math.max(0, state.betting.currentBet - player.currentStreetBet) + potBase * fraction
              );
      const roundedAmount = Math.round(targetAmount / step) * step;
      const amount = Math.min(maxAmount, Math.max(minAmount, roundedAmount));
      const targetFraction = actionType === "bet"
        ? amount / Math.max(1, potBase)
        : (amount - player.currentStreetBet) / Math.max(1, potBase);
      const distance = Math.abs(targetFraction - preferredFraction);
      const weight = Math.exp(-(distance * distance) / 0.04);

      return {
        value: amount,
        weight,
      };
    })
    .filter((candidate, index, array) => array.findIndex((entry) => entry.value === candidate.value) === index);

  return sampleWeightedChoice(candidates, sizingRoll) ?? minAmount;
}

function chooseDeterministicBotAction(
  state: GameState,
  player: PlayerState,
  legalActions: LegalAction[]
): PlayerAction | null {
  const decisionRoll = getDecisionRoll(state, player);
  let bestAction: PlayerAction | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const legalAction of legalActions) {
    const score = getBotPersonaScore(state, player, legalAction.type);

    if (score > bestScore) {
      bestScore = score;
      if (legalAction.type === "bet" || legalAction.type === "raise") {
        bestAction = {
          type: legalAction.type,
          amount: legalAction.minAmount ?? legalAction.maxAmount ?? 0,
          playerId: null,
        };
      } else if (legalAction.type === "call") {
        bestAction = {
          type: legalAction.type,
          amount: state.betting.currentBet - player.currentStreetBet,
          playerId: null,
        };
      } else if (legalAction.type === "all_in") {
        bestAction = {
          type: legalAction.type,
          amount: legalAction.maxAmount ?? legalAction.minAmount ?? 0,
          playerId: null,
        };
      } else {
        bestAction = {
          type: legalAction.type,
          playerId: null,
        };
      }
    } else if (score === bestScore && bestAction !== null) {
      const preferredTypes = ["check", "call", "bet", "raise", "all_in", "fold"] as const;
      const currentIndex = preferredTypes.indexOf(bestAction.type as (typeof preferredTypes)[number]);
      const candidateIndex = preferredTypes.indexOf(legalAction.type as (typeof preferredTypes)[number]);

      if (candidateIndex !== -1 && currentIndex !== -1 && candidateIndex < currentIndex && decisionRoll >= 0.5) {
        if (legalAction.type === "bet" || legalAction.type === "raise") {
          bestAction = {
            type: legalAction.type,
            amount: legalAction.minAmount ?? legalAction.maxAmount ?? 0,
            playerId: null,
          };
        } else if (legalAction.type === "call") {
          bestAction = {
            type: legalAction.type,
            amount: state.betting.currentBet - player.currentStreetBet,
            playerId: null,
          };
        } else if (legalAction.type === "all_in") {
          bestAction = {
            type: legalAction.type,
            amount: legalAction.maxAmount ?? legalAction.minAmount ?? 0,
            playerId: null,
          };
        } else {
          bestAction = {
            type: legalAction.type,
            playerId: null,
          };
        }
      }
    }
  }

  return bestAction;
}

function chooseSampledBotAction(
  state: GameState,
  player: PlayerState,
  legalActions: LegalAction[]
): PlayerAction | null {
  const profile = getBotPersonaProfile(player.botPersonaId);
  const strength = scoreHandStrength(state, player);
  const amountToCall = Math.max(0, state.betting.currentBet - player.currentStreetBet);
  const facingBet = amountToCall > 0;
  const choiceRoll = getDeterministicRoll(state, player, "action");

  if (facingBet) {
    const callEdge = estimateCallEdge(state, player);
    const stackToPot = player.stack / Math.max(1, state.pot.mainPot);
    const legalFold = legalActions.some((legalAction) => legalAction.type === "fold");
    const legalCall = legalActions.some((legalAction) => legalAction.type === "call");
    const legalRaise = legalActions.some((legalAction) => legalAction.type === "raise");
    const legalAllIn = legalActions.some((legalAction) => legalAction.type === "all_in");
    const boardTexture = getBoardTexture(state);
    const foldWeight = legalFold
      ? clamp01(profile.tightness * 0.35 + Math.max(0, -callEdge) * 1.5 + (amountToCall / Math.max(1, player.stack + amountToCall)) * 0.15)
      : 0;
    const callWeight = legalCall
      ? clamp01(
          profile.callDown * 0.32 +
            Math.max(0, callEdge) * 1.35 +
            (callEdge > -0.02 ? 0.08 : 0) +
            (profile.id === "call_station" ? 0.12 : 0) +
            ((boardTexture === "paired" || boardTexture === "monotone") && callEdge < 0.03 ? -0.1 : 0) +
            (boardTexture === "polarized" && callEdge < 0.05 ? -0.05 : 0)
        )
      : 0;
    const raiseWeight = legalRaise
      ? clamp01(profile.aggression * 0.3 + Math.max(0, callEdge) * 0.9 + profile.bluffiness * (1 - strength) * 0.12 + (profile.id === "lag" ? 0.08 : 0))
      : 0;
    const allInWeight = legalAllIn && (stackToPot <= 0.7 || (strength > 0.85 && stackToPot <= 1.5))
      ? clamp01((1 - stackToPot) * 0.3 + strength * 0.15 - 0.08)
      : 0;

    const selected = sampleWeightedChoice(
      [
        { value: { type: "fold" as const, playerId: null }, weight: foldWeight },
        { value: { type: "call" as const, amount: amountToCall, playerId: null }, weight: callWeight },
        {
          value: {
            type: "raise" as const,
            amount: chooseBettingAmount(
              state,
              player,
              profile,
              legalActions.find((legalAction) => legalAction.type === "raise") ?? legalActions[0],
              "raise"
            ),
            playerId: null,
          },
          weight: raiseWeight,
        },
        {
          value: {
            type: "all_in" as const,
            amount:
              legalActions.find((legalAction) => legalAction.type === "all_in")?.maxAmount ??
              legalActions.find((legalAction) => legalAction.type === "all_in")?.minAmount ??
              0,
            playerId: null,
          },
          weight: allInWeight,
        },
      ],
      choiceRoll
    );

    if (selected) {
      return selected;
    }

    if (legalCall) {
      return {
        type: "call",
        amount: amountToCall,
        playerId: null,
      };
    }

    if (legalFold) {
      return {
        type: "fold",
        playerId: null,
      };
    }

    return null;
  }

  const legalCheck = legalActions.some((legalAction) => legalAction.type === "check");
  const legalBet = legalActions.some((legalAction) => legalAction.type === "bet");
  const legalAllIn = legalActions.some((legalAction) => legalAction.type === "all_in");
  const checkWeight = legalCheck
    ? clamp01(0.15 + (1 - profile.aggression) * 0.18 + (1 - strength) * 0.08)
    : 0;
  const betWeight = legalBet
    ? clamp01(profile.aggression * 0.34 + strength * 0.28 + profile.bluffiness * (1 - strength) * 0.14 + (profile.id === "lag" ? 0.08 : 0))
    : 0;
  const allInWeight = legalAllIn && strength > 0.85 && player.stack / Math.max(1, state.pot.mainPot) <= 1.5
    ? clamp01(0.05 + strength * 0.1)
    : 0;

  const selected = sampleWeightedChoice(
    [
      { value: { type: "check" as const, playerId: null }, weight: checkWeight },
      {
        value: {
          type: "bet" as const,
          amount: chooseBettingAmount(
            state,
            player,
            profile,
            legalActions.find((legalAction) => legalAction.type === "bet") ?? legalActions[0],
            "bet"
          ),
          playerId: null,
        },
        weight: betWeight,
      },
      {
        value: {
          type: "all_in" as const,
          amount:
            legalActions.find((legalAction) => legalAction.type === "all_in")?.maxAmount ??
            legalActions.find((legalAction) => legalAction.type === "all_in")?.minAmount ??
            0,
          playerId: null,
        },
        weight: allInWeight,
      },
    ],
    choiceRoll
  );

  if (selected) {
    return selected;
  }

  if (legalCheck) {
    return {
      type: "check",
      playerId: null,
    };
  }

  if (legalBet) {
    return {
      type: "bet",
      amount: chooseBettingAmount(
        state,
        player,
        profile,
        legalActions.find((legalAction) => legalAction.type === "bet") ?? legalActions[0],
        "bet"
      ),
      playerId: null,
    };
  }

  return null;
}

export function chooseBotActionProfiled(
  state: GameState,
  player: PlayerState,
  legalActions: LegalAction[]
): PlayerAction | null {
  const profile = getBotPersonaProfile(player.botPersonaId);

  if (profile.id === "tag" || profile.id === "nit") {
    return chooseDeterministicBotAction(state, player, legalActions);
  }

  return chooseSampledBotAction(state, player, legalActions);
}
