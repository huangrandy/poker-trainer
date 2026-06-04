import { describe, expect, it } from "vitest";
import { drawCards, createStandardDeck, shuffleDeck } from "./deck";

describe("deck utilities", () => {
  it("creates a standard 52-card deck", () => {
    const deck = createStandardDeck();

    expect(deck.cards).toHaveLength(52);
    expect(new Set(deck.cards.map((card) => `${card.rank}-${card.suit}`))).toHaveLength(52);
    expect(deck.isShuffled).toBe(false);
  });

  it("shuffles without changing the card set", () => {
    const deck = createStandardDeck();
    const shuffled = shuffleDeck(deck, () => 0.5);

    expect(shuffled.cards).toHaveLength(52);
    expect(new Set(shuffled.cards.map((card) => `${card.rank}-${card.suit}`))).toHaveLength(52);
    expect(shuffled.isShuffled).toBe(true);
  });

  it("draws cards from the top of the deck", () => {
    const deck = createStandardDeck();
    const { cards, deck: remainingDeck } = drawCards(deck, 3);

    expect(cards).toHaveLength(3);
    expect(remainingDeck.cards).toHaveLength(49);
    expect(cards[0]).toEqual(deck.cards[0]);
    expect(cards[2]).toEqual(deck.cards[2]);
  });
});
