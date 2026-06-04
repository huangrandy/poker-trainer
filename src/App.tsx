import { useEffect, useMemo, useState } from "react";
import { advanceBotTurns } from "./features/bots";
import { applyAction, getLegalActions, startHand } from "./features/game-engine/engine";
import { createSampleGameState } from "./features/game-engine/fixtures";
import type { GameState, LegalAction, PlayerAction, PlayerState } from "./features/game-engine/types";

function formatCardLabel(rank: string, suit: string): string {
  const suitSymbols: Record<string, string> = {
    clubs: "♣",
    diamonds: "♦",
    hearts: "♥",
    spades: "♠",
  };

  return `${rank}${suitSymbols[suit] ?? suit}`;
}

function formatPlayerStatus(player: PlayerState): string {
  if (player.status === "all_in") {
    return "All-in";
  }

  if (player.status === "folded") {
    return "Folded";
  }

  if (player.status === "out") {
    return "Sitting out";
  }

  return player.isBot ? "Bot" : "Hero";
}

function getSeatPosition(index: number, total: number): string {
  if (total <= 1) {
    return "seat-center";
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
    return `Call ${action.callAmount}`;
  }

  if ((action.type === "bet" || action.type === "raise") && action.minAmount !== undefined) {
    return `${action.type === "bet" ? "Bet" : "Raise"} ${action.minAmount}`;
  }

  if (action.type === "all_in" && action.maxAmount !== undefined) {
    return `All in ${action.maxAmount}`;
  }

  return action.type[0].toUpperCase() + action.type.slice(1);
}

function createInitialGameState(): GameState {
  return startHand(createSampleGameState(), { random: () => 0 });
}

function TableCard({ rank, suit }: { rank: string; suit: string }) {
  return <span className="table-card">{formatCardLabel(rank, suit)}</span>;
}

function SeatCard({
  player,
  isCurrentActor,
  positionClass,
}: {
  player: PlayerState;
  isCurrentActor: boolean;
  positionClass: string;
}) {
  return (
    <article className={`seat-card ${positionClass} ${isCurrentActor ? "is-current" : ""}`}>
      <div className="seat-card__header">
        <strong>{player.name}</strong>
        <span>{formatPlayerStatus(player)}</span>
      </div>
      <div className="seat-card__meta">
        <span>Stack {player.stack}</span>
        <span>Bet {player.currentStreetBet}</span>
      </div>
      <div className="seat-card__cards">
        {player.holeCards.length > 0 ? (
          player.holeCards.map((card, index) => (
            <TableCard key={`${player.id}-${card.rank}-${card.suit}-${index}`} rank={card.rank} suit={card.suit} />
          ))
        ) : (
          <span className="seat-card__empty">No hole cards</span>
        )}
      </div>
    </article>
  );
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

  useEffect(() => {
    const currentActor = gameState.betting.currentActorSeatIndex;

    if (currentActor === null) {
      return;
    }

    const currentPlayer = gameState.players.find((player) => player.seatIndex === currentActor);

    if (!currentPlayer?.isBot) {
      return;
    }

    setGameState((previous) => advanceBotTurns(previous));
  }, [gameState]);

  const currentActor = useMemo(
    () => gameState.players.find((player) => player.seatIndex === gameState.betting.currentActorSeatIndex) ?? null,
    [gameState.betting.currentActorSeatIndex, gameState.players]
  );

  const legalActions = useMemo(() => {
    if (!currentActor) {
      return [];
    }

    return getLegalActions(gameState, currentActor.id);
  }, [gameState, currentActor]);

  function handleAction(action: PlayerAction) {
    setGameState((previous) => {
      const nextState = applyAction(previous, action);
      return advanceBotTurns(nextState);
    });
  }

  function handleNewHand() {
    setGameState(createInitialGameState());
  }

  const boardLabel = gameState.board.length === 0 ? "No board yet" : "Board";
  const activePlayers = gameState.players.filter((player) => player.status !== "out");

  return (
    <main className="app-shell">
      <section className="table-layout">
        <header className="table-header">
          <div>
            <p className="eyebrow">Poker Trainer</p>
            <h1>Table view</h1>
          </div>
          <div className="table-header__stats">
            <div>
              <span>Hand</span>
              <strong>{gameState.handNumber}</strong>
            </div>
            <div>
              <span>Street</span>
              <strong>{gameState.street}</strong>
            </div>
            <div>
              <span>Pot</span>
              <strong>{gameState.pot.mainPot}</strong>
            </div>
          </div>
        </header>

        <div className="table-stage">
          <div className="table-stage__center">
            <div className="board-panel">
              <div className="board-panel__row">
                <span>{boardLabel}</span>
                <strong>{gameState.board.length}/5</strong>
              </div>
              <div className="board-panel__cards">
                {gameState.board.length > 0 ? (
                  gameState.board.map((card, index) => (
                    <TableCard key={`${card.rank}-${card.suit}-${index}`} rank={card.rank} suit={card.suit} />
                  ))
                ) : (
                  <span className="board-panel__empty">Community cards will appear here</span>
                )}
              </div>
              <div className="board-panel__row">
                <span>Current actor</span>
                <strong>{currentActor ? currentActor.name : "None"}</strong>
              </div>
            </div>
          </div>

          <div className="seat-layer">
            {activePlayers.map((player, index) => (
              <SeatCard
                key={player.id}
                player={player}
                isCurrentActor={player.id === currentActor?.id}
                positionClass={getSeatPosition(index, activePlayers.length)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="dashboard">
        <article className="panel">
          <div className="panel__header">
            <h2>Legal actions</h2>
            <span>{currentActor ? currentActor.name : "No player acting"}</span>
          </div>
          <div className="action-row">
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
              <p className="panel__empty">
                {gameState.street === "hand_complete"
                  ? "Hand complete. Start a new hand to continue."
                  : "No legal actions available right now."}
              </p>
            )}
          </div>
          {gameState.street === "hand_complete" ? (
            <button className="primary-button" type="button" onClick={handleNewHand}>
              Start new hand
            </button>
          ) : null}
        </article>

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
                  <strong>{record.type}</strong>
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
