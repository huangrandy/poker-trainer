import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions, startHand, startNextHand } from "./engine";
import { createSampleGameState } from "./fixtures";
import type { GameState, PlayerState } from "./types";

function createThreePlayerGameState(): GameState {
  const state = createSampleGameState();
  const botTwo: PlayerState = {
    id: "bot-2",
    name: "Bot 2",
    seatIndex: 2,
    isHero: false,
    isBot: true,
    stack: 1000,
    holeCards: [],
    currentStreetBet: 0,
    totalCommittedThisHand: 0,
    status: "waiting",
    hasActedThisStreet: false,
  };

  return {
    ...state,
    players: [...state.players, botTwo],
  };
}

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

  it("rotates dealer, button, and first actor for a three-player table", () => {
    const started = startHand(createThreePlayerGameState(), { random: () => 0 });

    expect(started.dealerSeatIndex).toBe(0);
    expect(started.buttonSeatIndex).toBe(0);
    expect(started.betting.currentActorSeatIndex).toBe(0);
    expect(started.players[0].status).toBe("active");
    expect(started.players[1].status).toBe("active");
    expect(started.players[2].status).toBe("active");
    expect(started.pot.mainPot).toBe(15);
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

    expect(afterCheck.street).toBe("flop");
    expect(afterCheck.board).toHaveLength(3);
    expect(afterCheck.players[0].currentStreetBet).toBe(0);
    expect(afterCheck.players[1].currentStreetBet).toBe(0);
    expect(afterCheck.players[1].hasActedThisStreet).toBe(false);
    expect(afterCheck.betting.currentActorSeatIndex).toBe(0);
  });

  it("rejects bet amounts below the legal minimum", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });
    const afterHeroCall = applyAction(started, {
      type: "call",
      playerId: "hero",
    });
    const afterBotCheck = applyAction(afterHeroCall, {
      type: "check",
      playerId: "bot-1",
    });

    expect(() =>
      applyAction(afterBotCheck, {
        type: "bet",
        playerId: "hero",
        amount: 1,
      })
    ).toThrow();
  });

  it("rejects raise amounts below the legal minimum", () => {
    const started = startHand(createThreePlayerGameState(), { random: () => 0 });
    const afterHeroCall = applyAction(started, {
      type: "call",
      playerId: "hero",
    });

    expect(() =>
      applyAction(afterHeroCall, {
        type: "raise",
        playerId: "bot-1",
        amount: 11,
      })
    ).toThrow();
  });

  it("progresses through turn, river, showdown, and hand completion", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });
    const afterPreflop = applyAction(
      applyAction(started, {
        type: "call",
        playerId: "hero",
      }),
      {
        type: "check",
        playerId: "bot-1",
      }
    );

    const afterFlop = applyAction(
      applyAction(afterPreflop, {
        type: "check",
        playerId: "hero",
      }),
      {
        type: "check",
        playerId: "bot-1",
      }
    );

    const afterTurn = applyAction(
      applyAction(afterFlop, {
        type: "check",
        playerId: "hero",
      }),
      {
        type: "check",
        playerId: "bot-1",
      }
    );

    const afterRiver = applyAction(
      applyAction(afterTurn, {
        type: "check",
        playerId: "hero",
      }),
      {
        type: "check",
        playerId: "bot-1",
      }
    );

    expect(afterRiver.street).toBe("hand_complete");
    expect(afterRiver.board).toHaveLength(5);
    expect(afterRiver.betting.currentActorSeatIndex).toBeNull();
  });

  it("runs out the board and finishes the hand when every active player is all-in", () => {
    const state = startHand(createThreePlayerGameState(), { random: () => 0 });
    const allInRunoutState: GameState = {
      ...state,
      street: "turn",
      board: state.board.slice(0, 4),
      players: state.players.map((player) => {
        if (player.id === "hero" || player.id === "bot-1") {
          return {
            ...player,
            stack: 0,
            status: "all_in" as const,
            currentStreetBet: 20,
            totalCommittedThisHand: 20,
          };
        }

        return {
          ...player,
          stack: 25,
          status: "active" as const,
          currentStreetBet: 20,
          totalCommittedThisHand: 20,
        };
      }),
      betting: {
        ...state.betting,
        currentBet: 20,
        currentActorSeatIndex: 2,
      },
    };

    const finished = applyAction(allInRunoutState, {
      type: "all_in",
      playerId: "bot-2",
    });

    expect(finished.street).toBe("hand_complete");
    expect(finished.board).toHaveLength(5);
    expect(finished.betting.currentActorSeatIndex).toBeNull();
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

  it("starts consecutive hands from the completed table state without losing history", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });
    const completed = applyAction(started, {
      type: "fold",
      playerId: "hero",
    });
    const nextHand = startNextHand(completed, { random: () => 0 });
    const nextCompleted = applyAction(nextHand, {
      type: "fold",
      playerId: "bot-1",
    });
    const nextNextHand = startNextHand(nextCompleted, { random: () => 0 });

    expect(nextHand.handNumber).toBe(2);
    expect(nextHand.street).toBe("preflop");
    expect(nextHand.dealerSeatIndex).toBe(1);
    expect(nextHand.buttonSeatIndex).toBe(1);
    expect(nextHand.betting.currentActorSeatIndex).toBe(1);
    expect(nextHand.actionHistory.at(-1)?.type).toBe("start_hand");
    expect(nextHand.actionHistory.length).toBeGreaterThan(completed.actionHistory.length);
    expect(nextHand.actionHistory.slice(0, completed.actionHistory.length)).toEqual(
      completed.actionHistory
    );

    expect(nextNextHand.handNumber).toBe(3);
    expect(nextNextHand.dealerSeatIndex).toBe(0);
    expect(nextNextHand.buttonSeatIndex).toBe(0);
    expect(nextNextHand.betting.currentActorSeatIndex).toBe(0);
    expect(nextNextHand.actionHistory.at(-1)?.type).toBe("start_hand");
  });
});
