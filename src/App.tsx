import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { PokerTableScene } from "./components/PokerTableScene";
import { DebugPanel } from "./components/DebugPanel";
import { advanceBotTurns, type BotPersonaId } from "./features/bots";
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
type RaisePresetKey = "min" | "half_pot" | "three_quarter_pot" | "pot" | "max";
type RaiseLegalAction = LegalAction & {
    type: "raise";
    minAmount: number;
    maxAmount: number;
};

const BLIND_REVEAL_DELAY_MS = 500;
const BOT_ACTION_DELAY_MS = 500;
const STREET_REVEAL_DELAY_MS = 500;
const GAME_STATE_STORAGE_KEY = "poker-trainer:game-state";
const GAME_STATE_STORAGE_VERSION = 1;

type PersistedGameState = {
    version: number;
    gameState: GameState;
};

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
            label: `${index === 0 ? "SB" : "BB"} $${player.currentStreetBet}`,
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

function isRaiseLegalAction(action: LegalAction): action is RaiseLegalAction {
    return action.type === "raise" && typeof action.minAmount === "number" && typeof action.maxAmount === "number";
}

function clampAmount(amount: number, minAmount: number, maxAmount: number): number {
    return Math.max(minAmount, Math.min(maxAmount, Math.round(amount)));
}

function getRaisePresetAmount(
    preset: RaisePresetKey,
    state: GameState,
    action: RaiseLegalAction
): number {
    const minAmount = action.minAmount ?? 0;
    const maxAmount = action.maxAmount ?? minAmount;
    const currentBet = state.betting.currentBet;
    const potAmount = state.pot.mainPot;

    switch (preset) {
        case "min":
            return minAmount;
        case "half_pot":
            return clampAmount(currentBet + potAmount * 0.5, minAmount, maxAmount);
        case "three_quarter_pot":
            return clampAmount(currentBet + potAmount * 0.75, minAmount, maxAmount);
        case "pot":
            return clampAmount(currentBet + potAmount, minAmount, maxAmount);
        case "max":
            return maxAmount;
    }
}

function getRaisePresetLabel(preset: RaisePresetKey): string {
    switch (preset) {
        case "min":
            return "MIN";
        case "half_pot":
            return "1/2 POT";
        case "three_quarter_pot":
            return "3/4 POT";
        case "pot":
            return "POT";
        case "max":
            return "MAX";
    }
}

function createInitialGameState(): GameState {
    return startHand(createSampleGameState());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCard(value: unknown): value is Card {
    return (
        isPlainObject(value) &&
        typeof value.rank === "string" &&
        typeof value.suit === "string"
    );
}

function isPlayerState(value: unknown): value is PlayerState {
    return (
        isPlainObject(value) &&
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.seatIndex === "number" &&
        typeof value.isHero === "boolean" &&
        typeof value.isBot === "boolean" &&
        typeof value.stack === "number" &&
        Array.isArray(value.holeCards) &&
        value.holeCards.every(isCard) &&
        typeof value.currentStreetBet === "number" &&
        typeof value.totalCommittedThisHand === "number" &&
        typeof value.status === "string" &&
        typeof value.hasActedThisStreet === "boolean"
    );
}

function isHandRevealPlayerResult(value: unknown): value is HandRevealPlayerResult {
    return (
        isPlainObject(value) &&
        typeof value.playerId === "string" &&
        typeof value.seatIndex === "number" &&
        typeof value.name === "string" &&
        typeof value.isWinner === "boolean" &&
        typeof value.handLabel === "string" &&
        Array.isArray(value.cardsUsed) &&
        value.cardsUsed.every(isCard)
    );
}

function isGameState(value: unknown): value is GameState {
    const gameRecord = isPlainObject(value) ? value : null;
    const configRecord = gameRecord && isPlainObject(gameRecord.config) ? gameRecord.config : null;
    const blindsRecord = configRecord && isPlainObject(configRecord.blinds) ? configRecord.blinds : null;
    const deckRecord = gameRecord && isPlainObject(gameRecord.deck) ? gameRecord.deck : null;
    const bettingRecord = gameRecord && isPlainObject(gameRecord.betting) ? gameRecord.betting : null;
    const potRecord = gameRecord && isPlainObject(gameRecord.pot) ? gameRecord.pot : null;
    const lastHandResultRecord = gameRecord ? gameRecord.lastHandResult : null;
    const dealerSeatIndexOk =
        gameRecord !== null &&
        (typeof gameRecord.dealerSeatIndex === "number" || gameRecord.dealerSeatIndex === null);
    const buttonSeatIndexOk =
        gameRecord !== null &&
        (typeof gameRecord.buttonSeatIndex === "number" || gameRecord.buttonSeatIndex === null);

    return (
        gameRecord !== null &&
        configRecord !== null &&
        blindsRecord !== null &&
        deckRecord !== null &&
        bettingRecord !== null &&
        potRecord !== null &&
        typeof configRecord.startingStack === "number" &&
        typeof configRecord.maxPlayers === "number" &&
        typeof blindsRecord.smallBlind === "number" &&
        typeof blindsRecord.bigBlind === "number" &&
        typeof blindsRecord.ante === "number" &&
        typeof gameRecord.handNumber === "number" &&
        typeof gameRecord.street === "string" &&
        dealerSeatIndexOk &&
        buttonSeatIndexOk &&
        Array.isArray(gameRecord.players) &&
        gameRecord.players.every(isPlayerState) &&
        Array.isArray(gameRecord.board) &&
        gameRecord.board.every(isCard) &&
        Array.isArray(deckRecord.cards) &&
        deckRecord.cards.every(isCard) &&
        typeof bettingRecord.currentBet === "number" &&
        typeof bettingRecord.minRaiseTo === "number" &&
        (typeof bettingRecord.lastAggressorSeatIndex === "number" || bettingRecord.lastAggressorSeatIndex === null) &&
        (typeof bettingRecord.currentActorSeatIndex === "number" || bettingRecord.currentActorSeatIndex === null) &&
        typeof potRecord.mainPot === "number" &&
        Array.isArray(potRecord.sidePots) &&
        Array.isArray(gameRecord.actionHistory) &&
        gameRecord.actionHistory.every((record) => {
            return (
                isPlainObject(record) &&
                typeof record.id === "string" &&
                typeof record.type === "string" &&
                (typeof record.playerId === "string" || record.playerId === null) &&
                typeof record.street === "string" &&
                typeof record.handNumber === "number" &&
                typeof record.timestampMs === "number"
            );
        }) &&
        (lastHandResultRecord === null || isPlainObject(lastHandResultRecord)) &&
        (lastHandResultRecord === null ||
            (typeof lastHandResultRecord.kind === "string" &&
                typeof lastHandResultRecord.potAwarded === "number" &&
                Array.isArray(lastHandResultRecord.winnerIds) &&
                lastHandResultRecord.winnerIds.every((winnerId: unknown) => typeof winnerId === "string") &&
                Array.isArray(lastHandResultRecord.playerResults) &&
                lastHandResultRecord.playerResults.every(isHandRevealPlayerResult)))
    );
}

function loadPersistedGameState(): GameState | null {
    if (typeof window === "undefined") {
        return null;
    }

    const serializedState = window.localStorage.getItem(GAME_STATE_STORAGE_KEY);

    if (!serializedState) {
        return null;
    }

    try {
        const parsedState: unknown = JSON.parse(serializedState);

        if (!isPlainObject(parsedState) || parsedState.version !== GAME_STATE_STORAGE_VERSION) {
            return null;
        }

        if (!isGameState(parsedState.gameState)) {
            return null;
        }

        return parsedState.gameState;
    } catch {
        return null;
    }
}

function savePersistedGameState(gameState: GameState): void {
    if (typeof window === "undefined") {
        return;
    }

    const payload: PersistedGameState = {
        version: GAME_STATE_STORAGE_VERSION,
        gameState,
    };

    window.localStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(payload));
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
    onOpenRaise,
}: {
    action: LegalAction;
    playerId: string;
    onAction: (action: PlayerAction) => void;
    onOpenRaise: (action: RaiseLegalAction) => void;
}) {
    return (
        <button
            className="action-button"
            type="button"
            onClick={() => {
                if (isRaiseLegalAction(action)) {
                    onOpenRaise(action);
                    return;
                }

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
    const [gameState, setGameState] = useState<GameState>(() => loadPersistedGameState() ?? createInitialGameState());
    const [tableActionLabels, setTableActionLabels] = useState<Map<string, string>>(() => new Map());
    const [blindActionLabels, setBlindActionLabels] = useState<Map<string, string>>(() => new Map());
    const [raiseDraft, setRaiseDraft] = useState<{ action: RaiseLegalAction; amount: number } | null>(null);
    const [debugRevealAllCards, setDebugRevealAllCards] = useState(false);
    const [botAutoplayEnabled, setBotAutoplayEnabled] = useState(true);
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
    const raiseAction = useMemo(
        () => legalActions.find(isRaiseLegalAction) ?? null,
        [legalActions]
    );

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
        if (!raiseAction) {
            setRaiseDraft(null);
        }
    }, [raiseAction]);

    useEffect(() => {
        savePersistedGameState(gameState);
    }, [gameState]);

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

        if (
            !botAutoplayEnabled ||
            tableLocked ||
            streetReveal.active ||
            currentActor === null ||
            !currentActor.isBot
        ) {
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
    }, [botAutoplayEnabled, currentActor, streetReveal.active, tableLocked, gameState.handNumber, gameState.street]);

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

    function handleOpenRaise(action: RaiseLegalAction) {
        if (tableLocked) {
            return;
        }

        setRaiseDraft({
            action,
            amount: action.minAmount ?? 0,
        });
    }

    function handleRaisePresetClick(preset: RaisePresetKey) {
        if (!raiseDraft) {
            return;
        }

        setRaiseDraft({
            action: raiseDraft.action,
            amount: getRaisePresetAmount(preset, gameState, raiseDraft.action),
        });
    }

    function handleRaiseAmountChange(event: ChangeEvent<HTMLInputElement>) {
        if (!raiseDraft) {
            return;
        }

        setRaiseDraft({
            action: raiseDraft.action,
            amount: clampAmount(
                Number(event.target.value),
                raiseDraft.action.minAmount ?? 0,
                raiseDraft.action.maxAmount ?? raiseDraft.action.minAmount ?? 0
            ),
        });
    }

    function handleConfirmRaise() {
        if (!currentActor || !raiseDraft) {
            return;
        }

        handleAction({
            type: "raise",
            playerId: currentActor.id,
            amount: raiseDraft.amount,
        });
        setRaiseDraft(null);
    }

    function handleCancelRaise() {
        setRaiseDraft(null);
    }

    function handlePlayerPersonaChange(playerId: string, botPersonaId: BotPersonaId) {
        setGameState((previous) => ({
            ...previous,
            players: previous.players.map((player) => {
                if (player.id !== playerId) {
                    return player;
                }

                return {
                    ...player,
                    botPersonaId,
                };
            }),
        }));
    }

    function handleStepBotOnce() {
        if (botAutoplayEnabled) {
            return;
        }

        setGameState((previous) => advanceBotTurns(previous, { maxSteps: 1 }));
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
    const shouldRevealAllCards = debugRevealAllCards || showVillainHoleCards;

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
                        showVillainHoleCards={shouldRevealAllCards}
                        visibleActionByPlayerId={sceneActionLabels}
                        handResultByPlayerId={handResultByPlayerId}
                        highlightedCardKeys={highlightedCardKeys}
                        streetReveal={streetReveal}
                        currentActorSeatIndex={tableLocked ? null : gameState.betting.currentActorSeatIndex}
                    />
                </div>

                <section className="table-actions" aria-label="Legal actions">
                    {raiseDraft && currentActor ? (
                        <div className="raise-tray" aria-label="Raise controls">
                            <div className="raise-tray__presets" role="group" aria-label="Raise sizing presets">
                                {(["min", "half_pot", "three_quarter_pot", "pot", "max"] as RaisePresetKey[]).map((preset) => {
                                    const amount = getRaisePresetAmount(preset, gameState, raiseDraft.action);
                                    const isActive = amount === raiseDraft.amount;

                                    return (
                                        <button
                                            key={preset}
                                            type="button"
                                            className={[
                                                "raise-tray__preset",
                                                isActive ? "is-active" : "",
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                            onClick={() => handleRaisePresetClick(preset)}
                                        >
                                            <span>{getRaisePresetLabel(preset)}</span>
                                            <strong>${amount}</strong>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="raise-tray__body">
                                <div className="raise-tray__amount">
                                    <span>Raise to</span>
                                    <strong>${raiseDraft.amount}</strong>
                                </div>

                                <input
                                    aria-label="Raise amount"
                                    className="raise-tray__slider"
                                    type="range"
                                    min={raiseDraft.action.minAmount ?? 0}
                                    max={raiseDraft.action.maxAmount ?? raiseDraft.action.minAmount ?? 0}
                                    step={1}
                                    value={raiseDraft.amount}
                                    onChange={handleRaiseAmountChange}
                                />

                                <div className="raise-tray__actions">
                                    <button className="raise-tray__secondary-button" type="button" onClick={handleCancelRaise}>
                                        Cancel
                                    </button>
                                    <button className="raise-tray__primary-button" type="button" onClick={handleConfirmRaise}>
                                        Confirm raise
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                    <div className="table-actions__row">
                        {legalActions.length > 0 ? (
                            legalActions.map((action) => (
                                <ActionButton
                                    key={action.type}
                                    action={action}
                                    playerId={currentActor?.id ?? ""}
                                    onAction={handleAction}
                                    onOpenRaise={handleOpenRaise}
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

                {import.meta.env.DEV ? (
                    <DebugPanel
                        players={gameState.players}
                        currentActorSeatIndex={gameState.betting.currentActorSeatIndex}
                        revealAllCards={debugRevealAllCards}
                        botAutoplayEnabled={botAutoplayEnabled}
                        onToggleRevealAllCards={() => setDebugRevealAllCards((previous) => !previous)}
                        onToggleBotAutoplay={() => setBotAutoplayEnabled((previous) => !previous)}
                        onStepBot={handleStepBotOnce}
                        onPlayerPersonaChange={handlePlayerPersonaChange}
                    />
                ) : null}
            </section>
        </main>
    );
}
