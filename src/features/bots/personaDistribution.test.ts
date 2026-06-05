import { describe, expect, it } from "vitest";
import { advanceBotTurns, chooseBotActionForPlayer } from "./simpleBot";
import { createSampleGameState } from "../game-engine/fixtures";
import { applyAction, getLegalActions, startHand } from "../game-engine/engine";
import type { Card, GameState, PlayerAction, PlayerState } from "../game-engine/types";
import { createStandardCardSet } from "../../lib/poker/cards";
import { shuffleCards } from "../../lib/poker/deck";
import type { BotPersonaId } from "./personas";

type PersonaMetrics = {
  total: number;
  fold: number;
  check: number;
  call: number;
  bet: number;
  raise: number;
  allIn: number;
};

type CorpusScenario = {
  name: string;
  state: GameState;
  bot: PlayerState;
  legalActions: ReturnType<typeof getLegalActions>;
};

function makeCard(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function drawSeededCards(seed: number): Card[] {
  const random = createSeededRandom(seed);
  return shuffleCards(createStandardCardSet(), random);
}

function createScenarioState(options: {
  seed: number;
  personaId: BotPersonaId;
  street: GameState["street"];
  currentBet: number;
  minRaiseTo: number;
  boardCount: number;
  includeExtraBot?: boolean;
}): CorpusScenario {
  const baseState = createSampleGameState();
  const deck = drawSeededCards(options.seed);
  const [botCard1, botCard2, heroCard1, heroCard2, extraCard1, extraCard2, ...boardCards] = deck;
  const botSeatIndex = 1;
  const heroSeatIndex = 0;
  const extraBotSeatIndex = 2;
  const board = boardCards.slice(0, options.boardCount);
  const currentBet = options.currentBet;

  const players: PlayerState[] = baseState.players.map((player) => {
    if (player.id === "bot-1") {
      return {
        ...player,
        botPersonaId: options.personaId,
        holeCards: [botCard1 ?? makeCard("A", "spades"), botCard2 ?? makeCard("K", "spades")],
        stack: 1000,
        currentStreetBet: 0,
        totalCommittedThisHand: 0,
        status: "active" as const,
        hasActedThisStreet: false,
      };
    }

    return {
      ...player,
      holeCards: [heroCard1 ?? makeCard("Q", "clubs"), heroCard2 ?? makeCard("J", "clubs")],
      stack: 1000,
      currentStreetBet: currentBet,
      totalCommittedThisHand: currentBet,
      status: "active" as const,
      hasActedThisStreet: currentBet > 0,
    };
  });

  if (options.includeExtraBot) {
    players.push({
      id: "bot-2",
      name: "Bot 2",
      seatIndex: extraBotSeatIndex,
      isHero: false,
      isBot: true,
      botPersonaId: options.personaId,
      stack: 1000,
      holeCards: [extraCard1 ?? makeCard("9", "hearts"), extraCard2 ?? makeCard("8", "hearts")],
      currentStreetBet: currentBet,
      totalCommittedThisHand: currentBet,
      status: "active",
      hasActedThisStreet: currentBet > 0,
    });
  }

  const bot = players.find((player) => player.id === "bot-1");

  if (!bot) {
    throw new Error("Expected a bot player.");
  }

  const state: GameState = {
    ...baseState,
    street: options.street,
    board,
    players,
    betting: {
      ...baseState.betting,
      currentBet,
      minRaiseTo: options.minRaiseTo,
      lastAggressorSeatIndex: currentBet > 0 ? heroSeatIndex : null,
      currentActorSeatIndex: botSeatIndex,
    },
    pot: {
      mainPot: Math.max(0, currentBet * (players.length - 1)),
      sidePots: [],
    },
  };

  return {
    name: `${options.personaId}:${options.street}:${options.seed}`,
    state,
    bot,
    legalActions: getLegalActions(state, bot.id),
  };
}

function createCorpus(personaId: BotPersonaId, family: "pressure" | "no_pressure" | "postflop", size: number): CorpusScenario[] {
  return Array.from({ length: size }).map((_, index) => {
    const seed = 10_000 + index * 97 + (personaId === "general" ? 1 : 0);

    if (family === "pressure") {
      const currentBet = [10, 20, 40][index % 3];

      return createScenarioState({
        seed,
        personaId,
        street: "preflop",
        currentBet,
        minRaiseTo: currentBet * 2,
        boardCount: 0,
      });
    }

    if (family === "no_pressure") {
      return createScenarioState({
        seed,
        personaId,
        street: "preflop",
        currentBet: 0,
        minRaiseTo: 10,
        boardCount: 0,
      });
    }

    const streets: GameState["street"][] = ["flop", "turn", "river"];
    const street = streets[index % streets.length];
    const boardCount = street === "flop" ? 3 : street === "turn" ? 4 : 5;
    const currentBet = [10, 25, 50][index % 3];

    return createScenarioState({
      seed,
      personaId,
      street,
      currentBet,
      minRaiseTo: currentBet * 2,
      boardCount,
      includeExtraBot: index % 4 === 0,
    });
  });
}

function summarizeActions(scenarios: CorpusScenario[]): PersonaMetrics {
  const totals: PersonaMetrics = {
    total: 0,
    fold: 0,
    check: 0,
    call: 0,
    bet: 0,
    raise: 0,
    allIn: 0,
  };

  for (const scenario of scenarios) {
    const action = chooseBotActionForPlayer(scenario.state, scenario.bot, scenario.legalActions);

    expect(action).not.toBeNull();
    expect(scenario.legalActions.some((legalAction) => legalAction.type === action?.type)).toBe(true);

    totals.total += 1;

    switch (action?.type) {
      case "fold":
        totals.fold += 1;
        break;
      case "check":
        totals.check += 1;
        break;
      case "call":
        totals.call += 1;
        break;
      case "bet":
        totals.bet += 1;
        break;
      case "raise":
        totals.raise += 1;
        break;
      case "all_in":
        totals.allIn += 1;
        break;
      default:
        throw new Error(`Unexpected action type: ${(action as PlayerAction | null)?.type ?? "null"}`);
    }
  }

  return totals;
}

function rate(metrics: PersonaMetrics, key: keyof Omit<PersonaMetrics, "total">): number {
  return metrics[key] / metrics.total;
}

describe("bot persona distributions", () => {
  it("plays General more actively than TAG in pressured preflop spots", () => {
    const tagMetrics = summarizeActions(createCorpus("tag", "pressure", 72));
    const generalMetrics = summarizeActions(createCorpus("general", "pressure", 72));

    expect(rate(generalMetrics, "fold")).toBeLessThan(rate(tagMetrics, "fold"));
    expect(rate(generalMetrics, "call") + rate(generalMetrics, "raise") + rate(generalMetrics, "allIn")).toBeGreaterThan(
      rate(tagMetrics, "call") + rate(tagMetrics, "raise") + rate(tagMetrics, "allIn")
    );
  });

  it("plays LAG more aggressively than General in pressured preflop spots", () => {
    const generalMetrics = summarizeActions(createCorpus("general", "pressure", 72));
    const lagMetrics = summarizeActions(createCorpus("lag", "pressure", 72));

    expect(rate(lagMetrics, "fold")).toBeLessThan(rate(generalMetrics, "fold"));
    expect(rate(lagMetrics, "bet") + rate(lagMetrics, "raise") + rate(lagMetrics, "allIn")).toBeGreaterThan(
      rate(generalMetrics, "bet") + rate(generalMetrics, "raise") + rate(generalMetrics, "allIn")
    );
  });

  it("keeps Nit the tightest of the live personas in pressured preflop spots", () => {
    const tagMetrics = summarizeActions(createCorpus("tag", "pressure", 72));
    const generalMetrics = summarizeActions(createCorpus("general", "pressure", 72));
    const nitMetrics = summarizeActions(createCorpus("nit", "pressure", 72));

    expect(rate(nitMetrics, "fold")).toBeGreaterThan(rate(tagMetrics, "fold"));
    expect(rate(tagMetrics, "fold")).toBeGreaterThan(rate(generalMetrics, "fold"));
    expect(rate(nitMetrics, "call") + rate(nitMetrics, "raise") + rate(nitMetrics, "allIn")).toBeLessThan(
      rate(tagMetrics, "call") + rate(tagMetrics, "raise") + rate(tagMetrics, "allIn")
    );
  });

  it("gives General a slightly wider opening range than TAG when checked to", () => {
    const tagMetrics = summarizeActions(createCorpus("tag", "no_pressure", 48));
    const generalMetrics = summarizeActions(createCorpus("general", "no_pressure", 48));

    expect(rate(generalMetrics, "bet") + rate(generalMetrics, "allIn")).toBeGreaterThanOrEqual(
      rate(tagMetrics, "bet") + rate(tagMetrics, "allIn")
    );
    expect(rate(generalMetrics, "check")).toBeLessThanOrEqual(rate(tagMetrics, "check"));
  });

  it("gives LAG the widest opening range when checked to", () => {
    const generalMetrics = summarizeActions(createCorpus("general", "no_pressure", 48));
    const lagMetrics = summarizeActions(createCorpus("lag", "no_pressure", 48));

    expect(rate(lagMetrics, "bet") + rate(lagMetrics, "allIn")).toBeGreaterThan(
      rate(generalMetrics, "bet") + rate(generalMetrics, "allIn")
    );
    expect(rate(lagMetrics, "check")).toBeLessThan(rate(generalMetrics, "check"));
  });

  it("keeps the bot legal across mixed postflop spots", () => {
    const mixedCorpus = createCorpus("general", "postflop", 60);
    const metrics = summarizeActions(mixedCorpus);

    expect(metrics.total).toBe(60);
    expect(metrics.fold + metrics.check + metrics.call + metrics.bet + metrics.raise + metrics.allIn).toBe(60);
    expect(rate(metrics, "call") + rate(metrics, "bet") + rate(metrics, "raise") + rate(metrics, "allIn")).toBeGreaterThan(0);
  });

  it("smokes a longer bot sequence across preflop and flop before returning to the hero", () => {
    const started = startHand(createSampleGameState(), { random: () => 0 });
    const heroCall = applyAction(started, {
      type: "call",
      playerId: "hero",
    });

    const preflopAdvanced = advanceBotTurns(heroCall, { maxSteps: 4 });
    expect(preflopAdvanced.street).toBe("flop");
    expect(preflopAdvanced.betting.currentActorSeatIndex).toBe(0);
    const preflopActionCount = preflopAdvanced.actionHistory.filter((record) => record.playerId !== null).length;
    expect(preflopActionCount).toBeGreaterThanOrEqual(2);

    const heroLegalActions = getLegalActions(preflopAdvanced, "hero");
    const heroFollowUp = heroLegalActions.some((action) => action.type === "call")
      ? {
          type: "call" as const,
          playerId: "hero",
        }
      : {
          type: "check" as const,
          playerId: "hero",
        };

    const heroAction = applyAction(preflopAdvanced, heroFollowUp);

    const postflopAdvanced = advanceBotTurns(heroAction, { maxSteps: 4 });
    expect(postflopAdvanced.street).toBe("turn");
    expect(postflopAdvanced.betting.currentActorSeatIndex).toBe(0);
    expect(postflopAdvanced.actionHistory.filter((record) => record.playerId !== null).length).toBeGreaterThan(
      preflopActionCount
    );
  });
});
