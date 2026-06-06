import { describe, expect, it } from "vitest";
import { advanceBotTurns, chooseBotActionForPlayer, chooseSimpleBotAction } from "./simpleBot";
import { getBotPersonaProfile } from "./personas";
import { applyAction, startHand } from "../game-engine/engine";
import { createSampleGameState } from "../game-engine/fixtures";
import type { GameState, PlayerState } from "../game-engine/types";

function makeCard(rank: GameState["board"][number]["rank"], suit: GameState["board"][number]["suit"]) {
  return { rank, suit };
}

function createBotDecisionState(botPersonaId?: PlayerState["botPersonaId"]) {
  const started = startHand(createSampleGameState(), { random: () => 0 });
  const bot = started.players.find((player) => player.id === "bot-1");

  if (!bot) {
    throw new Error("Expected bot player.");
  }

  const nextPlayers = started.players.map((player) => {
    if (player.id !== bot.id) {
      return player;
    }

    return {
      ...player,
      ...(botPersonaId === undefined ? {} : { botPersonaId }),
      holeCards: [makeCard("A", "spades"), makeCard("A", "hearts")],
      stack: 990,
      currentStreetBet: 0,
      status: "active" as const,
      hasActedThisStreet: true,
    };
  });

  const state: GameState = {
    ...started,
    street: "preflop",
    players: nextPlayers,
    betting: {
      ...started.betting,
      currentBet: 0,
      minRaiseTo: 10,
      currentActorSeatIndex: bot.seatIndex,
    },
  };

  return {
    state,
    bot: state.players.find((player) => player.id === bot.id) as PlayerState,
  };
}

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

  it("includes the call amount when choosing a call", () => {
    const action = chooseSimpleBotAction([{ type: "call", callAmount: 15 }]);

    expect(action).toEqual({
      type: "call",
      playerId: null,
      amount: 15,
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

  it("uses the TAG persona for an explicit bot profile", () => {
    const { state, bot } = createBotDecisionState("tag");

    expect(getBotPersonaProfile(bot.botPersonaId).id).toBe("tag");
    expect(
      chooseBotActionForPlayer(
        state,
        bot,
        [
          { type: "check" },
          { type: "bet", minAmount: 10, maxAmount: 990 },
          { type: "all_in", minAmount: 990, maxAmount: 990 },
        ]
      )
    ).toEqual({
      type: "bet",
      playerId: null,
      amount: 10,
    });
  });

  it("defaults a missing persona to TAG", () => {
    const { state, bot } = createBotDecisionState(undefined);

    expect(getBotPersonaProfile(bot.botPersonaId).id).toBe("tag");
    expect(
      chooseBotActionForPlayer(
        state,
        bot,
        [
          { type: "check" },
          { type: "bet", minAmount: 10, maxAmount: 990 },
          { type: "all_in", minAmount: 990, maxAmount: 990 },
        ]
      )
    ).toEqual({
      type: "bet",
      playerId: null,
      amount: 10,
    });
  });

  it("uses the general persona when selected", () => {
    const { bot } = createBotDecisionState("general");

    expect(getBotPersonaProfile(bot.botPersonaId).id).toBe("general");
  });

  it("uses the lag persona when selected", () => {
    const { bot } = createBotDecisionState("lag");

    expect(getBotPersonaProfile(bot.botPersonaId).id).toBe("lag");
  });

  it("uses the nit persona when selected", () => {
    const { bot } = createBotDecisionState("nit");

    expect(getBotPersonaProfile(bot.botPersonaId).id).toBe("nit");
  });

  it("auto-advances bot turns until the hero is next", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });
    const pressured = {
      ...started,
      players: started.players.map((player) => {
        if (player.id === "bot-1") {
          return {
            ...player,
            holeCards: [makeCard("T", "spades"), makeCard("T", "hearts")],
          };
        }

        return player;
      }),
    };

    const afterHeroRaise = applyAction(pressured, {
      type: "raise",
      playerId: "hero",
      amount: 20,
    });

    const advanced = advanceBotTurns(afterHeroRaise);

    expect(advanced.street).toBe("flop");
    expect(advanced.betting.currentActorSeatIndex).toBe(0);
    expect(advanced.board).toHaveLength(3);
  });

  it("stops advancing when the hero is the current actor", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });

    const advanced = advanceBotTurns(started);

    expect(advanced.betting.currentActorSeatIndex).toBe(0);
    expect(advanced.street).toBe("preflop");
  });

  it("stops advancing when the hand is complete", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });
    const completed = applyAction(started, {
      type: "fold",
      playerId: "hero",
    });

    const advanced = advanceBotTurns(completed);

    expect(advanced.street).toBe("hand_complete");
    expect(advanced.betting.currentActorSeatIndex).toBeNull();
  });
});
