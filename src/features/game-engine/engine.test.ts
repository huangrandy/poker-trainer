import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions, startHand } from "./engine";
import { createSampleGameState } from "./fixtures";

describe("engine basics", () => {
  it("starts a hand by dealing cards, posting blinds, and setting the first actor", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });

    expect(started.street).toBe("preflop");
    expect(started.dealerSeatIndex).toBe(0);
    expect(started.buttonSeatIndex).toBe(0);
    expect(started.betting.currentActorSeatIndex).toBe(0);
    expect(started.betting.currentBet).toBe(10);
    expect(started.players[0].stack).toBe(995);
    expect(started.players[1].stack).toBe(990);
    expect(started.players[0].holeCards).toHaveLength(2);
    expect(started.players[1].holeCards).toHaveLength(2);
    expect(started.deck.cards).toHaveLength(48);
  });

  it("exposes legal actions for the acting player", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });
    const actions = getLegalActions(started, "hero");

    expect(actions.some((action) => action.type === "fold")).toBe(true);
    expect(actions.some((action) => action.type === "call")).toBe(true);
    expect(actions.some((action) => action.type === "check")).toBe(false);
  });

  it("applies call and check actions in turn order", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });
    const afterCall = applyAction(started, {
      type: "call",
      playerId: "hero",
    });

    expect(afterCall.players[0].stack).toBe(990);
    expect(afterCall.players[0].currentStreetBet).toBe(10);
    expect(afterCall.betting.currentActorSeatIndex).toBe(1);

    const afterCheck = applyAction(afterCall, {
      type: "check",
      playerId: "bot-1",
    });

    expect(afterCheck.players[1].hasActedThisStreet).toBe(true);
    expect(afterCheck.betting.currentActorSeatIndex).toBeNull();
  });

  it("ends the hand when a player folds heads-up", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });
    const afterFold = applyAction(started, {
      type: "fold",
      playerId: "hero",
    });

    expect(afterFold.players[0].status).toBe("folded");
    expect(afterFold.street).toBe("hand_complete");
    expect(afterFold.betting.currentActorSeatIndex).toBeNull();
  });
});
