export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A";

export type Card = {
  rank: Rank;
  suit: Suit;
};

export type Street =
  | "not_started"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "hand_complete";

export type PlayerId = string;
export type SeatIndex = number;

export type PlayerStatus =
  | "waiting"
  | "active"
  | "folded"
  | "all_in"
  | "out";

export type PlayerState = {
  id: PlayerId;
  name: string;
  seatIndex: SeatIndex;
  isHero: boolean;
  isBot: boolean;
  stack: number;
  holeCards: Card[];
  currentStreetBet: number;
  totalCommittedThisHand: number;
  status: PlayerStatus;
  hasActedThisStreet: boolean;
};

export type HandRevealPlayerResult = {
  playerId: PlayerId;
  seatIndex: SeatIndex;
  name: string;
  isWinner: boolean;
  handLabel: string;
  cardsUsed: Card[];
};

export type HandReveal = {
  kind: "fold" | "showdown";
  potAwarded: number;
  winnerIds: PlayerId[];
  playerResults: HandRevealPlayerResult[];
};

export type BlindConfig = {
  smallBlind: number;
  bigBlind: number;
  ante: number;
};

export type BettingState = {
  currentBet: number;
  minRaiseTo: number;
  lastAggressorSeatIndex: SeatIndex | null;
  currentActorSeatIndex: SeatIndex | null;
};

export type PotState = {
  mainPot: number;
  sidePots: Array<{
    amount: number;
    eligiblePlayerIds: PlayerId[];
  }>;
};

export type LegalActionType =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "all_in";

export type LegalAction = {
  type: LegalActionType;
  minAmount?: number;
  maxAmount?: number;
  callAmount?: number;
};

export type PlayerActionType =
  | LegalActionType
  | "start_hand"
  | "deal_next_street"
  | "showdown";

export type PlayerAction = {
  type: PlayerActionType;
  playerId: PlayerId | null;
  amount?: number;
};

export type ActionRecord = PlayerAction & {
  id: string;
  street: Street;
  handNumber: number;
  timestampMs: number;
};

export type DeckState = {
  cards: Card[];
  isShuffled: boolean;
  seed: string | null;
};

export type GameConfig = {
  blinds: BlindConfig;
  startingStack: number;
  maxPlayers: number;
};

export type GameState = {
  config: GameConfig;
  handNumber: number;
  street: Street;
  dealerSeatIndex: SeatIndex | null;
  buttonSeatIndex: SeatIndex | null;
  players: PlayerState[];
  board: Card[];
  deck: DeckState;
  betting: BettingState;
  pot: PotState;
  actionHistory: ActionRecord[];
  lastHandResult: HandReveal | null;
};

export type GameSnapshotForAnalysis = {
  gameState: GameState;
  heroPlayerId: PlayerId | null;
  legalActions: LegalAction[];
};
