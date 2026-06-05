import type { GameState, PlayerState } from "./types";
import { createStandardDeck } from "../../lib/poker/deck";

const players: PlayerState[] = [
  {
    id: "hero",
    name: "Hero",
    seatIndex: 0,
    isHero: true,
    isBot: false,
    stack: 1000,
    holeCards: [],
    currentStreetBet: 0,
    totalCommittedThisHand: 0,
    status: "waiting",
    hasActedThisStreet: false,
  },
  {
    id: "bot-1",
    name: "Bot 1",
    seatIndex: 1,
    isHero: false,
    isBot: true,
    botPersonaId: "tag",
    stack: 1000,
    holeCards: [],
    currentStreetBet: 0,
    totalCommittedThisHand: 0,
    status: "waiting",
    hasActedThisStreet: false,
  },
];

export function createSampleGameState(): GameState {
  return {
    config: {
      blinds: {
        smallBlind: 5,
        bigBlind: 10,
        ante: 0,
      },
      startingStack: 1000,
      maxPlayers: 6,
    },
    handNumber: 1,
    street: "not_started",
    dealerSeatIndex: null,
    buttonSeatIndex: null,
    players: players.map((player) => ({ ...player })),
    board: [],
    deck: createStandardDeck(),
    betting: {
      currentBet: 0,
      minRaiseTo: 10,
      lastAggressorSeatIndex: null,
      currentActorSeatIndex: null,
    },
    pot: {
      mainPot: 0,
      sidePots: [],
    },
    actionHistory: [],
    lastHandResult: null,
  };
}

export const sampleGameState = createSampleGameState();
