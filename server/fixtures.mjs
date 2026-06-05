function card(rank, suit) {
  return { rank, suit };
}

function player({
  id,
  name,
  seatIndex,
  isHero,
  stack,
  currentStreetBet,
  totalCommittedThisHand,
  status,
  holeCards,
}) {
  return {
    id,
    name,
    seatIndex,
    isHero,
    stack,
    currentStreetBet,
    totalCommittedThisHand,
    status,
    holeCards,
  };
}

function action({
  id,
  type,
  playerId,
  street,
  handNumber,
  amount,
  timestampMs,
}) {
  return {
    id,
    type,
    playerId,
    street,
    handNumber,
    amount,
    timestampMs,
  };
}

export const mockPreflopCoachRequest = {
  prompt: "What is the best play here?",
  sessionId: null,
  snapshot: {
    handNumber: 12,
    street: "preflop",
    heroPlayerId: "hero",
    legalActions: [
      { type: "fold" },
      { type: "call", callAmount: 10 },
      { type: "raise", minAmount: 30, maxAmount: 120 },
    ],
    gameState: {
      board: [],
      players: [
        player({
          id: "hero",
          name: "Hero",
          seatIndex: 0,
          isHero: true,
          stack: 990,
          currentStreetBet: 0,
          totalCommittedThisHand: 10,
          status: "active",
          holeCards: [card("A", "spades"), card("K", "spades")],
        }),
        player({
          id: "villain-1",
          name: "Villain 1",
          seatIndex: 1,
          isHero: false,
          stack: 980,
          currentStreetBet: 10,
          totalCommittedThisHand: 20,
          status: "active",
          holeCards: [],
        }),
      ],
      pot: {
        mainPot: 15,
        sidePots: [],
      },
      betting: {
        currentBet: 10,
        minRaiseTo: 30,
        lastAggressorSeatIndex: 1,
        currentActorSeatIndex: 0,
      },
      actionHistory: [
        action({
          id: "12:1",
          type: "start_hand",
          playerId: null,
          street: "not_started",
          handNumber: 12,
          timestampMs: 1,
        }),
        action({
          id: "12:2",
          type: "bet",
          playerId: "villain-1",
          street: "preflop",
          handNumber: 12,
          amount: 10,
          timestampMs: 2,
        }),
      ],
    },
  },
};

export const mockFlopCoachRequest = {
  prompt: "Explain my decision on the flop.",
  sessionId: "session-123",
  snapshot: {
    handNumber: 13,
    street: "flop",
    heroPlayerId: "hero",
    legalActions: [
      { type: "check" },
      { type: "bet", minAmount: 15, maxAmount: 80 },
    ],
    gameState: {
      board: [card("Q", "hearts"), card("8", "clubs"), card("4", "diamonds")],
      players: [
        player({
          id: "hero",
          name: "Hero",
          seatIndex: 0,
          isHero: true,
          stack: 940,
          currentStreetBet: 0,
          totalCommittedThisHand: 60,
          status: "active",
          holeCards: [card("A", "spades"), card("K", "spades")],
        }),
        player({
          id: "villain-1",
          name: "Villain 1",
          seatIndex: 1,
          isHero: false,
          stack: 940,
          currentStreetBet: 0,
          totalCommittedThisHand: 60,
          status: "active",
          holeCards: [],
        }),
      ],
      pot: {
        mainPot: 60,
        sidePots: [],
      },
      betting: {
        currentBet: 0,
        minRaiseTo: 15,
        lastAggressorSeatIndex: 0,
        currentActorSeatIndex: 0,
      },
      actionHistory: [
        action({
          id: "13:1",
          type: "start_hand",
          playerId: null,
          street: "not_started",
          handNumber: 13,
          timestampMs: 1,
        }),
        action({
          id: "13:2",
          type: "check",
          playerId: "villain-1",
          street: "flop",
          handNumber: 13,
          timestampMs: 2,
        }),
      ],
    },
  },
};

