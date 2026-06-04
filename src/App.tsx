import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { advanceBotTurns } from "./features/bots";
import {
  applyAction,
  getLegalActions,
  rebuyPlayer,
  startHand,
  startNextHand,
} from "./features/game-engine/engine";
import { createSampleGameState } from "./features/game-engine/fixtures";
import type {
  Card,
  GameState,
  HandRevealPlayerResult,
  LegalAction,
  PlayerAction,
  PlayerState,
} from "./features/game-engine/types";

function formatCardLabel(rank: string, suit: string): string {
  const suitSymbols: Record<string, string> = {
    clubs: "♣",
    diamonds: "♦",
    hearts: "♥",
    spades: "♠",
  };

  return `${rank}${suitSymbols[suit] ?? suit}`;
}

function getCardKey(card: Card): string {
  return `${card.rank}:${card.suit}`;
}

function getSuitSymbol(suit: string): string {
  const suitSymbols: Record<string, string> = {
    clubs: "♣",
    diamonds: "♦",
    hearts: "♥",
    spades: "♠",
  };

  return suitSymbols[suit] ?? suit;
}

function getSuitTone(suit: string): string {
  if (suit === "diamonds" || suit === "hearts") {
    return "red";
  }

  return "black";
}

type SeatActionPlacement = "top" | "bottom" | "left" | "right";

const BOT_ACTION_DELAY_MS = 500;
const STREET_REVEAL_DELAY_MS = 450;

function getSeatActionPlacement(positionClass: string): SeatActionPlacement {
  if (positionClass === "seat-top") {
    return "bottom";
  }

  if (positionClass === "seat-bottom") {
    return "top";
  }

  if (positionClass === "seat-top-left" || positionClass === "seat-bottom-left") {
    return "right";
  }

  return "left";
}

function describeVisibleAction(record: GameState["actionHistory"][number]): string | null {
  if (record.playerId === null) {
    return null;
  }

  if (record.type === "check") {
    return "Check";
  }

  if (record.type === "fold") {
    return "Fold";
  }

  if (record.type === "call" && record.amount !== undefined) {
    return `Call $${record.amount}`;
  }

  if (record.type === "bet" && record.amount !== undefined) {
    return `Bet $${record.amount}`;
  }

  if (record.type === "raise" && record.amount !== undefined) {
    return `Raise $${record.amount}`;
  }

  if (record.type === "all_in" && record.amount !== undefined) {
    return `All in $${record.amount}`;
  }

  return null;
}

function getSeatPosition(index: number, total: number): string {
  if (total <= 1) {
    return "seat-bottom";
  }

  if (total === 2) {
    return index === 0 ? "seat-bottom" : "seat-top";
  }

  const positions = [
    "seat-bottom",
    "seat-bottom-right",
    "seat-top-right",
    "seat-top",
    "seat-top-left",
    "seat-bottom-left",
  ];

  return positions[index % positions.length];
}

function getLegalActionLabel(action: LegalAction): string {
  if (action.type === "call" && action.callAmount !== undefined) {
    return `Call $${action.callAmount}`;
  }

  if ((action.type === "bet" || action.type === "raise") && action.minAmount !== undefined) {
    return `${action.type === "bet" ? "Bet" : "Raise"} $${action.minAmount}`;
  }

  if (action.type === "all_in" && action.maxAmount !== undefined) {
    return `All in $${action.maxAmount}`;
  }

  return action.type[0].toUpperCase() + action.type.slice(1);
}

function createInitialGameState(): GameState {
  return startHand(createSampleGameState());
}

function TableCard({
  rank,
  suit,
  isHighlighted = false,
  isMuted = false,
  isFaceDown = false,
}: {
  rank: string;
  suit: string;
  isHighlighted?: boolean;
  isMuted?: boolean;
  isFaceDown?: boolean;
}) {
  return (
    <span
      aria-label={formatCardLabel(rank, suit)}
      className={[
        "table-card",
        `table-card--${getSuitTone(suit)}`,
        isFaceDown ? "table-card--face-down" : "",
        isHighlighted ? "table-card--highlighted" : "",
        isMuted ? "table-card--muted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-face-down={isFaceDown ? "true" : "false"}
    >
      <span className="table-card__inner">
        <span className="table-card__face table-card__face--front">
          <span className="table-card__rank">{rank}</span>
          <span className="table-card__suit">{getSuitSymbol(suit)}</span>
        </span>
        <span className="table-card__face table-card__face--back" aria-hidden="true" />
      </span>
    </span>
  );
}

function SeatCard({
  player,
  isCurrentActor,
  positionClass,
  actionLabel,
  actionPlacement,
  revealResult,
  highlightedCardKeys,
  isHandComplete,
}: {
  player: PlayerState;
  isCurrentActor: boolean;
  positionClass: string;
  actionLabel: string | null;
  actionPlacement: SeatActionPlacement;
  revealResult: HandRevealPlayerResult | null;
  highlightedCardKeys: Set<string>;
  isHandComplete: boolean;
}) {
  const isWinner = revealResult?.isWinner ?? false;
  const cardIsHighlighted = (card: Card) => highlightedCardKeys.has(getCardKey(card));
  const seatClasses = [
    "seat-card",
    positionClass,
    isCurrentActor ? "is-current" : "",
    isHandComplete && revealResult ? (isWinner ? "seat-card--winner" : "seat-card--loser") : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={seatClasses}>
      {actionLabel ? (
        <div className={`seat-card__action seat-card__action--${actionPlacement}`}>{actionLabel}</div>
      ) : null}
      <div className="seat-card__identity">
        <strong>{player.name}</strong>
        <span>Stack {player.stack}</span>
      </div>
      {revealResult ? <div className="seat-card__result">{revealResult.handLabel}</div> : null}
      <div className="seat-card__cards">
        {player.holeCards.length > 0 ? (
          player.holeCards.map((card, index) => (
            <TableCard
              key={`${player.id}-${card.rank}-${card.suit}-${index}`}
              rank={card.rank}
              suit={card.suit}
              isHighlighted={isHandComplete && revealResult ? cardIsHighlighted(card) : false}
              isMuted={isHandComplete && revealResult ? !cardIsHighlighted(card) : false}
            />
          ))
        ) : (
          <span className="seat-card__empty">No hole cards</span>
        )}
      </div>
    </article>
  );
}

function describeAction(record: GameState["actionHistory"][number], state: GameState): string {
  const actor =
    record.playerId === null
      ? "System"
      : state.players.find((player) => player.id === record.playerId)?.name ?? record.playerId;

  if (record.type === "call" && record.amount !== undefined) {
    return `${actor} called $${record.amount}`;
  }

  if (record.type === "check") {
    return `${actor} checked`;
  }

  if (record.type === "fold") {
    return `${actor} folded`;
  }

  if ((record.type === "bet" || record.type === "raise") && record.amount !== undefined) {
    return `${actor} ${record.type === "bet" ? "bet" : "raised"} to $${record.amount}`;
  }

  if (record.type === "all_in" && record.amount !== undefined) {
    return `${actor} went all in for $${record.amount}`;
  }

  if (record.type === "start_hand") {
    return `${actor} started the hand`;
  }

  if (record.type === "deal_next_street") {
    return `${actor} dealt the next street`;
  }

  if (record.type === "showdown") {
    return `${actor} triggered showdown`;
  }

  return `${actor} ${record.type}`;
}

function ActionButton({
  action,
  playerId,
  onAction,
}: {
  action: LegalAction;
  playerId: string;
  onAction: (action: PlayerAction) => void;
}) {
  return (
    <button
      className="action-button"
      type="button"
      onClick={() => {
        onAction({
          type: action.type,
          playerId,
          amount: action.minAmount ?? action.callAmount ?? action.maxAmount,
        });
      }}
    >
      {getLegalActionLabel(action)}
    </button>
  );
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => createInitialGameState());
  const [streetReveal, setStreetReveal] = useState({
    active: false,
    fromIndex: 0,
  });
  const botTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const lastHandledDealIdRef = useRef<string | null>(null);
  const lastFullyRevealedBoardLengthRef = useRef(0);

  const currentActor = useMemo(
    () => gameState.players.find((player) => player.seatIndex === gameState.betting.currentActorSeatIndex) ?? null,
    [gameState.betting.currentActorSeatIndex, gameState.players]
  );

  const latestStreetDealRecord = useMemo(() => {
    for (let index = gameState.actionHistory.length - 1; index >= 0; index -= 1) {
      const record = gameState.actionHistory[index];

      if (
        record.handNumber === gameState.handNumber &&
        record.street === gameState.street &&
        record.type === "deal_next_street"
      ) {
        return record;
      }
    }

    return null;
  }, [gameState.actionHistory, gameState.handNumber, gameState.street]);

  const latestPlayerActionRecord = useMemo(() => {
    for (let index = gameState.actionHistory.length - 1; index >= 0; index -= 1) {
      const record = gameState.actionHistory[index];

      if (
        record.handNumber === gameState.handNumber &&
        record.playerId !== null
      ) {
        return record;
      }
    }

    return null;
  }, [gameState.actionHistory, gameState.handNumber, gameState.street]);

  const legalActions = useMemo(() => {
    if (!currentActor) {
      return [];
    }

    return getLegalActions(gameState, currentActor.id);
  }, [gameState, currentActor]);

  const handResult = gameState.lastHandResult;
  const isHandComplete = gameState.street === "hand_complete" && handResult !== null;
  const centerPotLabel = isHandComplete ? "Pot awarded" : "Pot";
  const centerPotAmount = handResult?.potAwarded ?? gameState.pot.mainPot;
  const handResultByPlayerId = useMemo(
    () =>
      new Map(
        handResult?.playerResults.map((result) => [result.playerId, result] as const) ?? []
      ),
    [handResult]
  );
  const visibleActionByPlayerId = useMemo(() => {
    const latestActions = new Map<string, string>();

    for (const record of gameState.actionHistory) {
      if (record.playerId === null) {
        continue;
      }

      if (record.handNumber !== gameState.handNumber || record.street !== gameState.street) {
        continue;
      }

      const label = describeVisibleAction(record);

      if (!label) {
        continue;
      }

      latestActions.set(record.playerId, label);
    }

    return latestActions;
  }, [gameState.actionHistory, gameState.handNumber, gameState.street]);
  const highlightedCardKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const result of handResult?.playerResults ?? []) {
      if (!result.isWinner) {
        continue;
      }

      for (const card of result.cardsUsed) {
        keys.add(getCardKey(card));
      }
    }

    return keys;
  }, [handResult]);

  useLayoutEffect(() => {
    if (latestStreetDealRecord === null) {
      lastHandledDealIdRef.current = null;
      lastFullyRevealedBoardLengthRef.current = gameState.board.length;

      setStreetReveal((previous) =>
        previous.active || previous.fromIndex !== gameState.board.length
          ? { active: false, fromIndex: gameState.board.length }
          : previous
      );

      return;
    }

    if (lastHandledDealIdRef.current === latestStreetDealRecord.id) {
      return;
    }

    lastHandledDealIdRef.current = latestStreetDealRecord.id;

    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    const fromIndex = lastFullyRevealedBoardLengthRef.current;

    setStreetReveal({
      active: true,
      fromIndex,
    });

    revealTimerRef.current = window.setTimeout(() => {
      lastFullyRevealedBoardLengthRef.current = gameState.board.length;
      setStreetReveal({
        active: false,
        fromIndex: gameState.board.length,
      });
      revealTimerRef.current = null;
    }, STREET_REVEAL_DELAY_MS);

    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [gameState.board.length, latestStreetDealRecord, gameState.handNumber, gameState.street]);

  useEffect(() => {
    if (botTimerRef.current !== null) {
      window.clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }

    if (streetReveal.active || currentActor === null || !currentActor.isBot) {
      return;
    }

    botTimerRef.current = window.setTimeout(() => {
      setGameState((previous) => advanceBotTurns(previous, { maxSteps: 1 }));
      botTimerRef.current = null;
    }, BOT_ACTION_DELAY_MS);

    return () => {
      if (botTimerRef.current !== null) {
        window.clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }
    };
  }, [currentActor, streetReveal.active, gameState.handNumber, gameState.street]);

  const restartablePlayers = gameState.players.filter(
    (player) => player.status !== "out" && player.stack > 0
  );
  const canStartNextHand = gameState.street === "hand_complete" && restartablePlayers.length >= 2;
  const heroPlayer = gameState.players.find((player) => player.isHero) ?? null;
  const canRebuyHero =
    gameState.street === "hand_complete" &&
    heroPlayer?.stack === 0 &&
    gameState.players.some((player) => !player.isHero && player.stack > 0);
  const emptyActionMessage =
    gameState.street === "hand_complete"
      ? canStartNextHand
        ? "Hand complete. Start a new hand to continue."
        : canRebuyHero
          ? "Hand complete. Rebuy the hero to continue."
          : "Hand complete. Not enough players remain to start a new hand."
      : "No legal actions available right now.";

  function handleAction(action: PlayerAction) {
    setGameState((previous) => {
      const nextState = applyAction(previous, action);
      return nextState;
    });
  }

  function handleNewHand() {
    if (!canStartNextHand) {
      return;
    }

    setGameState((previous) => startNextHand(previous));
  }

  function handleRebuyAndStartNewHand() {
    if (!canRebuyHero || !heroPlayer) {
      return;
    }

    setGameState((previous) => {
      const hero = previous.players.find((player) => player.isHero);

      if (!hero || hero.stack > 0) {
        return previous;
      }

      return startNextHand(rebuyPlayer(previous, hero.id));
    });
  }

  const activePlayers = gameState.players.filter((player) => player.status !== "out");
  const latestActionLabel = latestPlayerActionRecord
    ? describeAction(latestPlayerActionRecord, gameState)
    : null;

  return (
    <main className="app-shell">
      <section className="table-layout">
        <div className="table-layout__corner table-layout__corner--brand">
          <p className="eyebrow">Poker Trainer</p>
          <h1>Table view</h1>
        </div>

        <div className="table-layout__corner table-layout__corner--stats">
          <div className="table-layout__stats">
            <div>
              <span>Hand</span>
              <strong>{gameState.handNumber}</strong>
            </div>
            <div>
              <span>Street</span>
              <strong>{gameState.street}</strong>
            </div>
          </div>
        </div>

        <div className="table-stage">
          <div className="table-stage__center">
            <div className="board-panel">
              <div className="board-panel__pot">
                <span className="board-panel__pot-label">{centerPotLabel}</span>
                <strong>{centerPotAmount}</strong>
                <button
                  className="board-panel__pot-tooltip"
                  type="button"
                  aria-label={`Current street bet ${gameState.betting.currentBet}`}
                  title={`Current street bet ${gameState.betting.currentBet}`}
                >
                  i
                  <span className="board-panel__pot-tooltip-content">
                    Current street bet {gameState.betting.currentBet}
                  </span>
                </button>
              </div>
              <div className="board-panel__cards">
                {gameState.board.length > 0 ? (
                  gameState.board.map((card, index) => (
                    <TableCard
                      key={`${card.rank}-${card.suit}-${index}`}
                      rank={card.rank}
                      suit={card.suit}
                      isHighlighted={isHandComplete && highlightedCardKeys.has(getCardKey(card))}
                      isMuted={isHandComplete && !highlightedCardKeys.has(getCardKey(card))}
                      isFaceDown={streetReveal.active && index >= streetReveal.fromIndex}
                    />
                  ))
                ) : (
                  <span className="board-panel__empty">Community cards will appear here</span>
                )}
              </div>
              {isHandComplete ? (
                <div className="board-panel__footer">
                  <span>Hand complete</span>
                  <strong>{handResult ? "Revealed" : "Waiting"}</strong>
                </div>
              ) : null}
            </div>
          </div>

          {latestActionLabel ? (
            <div className="table-stage__action-callout" key={latestPlayerActionRecord?.id}>
              {latestActionLabel}
            </div>
          ) : null}

          <div className="seat-layer">
            {activePlayers.map((player, index) => (
              <SeatCard
                key={player.id}
                player={player}
                isCurrentActor={player.id === currentActor?.id}
                positionClass={getSeatPosition(index, activePlayers.length)}
                actionLabel={visibleActionByPlayerId.get(player.id) ?? null}
                actionPlacement={getSeatActionPlacement(getSeatPosition(index, activePlayers.length))}
                revealResult={handResultByPlayerId.get(player.id) ?? null}
                highlightedCardKeys={highlightedCardKeys}
                isHandComplete={isHandComplete}
              />
            ))}
          </div>
        </div>

        <section className="table-actions" aria-label="Legal actions">
          <div className="table-actions__row">
            {legalActions.length > 0 ? (
              legalActions.map((action) => (
                <ActionButton
                  key={action.type}
                  action={action}
                  playerId={currentActor?.id ?? ""}
                  onAction={handleAction}
                />
              ))
            ) : (
              <p className="table-actions__empty">{emptyActionMessage}</p>
            )}
            {canStartNextHand ? (
              <button className="primary-button" type="button" onClick={handleNewHand}>
                Start new hand
              </button>
            ) : canRebuyHero ? (
              <button className="primary-button" type="button" onClick={handleRebuyAndStartNewHand}>
                Rebuy and start new hand
              </button>
            ) : null}
          </div>
        </section>
      </section>

      <section className="dashboard">
        <article className="panel">
          <div className="panel__header">
            <h2>State</h2>
            <span>{gameState.players.length} seats</span>
          </div>
          <dl className="state-grid">
            <div>
              <dt>Button</dt>
              <dd>{gameState.buttonSeatIndex ?? "None"}</dd>
            </div>
            <div>
              <dt>Dealer</dt>
              <dd>{gameState.dealerSeatIndex ?? "None"}</dd>
            </div>
            <div>
              <dt>Current bet</dt>
              <dd>{gameState.betting.currentBet}</dd>
            </div>
            <div>
              <dt>Min raise to</dt>
              <dd>{gameState.betting.minRaiseTo}</dd>
            </div>
            <div>
              <dt>Actor seat</dt>
              <dd>{gameState.betting.currentActorSeatIndex ?? "None"}</dd>
            </div>
            <div>
              <dt>Active players</dt>
              <dd>{activePlayers.length}</dd>
            </div>
          </dl>
        </article>

        <article className="panel panel--history">
          <div className="panel__header">
            <h2>Action history</h2>
            <span>{gameState.actionHistory.length} entries</span>
          </div>
          <ul className="history-list">
            {gameState.actionHistory.length > 0 ? (
              gameState.actionHistory.slice().reverse().map((record) => (
                <li key={record.id}>
                  <strong>{describeAction(record, gameState)}</strong>
                  <span>Hand {record.handNumber}</span>
                  <span>{record.street}</span>
                </li>
              ))
            ) : (
              <li className="panel__empty">No actions yet</li>
            )}
          </ul>
        </article>
      </section>
    </main>
  );
}
