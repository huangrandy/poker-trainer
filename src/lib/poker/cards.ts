import type { Card, Rank, Suit } from "../../features/game-engine/types";

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

export function createCard(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

export function createStandardCardSet(): Card[] {
  const cards: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push(createCard(rank, suit));
    }
  }

  return cards;
}
