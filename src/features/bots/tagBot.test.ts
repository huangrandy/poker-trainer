import { describe, expect, it } from "vitest";
import { advanceBotTurns, chooseBotActionForPlayer } from "./simpleBot";
import { getBotPersonaProfile, normalizeBotPersonaId } from "./personas";
import { createSampleGameState } from "../game-engine/fixtures";
import { getLegalActions } from "../game-engine/engine";
import type { Card, GameState, PlayerAction, PlayerState } from "../game-engine/types";

type TagBotStateOptions = {
  board?: Card[];
  botHoleCards?: Card[];
  botPersonaId?: unknown;
  botStack?: number;
  botStreetBet?: number;
  currentActorSeatIndex?: number;
  currentBet?: number;
  extraPlayers?: PlayerState[];
  handNumber?: number;
  heroHoleCards?: Card[];
  heroStack?: number;
  heroStreetBet?: number;
  minRaiseTo?: number;
  street?: GameState["street"];
};

function makeCard(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function createTagBotState(options: TagBotStateOptions = {}) {
  const baseState = createSampleGameState();
  const botHoleCards = options.botHoleCards ?? [makeCard("A", "spades"), makeCard("A", "hearts")];
  const heroHoleCards = options.heroHoleCards ?? [makeCard("K", "clubs"), makeCard("Q", "diamonds")];
  const extraPlayers = options.extraPlayers ?? [];

  const players: PlayerState[] = baseState.players.map((player) => {
    if (player.id === "hero") {
      return {
        ...player,
        holeCards: [...heroHoleCards],
        stack: options.heroStack ?? player.stack,
        currentStreetBet: options.heroStreetBet ?? 0,
        totalCommittedThisHand: options.heroStreetBet ?? 0,
        status: "active" as const,
        hasActedThisStreet: true,
      };
    }

    return {
      ...player,
      holeCards: [...botHoleCards],
      stack: options.botStack ?? player.stack,
      currentStreetBet: options.botStreetBet ?? 0,
      totalCommittedThisHand: options.botStreetBet ?? 0,
      status: "active" as const,
      hasActedThisStreet: true,
      ...(options.botPersonaId === undefined
        ? {}
        : { botPersonaId: normalizeBotPersonaId(options.botPersonaId) }),
    };
  });

  const bot = players.find((player) => player.id === "bot-1");

  if (!bot) {
    throw new Error("Expected the sample bot seat to exist.");
  }

  const state: GameState = {
    ...baseState,
    handNumber: options.handNumber ?? 17,
    street: options.street ?? "preflop",
    board: [...(options.board ?? [])],
    players: [...players, ...extraPlayers],
    betting: {
      ...baseState.betting,
      currentBet: options.currentBet ?? 0,
      minRaiseTo: options.minRaiseTo ?? baseState.config.blinds.bigBlind * 2,
      lastAggressorSeatIndex: null,
      currentActorSeatIndex: options.currentActorSeatIndex ?? bot.seatIndex,
    },
    pot: {
      mainPot: 0,
      sidePots: [],
    },
  };

  return {
    state,
    bot: state.players.find((player) => player.id === "bot-1") as PlayerState,
  };
}

function expectLegalSelection(state: GameState, bot: PlayerState, expectedType: PlayerAction["type"]) {
  const legalActions = getLegalActions(state, bot.id);
  const action = chooseBotActionForPlayer(state, bot, legalActions);

  expect(action).not.toBeNull();
  expect(action?.type).toBe(expectedType);
  expect(legalActions.some((legalAction) => legalAction.type === action?.type)).toBe(true);

  return action;
}

describe("TAG bot", () => {
  it("normalizes persona lookups safely", () => {
    expect(normalizeBotPersonaId("tag")).toBe("tag");
    expect(normalizeBotPersonaId("missing")).toBe("tag");
    expect(getBotPersonaProfile("tag").id).toBe("tag");
    expect(getBotPersonaProfile("nit").id).toBe("tag");
  });

  it("checks trash holdings when no one has bet", () => {
    const { state, bot } = createTagBotState({
      botHoleCards: [makeCard("7", "hearts"), makeCard("2", "clubs")],
      board: [],
      currentBet: 0,
      street: "preflop",
    });

    expectLegalSelection(state, bot, "check");
  });

  it("bets premium holdings when checked to preflop", () => {
    const { state, bot } = createTagBotState({
      botHoleCards: [makeCard("A", "spades"), makeCard("A", "hearts")],
      board: [],
      currentBet: 0,
      street: "preflop",
    });

    const action = expectLegalSelection(state, bot, "bet");

    expect(action).toEqual({
      type: "bet",
      playerId: null,
      amount: 10,
    });
  });

  it("checks suited broadway connectors when the spot is not strong enough to bet", () => {
    const { state, bot } = createTagBotState({
      botHoleCards: [makeCard("J", "diamonds"), makeCard("T", "diamonds")],
      board: [],
      currentBet: 0,
      street: "preflop",
    });

    expectLegalSelection(state, bot, "check");
  });

  it("folds weak holdings when facing preflop pressure", () => {
    const { state, bot } = createTagBotState({
      botHoleCards: [makeCard("9", "clubs"), makeCard("4", "diamonds")],
      board: [],
      currentBet: 20,
      minRaiseTo: 30,
      street: "preflop",
      botStreetBet: 0,
    });

    expectLegalSelection(state, bot, "fold");
  });

  it("calls with a made hand that is worth continuing with", () => {
    const { state, bot } = createTagBotState({
      botHoleCards: [makeCard("K", "spades"), makeCard("7", "hearts")],
      board: [makeCard("K", "clubs"), makeCard("K", "diamonds"), makeCard("2", "spades")],
      currentBet: 20,
      minRaiseTo: 40,
      street: "flop",
      botStreetBet: 0,
    });

    expectLegalSelection(state, bot, "call");
  });

  it("bets very strong made hands when checked to on the flop", () => {
    const { state, bot } = createTagBotState({
      botHoleCards: [makeCard("Q", "clubs"), makeCard("Q", "spades")],
      board: [makeCard("Q", "hearts"), makeCard("Q", "diamonds"), makeCard("2", "spades")],
      currentBet: 0,
      street: "flop",
    });

    const action = expectLegalSelection(state, bot, "bet");

    expect(action?.amount).toBe(10);
  });

  it("raises a full house against high river pressure", () => {
    const { state, bot } = createTagBotState({
      botHoleCards: [makeCard("5", "clubs"), makeCard("7", "diamonds")],
      board: [
        makeCard("2", "clubs"),
        makeCard("2", "diamonds"),
        makeCard("5", "hearts"),
        makeCard("5", "spades"),
        makeCard("A", "clubs"),
      ],
      currentBet: 400,
      minRaiseTo: 500,
      street: "river",
      botStreetBet: 0,
      botStack: 1000,
    });

    const action = expectLegalSelection(state, bot, "raise");

    expect(action?.amount).toBe(500);
  });

  it("remains legal in a multiway pot", () => {
    const extraBot: PlayerState = {
      id: "bot-2",
      name: "Bot 2",
      seatIndex: 2,
      isHero: false,
      isBot: true,
      botPersonaId: "tag",
      stack: 1000,
      holeCards: [makeCard("8", "hearts"), makeCard("8", "diamonds")],
      currentStreetBet: 0,
      totalCommittedThisHand: 0,
      status: "active",
      hasActedThisStreet: true,
    };

    const { state, bot } = createTagBotState({
      board: [makeCard("A", "clubs"), makeCard("K", "diamonds"), makeCard("4", "spades")],
      currentBet: 0,
      street: "flop",
      extraPlayers: [extraBot],
    });

    expectLegalSelection(state, bot, "check");
  });

  it("never overuses all-in across representative scenarios", () => {
    const scenarios: Array<{
      name: string;
      state: ReturnType<typeof createTagBotState>["state"];
      bot: PlayerState;
    }> = [];

    const preflopPremium = createTagBotState({
      botHoleCards: [makeCard("A", "spades"), makeCard("A", "hearts")],
      currentBet: 0,
      street: "preflop",
    });
    scenarios.push({ name: "premium preflop", ...preflopPremium });

    const preflopTrash = createTagBotState({
      botHoleCards: [makeCard("9", "clubs"), makeCard("4", "diamonds")],
      currentBet: 20,
      street: "preflop",
      botStreetBet: 0,
      minRaiseTo: 30,
    });
    scenarios.push({ name: "trash facing pressure", ...preflopTrash });

    const flopTrips = createTagBotState({
      botHoleCards: [makeCard("K", "spades"), makeCard("7", "hearts")],
      board: [makeCard("K", "clubs"), makeCard("K", "diamonds"), makeCard("2", "spades")],
      currentBet: 20,
      minRaiseTo: 40,
      street: "flop",
      botStreetBet: 0,
    });
    scenarios.push({ name: "flop trips", ...flopTrips });

    const riverFullHouse = createTagBotState({
      botHoleCards: [makeCard("5", "clubs"), makeCard("7", "diamonds")],
      board: [
        makeCard("2", "clubs"),
        makeCard("2", "diamonds"),
        makeCard("5", "hearts"),
        makeCard("5", "spades"),
        makeCard("A", "clubs"),
      ],
      currentBet: 400,
      minRaiseTo: 500,
      street: "river",
      botStreetBet: 0,
    });
    scenarios.push({ name: "river full house", ...riverFullHouse });

    for (const scenario of scenarios) {
      const action = chooseBotActionForPlayer(
        scenario.state,
        scenario.bot,
        getLegalActions(scenario.state, scenario.bot.id)
      );

      expect(action).not.toBeNull();
      expect(action?.type).not.toBe("all_in");
    }
  });

  it("advances through a TAG action and hands control back to the hero", () => {
    const { state } = createTagBotState({
      botHoleCards: [makeCard("A", "spades"), makeCard("A", "hearts")],
      currentBet: 0,
      street: "preflop",
      currentActorSeatIndex: 1,
    });

    const advanced = advanceBotTurns(state);

    expect(advanced.actionHistory.at(-1)?.type).toBe("bet");
    expect(advanced.betting.currentActorSeatIndex).toBe(0);
    expect(advanced.street).toBe("preflop");
  });
});
