import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions, rebuyPlayer, startHand, startNextHand } from "./engine";
import { createSampleGameState } from "./fixtures";
import { createStandardDeck } from "../../lib/poker/deck";
import type { Card, GameState, PlayerState } from "./types";

function makeCard(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

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
    expect(afterCheck.betting.currentActorSeatIndex).toBe(1);
  });

  it("uses the big blind as the first postflop actor heads-up", () => {
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

    expect(afterPreflop.street).toBe("flop");
    expect(afterPreflop.betting.currentActorSeatIndex).toBe(1);
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
        playerId: "bot-1",
      }),
      {
        type: "check",
        playerId: "hero",
      }
    );

    const afterTurn = applyAction(
      applyAction(afterFlop, {
        type: "check",
        playerId: "bot-1",
      }),
      {
        type: "check",
        playerId: "hero",
      }
    );

    const afterRiver = applyAction(
      applyAction(afterTurn, {
        type: "check",
        playerId: "bot-1",
      }),
      {
        type: "check",
        playerId: "hero",
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

  it("runs out the board after a preflop shove is called heads-up", () => {
    const preflopState: GameState = {
      config: {
        blinds: {
          smallBlind: 5,
          bigBlind: 10,
          ante: 0,
        },
        startingStack: 1000,
        maxPlayers: 6,
      },
      handNumber: 23,
      street: "preflop",
      dealerSeatIndex: 0,
      buttonSeatIndex: 0,
      board: [],
      deck: createStandardDeck(),
      players: [
        {
          id: "hero",
          name: "Hero",
          seatIndex: 0,
          isHero: true,
          isBot: false,
          stack: 500,
          holeCards: [makeCard("A", "clubs"), makeCard("K", "diamonds")],
          currentStreetBet: 5,
          totalCommittedThisHand: 5,
          status: "active",
          hasActedThisStreet: false,
        },
        {
          id: "bot-1",
          name: "Bot 1",
          seatIndex: 1,
          isHero: false,
          isBot: true,
          botPersonaId: "tag",
          stack: 490,
          holeCards: [makeCard("Q", "clubs"), makeCard("J", "diamonds")],
          currentStreetBet: 10,
          totalCommittedThisHand: 10,
          status: "active",
          hasActedThisStreet: false,
        },
      ],
      betting: {
        currentBet: 10,
        minRaiseTo: 20,
        lastAggressorSeatIndex: 1,
        currentActorSeatIndex: 0,
      },
      pot: {
        mainPot: 15,
        sidePots: [],
      },
      actionHistory: [],
      lastHandResult: null,
    };

    const afterHeroShove = applyAction(preflopState, {
      type: "all_in",
      playerId: "hero",
    });

    expect(afterHeroShove.street).toBe("preflop");
    expect(afterHeroShove.betting.currentActorSeatIndex).toBe(1);

    const finished = applyAction(afterHeroShove, {
      type: "call",
      playerId: "bot-1",
    });

    expect(finished.street).toBe("hand_complete");
    expect(finished.board).toHaveLength(5);
    expect(finished.betting.currentActorSeatIndex).toBeNull();
    expect(finished.actionHistory.map((record) => record.type)).toContain("showdown");
    expect(finished.actionHistory.map((record) => record.type)).not.toContain("deal_next_street");
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
    expect(afterFold.players.find((player) => player.id === "bot-1")?.stack).toBe(1005);
    expect(afterFold.pot.mainPot).toBe(0);
    expect(afterFold.lastHandResult?.kind).toBe("fold");
    expect(afterFold.lastHandResult?.potAwarded).toBe(15);
    expect(afterFold.lastHandResult?.winnerIds).toEqual(["bot-1"]);
    expect(afterFold.lastHandResult?.playerResults.find((player) => player.playerId === "hero")?.handLabel).toBe("Folded");
    expect(afterFold.lastHandResult?.playerResults.find((player) => player.playerId === "bot-1")?.handLabel).toBe(
      "Won by fold"
    );
  });

  it("awards the pot to the showdown winner", () => {
    const showdownState: GameState = {
      ...createSampleGameState(),
      handNumber: 3,
      street: "river",
      dealerSeatIndex: 0,
      buttonSeatIndex: 0,
      board: [
        makeCard("2", "clubs"),
        makeCard("3", "diamonds"),
        makeCard("4", "hearts"),
        makeCard("5", "spades"),
        makeCard("9", "clubs"),
      ],
      deck: createSampleGameState().deck,
      players: createSampleGameState().players.map((player) => {
        if (player.id === "hero") {
          return {
            ...player,
            stack: 995,
            holeCards: [makeCard("A", "clubs"), makeCard("6", "clubs")],
            currentStreetBet: 0,
            totalCommittedThisHand: 10,
            status: "active" as const,
            hasActedThisStreet: true,
          };
        }

        return {
          ...player,
          stack: 990,
          holeCards: [makeCard("K", "clubs"), makeCard("K", "diamonds")],
          currentStreetBet: 0,
          totalCommittedThisHand: 10,
          status: "active" as const,
          hasActedThisStreet: true,
        };
      }),
      betting: {
        currentBet: 0,
        minRaiseTo: 10,
        lastAggressorSeatIndex: null,
        currentActorSeatIndex: 0,
      },
      pot: {
        mainPot: 25,
        sidePots: [],
      },
      actionHistory: [],
    };

    const afterHeroCheck = applyAction(showdownState, {
      type: "check",
      playerId: "hero",
    });
    const finished = applyAction(afterHeroCheck, {
      type: "check",
      playerId: "bot-1",
    });

    expect(finished.street).toBe("hand_complete");
    expect(finished.pot.mainPot).toBe(0);
    expect(finished.players.find((player) => player.id === "hero")?.stack).toBe(1020);
    expect(finished.players.find((player) => player.id === "bot-1")?.stack).toBe(990);
    expect(finished.lastHandResult?.kind).toBe("showdown");
    expect(finished.lastHandResult?.potAwarded).toBe(25);
    expect(finished.lastHandResult?.winnerIds).toEqual(["hero"]);
    expect(finished.lastHandResult?.playerResults.find((player) => player.playerId === "hero")?.handLabel).toContain(
      "straight"
    );
    expect(finished.lastHandResult?.playerResults.find((player) => player.playerId === "hero")?.cardsUsed).toHaveLength(5);
  });

  it("splits the pot on a tied showdown", () => {
    const tieState: GameState = {
      ...createSampleGameState(),
      handNumber: 4,
      street: "river",
      dealerSeatIndex: 0,
      buttonSeatIndex: 0,
      board: [
        makeCard("2", "clubs"),
        makeCard("2", "diamonds"),
        makeCard("5", "hearts"),
        makeCard("5", "spades"),
        makeCard("A", "clubs"),
      ],
      deck: createSampleGameState().deck,
      players: createSampleGameState().players.map((player) => {
        if (player.id === "hero") {
          return {
            ...player,
            stack: 1000,
            holeCards: [makeCard("K", "clubs"), makeCard("Q", "diamonds")],
            currentStreetBet: 0,
            totalCommittedThisHand: 10,
            status: "active" as const,
            hasActedThisStreet: true,
          };
        }

        return {
          ...player,
          stack: 1000,
          holeCards: [makeCard("J", "clubs"), makeCard("T", "diamonds")],
          currentStreetBet: 0,
          totalCommittedThisHand: 10,
          status: "active" as const,
          hasActedThisStreet: true,
        };
      }),
      betting: {
        currentBet: 0,
        minRaiseTo: 10,
        lastAggressorSeatIndex: null,
        currentActorSeatIndex: 0,
      },
      pot: {
        mainPot: 20,
        sidePots: [],
      },
      actionHistory: [],
      lastHandResult: null,
    };

    const afterHeroCheck = applyAction(tieState, {
      type: "check",
      playerId: "hero",
    });
    const finished = applyAction(afterHeroCheck, {
      type: "check",
      playerId: "bot-1",
    });

    expect(finished.street).toBe("hand_complete");
    expect(finished.pot.mainPot).toBe(0);
    expect(finished.players.find((player) => player.id === "hero")?.stack).toBe(1010);
    expect(finished.players.find((player) => player.id === "bot-1")?.stack).toBe(1010);
    expect(finished.lastHandResult?.kind).toBe("showdown");
    expect(finished.lastHandResult?.winnerIds).toEqual(["hero", "bot-1"]);
    expect(
      finished.lastHandResult?.playerResults.find((player) => player.playerId === "hero")?.handLabel
    ).toContain("2 pair");
    expect(
      finished.lastHandResult?.playerResults.find((player) => player.playerId === "bot-1")?.handLabel
    ).toContain("2 pair");
  });

  it("rebuying the hero restores chips for the next hand", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });
    const bustedHeroState: GameState = {
      ...started,
      street: "hand_complete",
      board: [...started.board],
      betting: {
        ...started.betting,
        currentActorSeatIndex: null,
      },
      pot: {
        ...started.pot,
        mainPot: 1010,
      },
      players: started.players.map((player) => {
        if (player.id === "hero") {
          return {
            ...player,
            stack: 0,
            status: "all_in" as const,
          };
        }

        return {
          ...player,
          stack: 990,
        };
      }),
    };

    const rebought = rebuyPlayer(bustedHeroState, "hero");
    const nextHand = startNextHand(rebought, { random: () => 0 });

    expect(rebought.players.find((player) => player.id === "hero")?.stack).toBe(1000);
    expect(rebought.players.find((player) => player.id === "hero")?.status).toBe("waiting");
    expect(nextHand.handNumber).toBe(2);
    expect(nextHand.street).toBe("preflop");
    expect(nextHand.players.find((player) => player.id === "hero")?.stack).toBe(990);
    expect(nextHand.betting.currentActorSeatIndex).not.toBeNull();
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
    expect(nextHand.lastHandResult).toBeNull();
    expect(nextNextHand.lastHandResult).toBeNull();
  });
});
