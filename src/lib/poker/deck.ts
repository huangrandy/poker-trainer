import type { Card, DeckState } from "../../features/game-engine/types";
import { createStandardCardSet } from "./cards";

export function createStandardDeck(): DeckState {
  return {
    cards: createStandardCardSet(),
    isShuffled: false,
    seed: null,
  };
}

export function shuffleCards(cards: readonly Card[], random: () => number = Math.random): Card[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function shuffleDeck(deck: DeckState, random: () => number = Math.random): DeckState {
  return {
    ...deck,
    cards: shuffleCards(deck.cards, random),
    isShuffled: true,
  };
}

export function drawCards(
  deck: DeckState,
  count: number
): {
  cards: Card[];
  deck: DeckState;
} {
  const cards = deck.cards.slice(0, count);

  return {
    cards,
    deck: {
      ...deck,
      cards: deck.cards.slice(count),
    },
  };
}
