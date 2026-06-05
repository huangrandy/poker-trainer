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
    aggression: 0.68,
    callDown: 0.36,
    bluffiness: 0.28,
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

function hashString(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getDecisionRoll(state: GameState, player: PlayerState): number {
  const seed = [
    state.handNumber,
    state.street,
    state.betting.currentBet,
    state.betting.minRaiseTo,
    state.board.map((card) => `${card.rank}${card.suit[0]}`).join(""),
    player.holeCards.map((card) => `${card.rank}${card.suit[0]}`).join(""),
    player.id,
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
    return facingBet ? -1 : 0.64 + (1 - strength) * 0.1;
  }

  if (actionType === "call") {
    return profile.callDown + strength * 0.6 - pressure * 0.45;
  }

  if (actionType === "fold") {
    return profile.tightness + (1 - strength) * 0.55 + pressure * 0.2;
  }

  if (actionType === "bet") {
    return profile.aggression + strength * 0.5 + profile.bluffiness * (1 - strength) - pressure * 0.1;
  }

  if (actionType === "raise") {
    return profile.aggression + strength * 0.65 + profile.bluffiness * (1 - strength) - pressure * 0.05;
  }

  if (actionType === "all_in") {
    return profile.aggression * 0.1 + strength * 0.2 - 0.25;
  }

  return -1;
}

export function chooseBotActionProfiled(
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
