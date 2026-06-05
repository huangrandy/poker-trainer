import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PokerTableScene } from "./components/PokerTableScene";
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

const BLIND_REVEAL_DELAY_MS = 500;
const BOT_ACTION_DELAY_MS = 500;
const STREET_REVEAL_DELAY_MS = 500;

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

function buildVisibleActionLabelsForStreet(
    state: GameState,
    street: GameState["street"]
): Map<string, string> {
    const labels = new Map<string, string>();

    for (const record of state.actionHistory) {
        if (record.playerId === null) {
            continue;
        }

        if (record.handNumber !== state.handNumber || record.street !== street) {
            continue;
        }

        const label = describeVisibleAction(record);

        if (!label) {
            continue;
        }

        labels.set(record.playerId, label);
    }

    return labels;
}

function buildBlindRevealActions(state: GameState): Array<{ playerId: string; label: string }> {
    return state.players
        .filter((player) => player.status !== "out" && player.currentStreetBet > 0)
        .sort((left, right) => {
            if (left.currentStreetBet !== right.currentStreetBet) {
                return left.currentStreetBet - right.currentStreetBet;
            }

            return left.seatIndex - right.seatIndex;
        })
        .map((player, index) => ({
            playerId: player.id,
            label: `${index === 0 ? "Small blind" : "Big blind"} $${player.currentStreetBet}`,
        }));
}

function mergeActionLabels(primary: Map<string, string>, secondary: Map<string, string>): Map<string, string> {
    const merged = new Map(primary);

    for (const [playerId, label] of secondary) {
        merged.set(playerId, label);
    }

    return merged;
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
    const [tableActionLabels, setTableActionLabels] = useState<Map<string, string>>(() => new Map());
    const [blindActionLabels, setBlindActionLabels] = useState<Map<string, string>>(() => new Map());
    const [tableLocked, setTableLocked] = useState(true);
    const [streetReveal, setStreetReveal] = useState({
        active: false,
        fromIndex: 0,
    });
    const botTimerRef = useRef<number | null>(null);
    const blindRevealTimerRef = useRef<number | null>(null);
    const revealTimerRef = useRef<number | null>(null);
    const blindRevealActiveRef = useRef(false);
    const streetRevealActiveRef = useRef(false);
    const lastHandledStartHandIdRef = useRef<string | null>(null);
    const lastStreetRef = useRef<GameState["street"]>(gameState.street);
    const lastBoardLengthRef = useRef(gameState.board.length);

    const currentActor = useMemo(
        () => gameState.players.find((player) => player.seatIndex === gameState.betting.currentActorSeatIndex) ?? null,
        [gameState.betting.currentActorSeatIndex, gameState.players]
    );

    const latestStartHandRecord = useMemo(() => {
        for (let index = gameState.actionHistory.length - 1; index >= 0; index -= 1) {
            const record = gameState.actionHistory[index];

            if (record.handNumber === gameState.handNumber && record.type === "start_hand") {
                return record;
            }
        }

        return null;
    }, [gameState.actionHistory, gameState.handNumber]);

    const legalActions = useMemo(() => {
        if (!currentActor) {
            return [];
        }

        return getLegalActions(gameState, currentActor.id);
    }, [gameState, currentActor]);

    const handResult = gameState.lastHandResult;
    const isHandComplete = gameState.street === "hand_complete" && handResult !== null;
    const showVillainHoleCards = gameState.street === "showdown" || handResult?.kind === "showdown";
    const centerPotLabel = isHandComplete ? "Pot awarded" : "Pot";
    const centerPotAmount = handResult?.potAwarded ?? gameState.pot.mainPot;
    const handResultByPlayerId = useMemo(
        () =>
            new Map(
                handResult?.playerResults.map((result) => [result.playerId, result] as const) ?? []
            ),
        [handResult]
    );
    const visibleActionByPlayerId = useMemo(
        () => buildVisibleActionLabelsForStreet(gameState, gameState.street),
        [gameState.actionHistory, gameState.handNumber, gameState.street]
    );
    const sceneActionLabels = useMemo(() => {
        if (gameState.street !== "preflop") {
            return tableActionLabels;
        }

        return mergeActionLabels(tableActionLabels, blindActionLabels);
    }, [blindActionLabels, gameState.street, tableActionLabels]);
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

    useEffect(() => {
        if (tableLocked) {
            return;
        }

        setTableActionLabels(visibleActionByPlayerId);
    }, [tableLocked, visibleActionByPlayerId]);

    useLayoutEffect(() => {
        if (blindRevealActiveRef.current || streetRevealActiveRef.current) {
            return;
        }

        const startHandId = latestStartHandRecord?.id ?? null;

        if (startHandId !== null && startHandId !== lastHandledStartHandIdRef.current) {
            lastHandledStartHandIdRef.current = startHandId;
            blindRevealActiveRef.current = true;

            if (blindRevealTimerRef.current !== null) {
                window.clearTimeout(blindRevealTimerRef.current);
                blindRevealTimerRef.current = null;
            }

            if (revealTimerRef.current !== null) {
                window.clearTimeout(revealTimerRef.current);
                revealTimerRef.current = null;
            }

            const blindRevealActions = buildBlindRevealActions(gameState);
            setTableLocked(true);
            setTableActionLabels(new Map());
            setBlindActionLabels(new Map());

            if (blindRevealActions.length === 0) {
                blindRevealActiveRef.current = false;
                setTableActionLabels(visibleActionByPlayerId);
                setTableLocked(false);
                return;
            }

            let revealIndex = 0;

            const revealNextBlind = () => {
                const nextLabels = new Map<string, string>();

                for (let index = 0; index <= revealIndex; index += 1) {
                    const entry = blindRevealActions[index];

                    if (entry) {
                        nextLabels.set(entry.playerId, entry.label);
                    }
                }

                setTableActionLabels(nextLabels);

                if (revealIndex >= blindRevealActions.length - 1) {
                    blindRevealTimerRef.current = window.setTimeout(() => {
                        blindRevealActiveRef.current = false;
                        setBlindActionLabels(
                            new Map(blindRevealActions.map((entry) => [entry.playerId, entry.label]))
                        );
                        setTableActionLabels(visibleActionByPlayerId);
                        setTableLocked(false);
                        blindRevealTimerRef.current = null;
                    }, BLIND_REVEAL_DELAY_MS);
                    return;
                }

                revealIndex += 1;
                blindRevealTimerRef.current = window.setTimeout(revealNextBlind, BLIND_REVEAL_DELAY_MS);
            };

            blindRevealTimerRef.current = window.setTimeout(revealNextBlind, BLIND_REVEAL_DELAY_MS);
            lastStreetRef.current = gameState.street;
            lastBoardLengthRef.current = gameState.board.length;
            setStreetReveal({ active: false, fromIndex: gameState.board.length });
            return;
        }

        const previousStreet = lastStreetRef.current;
        const previousBoardLength = lastBoardLengthRef.current;
        lastStreetRef.current = gameState.street;
        lastBoardLengthRef.current = gameState.board.length;

        if (revealTimerRef.current !== null) {
            window.clearTimeout(revealTimerRef.current);
            revealTimerRef.current = null;
        }

        if (previousStreet === gameState.street) {
            setTableLocked(false);
            setStreetReveal({ active: false, fromIndex: gameState.board.length });
            return;
        }

        if (gameState.street === "showdown" || gameState.street === "hand_complete") {
            setBlindActionLabels(new Map());
            setTableActionLabels(visibleActionByPlayerId);
            setTableLocked(false);
            setStreetReveal({ active: false, fromIndex: gameState.board.length });
        } else {
            setBlindActionLabels(new Map());
            streetRevealActiveRef.current = true;
            const previousStreetActions = buildVisibleActionLabelsForStreet(gameState, previousStreet);

            setTableActionLabels(previousStreetActions);
            setTableLocked(true);
            setStreetReveal({
                active: true,
                fromIndex: previousBoardLength,
            });

            revealTimerRef.current = window.setTimeout(() => {
                streetRevealActiveRef.current = false;
                setTableActionLabels(visibleActionByPlayerId);
                setTableLocked(false);
                setStreetReveal({
                    active: false,
                    fromIndex: gameState.board.length,
                });
                revealTimerRef.current = null;
            }, STREET_REVEAL_DELAY_MS);
        }

        return () => {
            if (revealTimerRef.current !== null) {
                window.clearTimeout(revealTimerRef.current);
                revealTimerRef.current = null;
            }
        };
    }, [gameState, latestStartHandRecord, visibleActionByPlayerId]);

    useEffect(() => {
        if (botTimerRef.current !== null) {
            window.clearTimeout(botTimerRef.current);
            botTimerRef.current = null;
        }

        if (tableLocked || streetReveal.active || currentActor === null || !currentActor.isBot) {
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
    }, [currentActor, streetReveal.active, tableLocked, gameState.handNumber, gameState.street]);

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
        tableLocked && latestStartHandRecord !== null
            ? "Posting blinds..."
            : streetReveal.active
                ? "Dealing the next street..."
                : gameState.street === "hand_complete"
            ? canStartNextHand
                ? "Hand complete. Start a new hand to continue."
                : canRebuyHero
                    ? "Hand complete. Rebuy the hero to continue."
                    : "Hand complete. Not enough players remain to start a new hand."
                : "No legal actions available right now.";

    function handleAction(action: PlayerAction) {
        if (tableLocked) {
            return;
        }

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

                <div className="table-stage table-stage--demo">
                    <PokerTableScene
                        players={gameState.players}
                        board={gameState.board}
                        potLabel={centerPotLabel}
                        potAmount={centerPotAmount}
                        showVillainHoleCards={showVillainHoleCards}
                        visibleActionByPlayerId={sceneActionLabels}
                        handResultByPlayerId={handResultByPlayerId}
                        highlightedCardKeys={highlightedCardKeys}
                        streetReveal={streetReveal}
                        currentActorSeatIndex={tableLocked ? null : gameState.betting.currentActorSeatIndex}
                    />
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
