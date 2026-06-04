import { describe, expect, it } from "vitest";
import { advanceBotTurns, chooseSimpleBotAction } from "./simpleBot";
import { applyAction, startHand } from "../game-engine/engine";
import { createSampleGameState } from "../game-engine/fixtures";

describe("simple bot", () => {
  it("prefers check over other legal actions", () => {
    const action = chooseSimpleBotAction([
      { type: "fold" },
      { type: "check" },
      { type: "call", callAmount: 10 },
    ]);

    expect(action).toEqual({
      type: "check",
      playerId: null,
    });
  });

  it("chooses the minimum legal bet when betting is available", () => {
    const action = chooseSimpleBotAction([
      { type: "bet", minAmount: 10, maxAmount: 100 },
    ]);

    expect(action).toEqual({
      type: "bet",
      playerId: null,
      amount: 10,
    });
  });

  it("auto-advances bot turns until the hero is next", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });
    const afterHeroCall = applyAction(started, {
      type: "call",
      playerId: "hero",
    });

    const advanced = advanceBotTurns(afterHeroCall);

    expect(advanced.street).toBe("flop");
    expect(advanced.betting.currentActorSeatIndex).toBe(0);
    expect(advanced.board).toHaveLength(3);
  });
});
