import type {
  LegalActionType,
  PlayerActionType,
  PlayerStatus,
  Rank,
  Street,
  Suit,
} from "./types";

export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const satisfies readonly Suit[];

export const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
] as const satisfies readonly Rank[];

export const STREETS = [
  "not_started",
  "preflop",
  "flop",
  "turn",
  "river",
  "showdown",
  "hand_complete",
] as const satisfies readonly Street[];

export const PLAYER_STATUSES = [
  "waiting",
  "active",
  "folded",
  "all_in",
  "out",
] as const satisfies readonly PlayerStatus[];

export const LEGAL_ACTION_TYPES = [
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "all_in",
] as const satisfies readonly LegalActionType[];

export const PLAYER_ACTION_TYPES = [
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "all_in",
  "start_hand",
  "deal_next_street",
  "showdown",
] as const satisfies readonly PlayerActionType[];

export function isSuit(value: string): value is Suit {
  return (SUITS as readonly string[]).includes(value);
}

export function isRank(value: string): value is Rank {
  return (RANKS as readonly string[]).includes(value);
}

export function isStreet(value: string): value is Street {
  return (STREETS as readonly string[]).includes(value);
}

export function isPlayerStatus(value: string): value is PlayerStatus {
  return (PLAYER_STATUSES as readonly string[]).includes(value);
}
