import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CoachPanel } from "./components/CoachPanel";
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
type SeatRoleBadge = {
    label: "D" | "SB" | "BB";
    tone: "dealer" | "smallBlind" | "bigBlind";
};
type RaisePresetKey = "min" | "half_pot" | "three_quarter_pot" | "pot" | "max";
type AggressiveTrayAction = LegalAction & {
    type: "bet" | "raise";
    minAmount: number;
    maxAmount: number;
};
type AllInAction = LegalAction & {
    type: "all_in";
    minAmount: number;
    maxAmount: number;
};
type AggressiveSlotAction = AggressiveTrayAction | AllInAction;
type AggressiveDraft = {
    action: AggressiveTrayAction;
    amount: number;
};
type ActionButtonProps = {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    className?: string;
};
type AggressiveSlotProps = {
    gameState: GameState;
    action: AggressiveSlotAction | null;
    draft: AggressiveDraft | null;
    onDraftChange: (nextDraft: AggressiveDraft) => void;
    onConfirm: (draft: AggressiveDraft) => void;
    onAllIn: (() => void) | null;
};

const BLIND_REVEAL_DELAY_MS = 500;
const BOT_ACTION_DELAY_MS = 500;
const STREET_REVEAL_DELAY_MS = 500;
const GAME_STATE_STORAGE_KEY = "poker-trainer:game-state";
const GAME_STATE_STORAGE_VERSION = 1;
const DEBUG_SETTINGS_STORAGE_KEY = "poker-trainer:debug-settings";
const DEBUG_SETTINGS_STORAGE_VERSION = 1;

type PersistedGameState = {
    version: number;
    gameState: GameState;
};

type PersistedDebugSettings = {
    version: number;
    revealAllCards: boolean;
    botAutoplayEnabled: boolean;
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
            label: `$${player.currentStreetBet}`,
        }));
}

function buildSeatRoleBadges(state: GameState): Map<string, SeatRoleBadge[]> {
    const badges = new Map<string, SeatRoleBadge[]>();
    const visiblePlayers = state.players.filter((player) => player.status !== "out");
    const buttonSeatIndex = state.buttonSeatIndex ?? state.dealerSeatIndex;

    if (buttonSeatIndex === null || visiblePlayers.length < 2) {
        return badges;
    }

    const orderedSeatIndexes = visiblePlayers
        .map((player) => player.seatIndex)
        .sort((left, right) => left - right);

    const getNextSeatIndex = (seatIndex: number): number | null => {
        const nextSeatIndex = orderedSeatIndexes.find((candidate) => candidate > seatIndex);

        return nextSeatIndex ?? orderedSeatIndexes[0] ?? null;
    };

    const addBadge = (playerId: string, badge: SeatRoleBadge) => {
        const existing = badges.get(playerId) ?? [];

        if (existing.some((entry) => entry.label === badge.label)) {
            return;
        }

        badges.set(playerId, [...existing, badge]);
    };

    const buttonPlayer = visiblePlayers.find((player) => player.seatIndex === buttonSeatIndex);

    if (!buttonPlayer) {
        return badges;
    }

    addBadge(buttonPlayer.id, { label: "D", tone: "dealer" });

    if (visiblePlayers.length === 2) {
        addBadge(buttonPlayer.id, { label: "SB", tone: "smallBlind" });

        const bigBlindSeatIndex = getNextSeatIndex(buttonSeatIndex);
        const bigBlindPlayer = bigBlindSeatIndex === null
            ? null
            : visiblePlayers.find((player) => player.seatIndex === bigBlindSeatIndex) ?? null;

        if (bigBlindPlayer) {
            addBadge(bigBlindPlayer.id, { label: "BB", tone: "bigBlind" });
        }

        return badges;
    }

    const smallBlindSeatIndex = getNextSeatIndex(buttonSeatIndex);
    const smallBlindPlayer = smallBlindSeatIndex === null
        ? null
        : visiblePlayers.find((player) => player.seatIndex === smallBlindSeatIndex) ?? null;

    if (smallBlindPlayer) {
        addBadge(smallBlindPlayer.id, { label: "SB", tone: "smallBlind" });
    }

    const bigBlindSeatIndex = smallBlindSeatIndex === null ? null : getNextSeatIndex(smallBlindSeatIndex);
    const bigBlindPlayer = bigBlindSeatIndex === null
        ? null
        : visiblePlayers.find((player) => player.seatIndex === bigBlindSeatIndex) ?? null;

    if (bigBlindPlayer) {
        addBadge(bigBlindPlayer.id, { label: "BB", tone: "bigBlind" });
    }

    return badges;
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
        return `CALL $${action.callAmount}`;
    }

    if ((action.type === "bet" || action.type === "raise") && action.minAmount !== undefined) {
        return `${action.type === "bet" ? "BET" : "RAISE"} $${action.minAmount}`;
    }

    if (action.type === "all_in" && action.maxAmount !== undefined) {
        return `ALL IN $${action.maxAmount}`;
    }

    return action.type.toUpperCase();
}

function clampAmount(amount: number, minAmount: number, maxAmount: number): number {
    return Math.max(minAmount, Math.min(maxAmount, Math.round(amount)));
}

function getRaisePresetAmount(
    preset: RaisePresetKey,
    state: GameState,
    action: AggressiveTrayAction
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
            return "1/2";
        case "three_quarter_pot":
            return "3/4";
        case "pot":
            return "POT";
        case "max":
            return "MAX";
    }
}

function isBetOrRaiseAction(action: LegalAction): action is AggressiveTrayAction {
    return action.type === "bet" || action.type === "raise";
}

function getPrimaryAggressiveAction(legalActions: LegalAction[]): AggressiveSlotAction | null {
    return (
        legalActions.find((action): action is AggressiveTrayAction => action.type === "raise") ??
        legalActions.find((action): action is AggressiveTrayAction => action.type === "bet") ??
        legalActions.find((action): action is AllInAction => action.type === "all_in") ??
        null
    );
}

function getAggressiveSlotFallbackLabel(state: GameState): string {
    return state.betting.currentBet === 0 ? "BET" : "RAISE";
}

function getRunoutRevealTargets(previousStreet: GameState["street"]): number[] {
    if (previousStreet === "preflop") {
        return [3, 4, 5];
    }

    if (previousStreet === "flop") {
        return [4, 5];
    }

    if (previousStreet === "turn") {
        return [5];
    }

    return [];
}

function clearRevealTimers(
    botTimerRef: { current: number | null },
    blindRevealTimerRef: { current: number | null },
    revealTimerRef: { current: number | null }
): void {
    if (botTimerRef.current !== null) {
        window.clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
    }

    if (blindRevealTimerRef.current !== null) {
        window.clearTimeout(blindRevealTimerRef.current);
        blindRevealTimerRef.current = null;
    }

    if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
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

function isPersistedDebugSettings(value: unknown): value is PersistedDebugSettings {
    return (
        isPlainObject(value) &&
        value.version === DEBUG_SETTINGS_STORAGE_VERSION &&
        typeof value.revealAllCards === "boolean" &&
        typeof value.botAutoplayEnabled === "boolean"
    );
}

function loadPersistedDebugSettings(): PersistedDebugSettings | null {
    if (typeof window === "undefined") {
        return null;
    }

    const serializedState = window.localStorage.getItem(DEBUG_SETTINGS_STORAGE_KEY);

    if (!serializedState) {
        return null;
    }

    try {
        const parsedState: unknown = JSON.parse(serializedState);

        return isPersistedDebugSettings(parsedState) ? parsedState : null;
    } catch {
        return null;
    }
}

function savePersistedDebugSettings(settings: PersistedDebugSettings): void {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.setItem(DEBUG_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
        <article className={seatClasses} data-player-id={player.id}>
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

function ActionButton({ label, disabled = false, onClick, className }: ActionButtonProps) {
    return (
        <button
            className={["action-button action-button--slot", disabled ? "action-button--disabled" : "", className ?? ""]
                .filter(Boolean)
                .join(" ")}
            type="button"
            disabled={disabled}
            onClick={onClick}
        >
            {label}
        </button>
    );
}

function AggressiveActionSlot({
    gameState,
    action,
    draft,
    onDraftChange,
    onConfirm,
    onAllIn,
}: AggressiveSlotProps) {
    if (action && isBetOrRaiseAction(action)) {
        const activeDraft =
            draft && draft.action.type === action.type
                ? draft
                : {
                      action,
                      amount: action.minAmount ?? action.maxAmount ?? 0,
                  };
        const amount = activeDraft.amount;
        const amountInputWidth = `${Math.max(6, String(amount).length + 2)}ch`;

        return (
            <div className="raise-tray" aria-label={`${action.type === "bet" ? "Bet" : "Raise"} controls`}>
                <div
                    className="raise-tray__strip"
                    role="group"
                    aria-label={`${action.type === "bet" ? "Bet" : "Raise"} sizing presets and controls`}
                >
                    {(["min", "half_pot", "three_quarter_pot", "pot", "max"] as RaisePresetKey[]).map((preset) => {
                        const amountForPreset = getRaisePresetAmount(preset, gameState, action);
                        const isActive = amountForPreset === amount;

                        return (
                            <button
                                key={preset}
                                type="button"
                                className={["raise-tray__preset", isActive ? "is-active" : ""].filter(Boolean).join(" ")}
                                onClick={() => onDraftChange({ action, amount: amountForPreset })}
                            >
                                <span>{getRaisePresetLabel(preset)}</span>
                            </button>
                        );
                    })}
                    <input
                        aria-label={`${action.type === "bet" ? "Bet" : "Raise"} amount`}
                        className="raise-tray__amount-input"
                        style={{ width: amountInputWidth }}
                        inputMode="numeric"
                        type="number"
                        min={action.minAmount ?? 0}
                        max={action.maxAmount ?? action.minAmount ?? 0}
                        step={1}
                        value={`${amount}`}
                        onChange={(event) =>
                            onDraftChange({
                                action,
                                amount: clampAmount(
                                    Number(event.target.value),
                                    action.minAmount ?? 0,
                                    action.maxAmount ?? action.minAmount ?? 0
                                ),
                            })
                        }
                    />

                    <div className="raise-tray__actions">
                        <button className="raise-tray__primary-button" type="button" onClick={() => onConfirm(activeDraft)}>
                            {action.type === "bet" ? "BET" : "RAISE"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (action?.type === "all_in") {
        return (
            <ActionButton
                label={getLegalActionLabel(action)}
                disabled={!onAllIn}
                onClick={onAllIn ?? (() => {})}
                className="action-button--slot action-button--slot-wide"
            />
        );
    }

    return (
        <ActionButton
            label={getAggressiveSlotFallbackLabel(gameState)}
            disabled
            onClick={() => {}}
            className="action-button--slot action-button--slot-wide"
        />
    );
}

export default function App() {
    const persistedGameState = useMemo(() => loadPersistedGameState(), []);
    const persistedDebugSettings = useMemo(() => loadPersistedDebugSettings(), []);
    const [gameState, setGameState] = useState<GameState>(() => persistedGameState ?? createInitialGameState());
    const [tableActionLabels, setTableActionLabels] = useState<Map<string, string>>(() =>
        persistedGameState
            ? buildVisibleActionLabelsForStreet(persistedGameState, persistedGameState.street)
            : new Map()
    );
    const [blindActionLabels, setBlindActionLabels] = useState<Map<string, string>>(() =>
        persistedGameState && persistedGameState.street === "preflop"
            ? new Map(buildBlindRevealActions(persistedGameState).map((entry) => [entry.playerId, entry.label]))
            : new Map()
    );
    const [aggressiveDraft, setAggressiveDraft] = useState<AggressiveDraft | null>(null);
    const [debugRevealAllCards, setDebugRevealAllCards] = useState(
        () => persistedDebugSettings?.revealAllCards ?? false
    );
    const [botAutoplayEnabled, setBotAutoplayEnabled] = useState(
        () => persistedDebugSettings?.botAutoplayEnabled ?? true
    );
    const [tableLocked, setTableLocked] = useState(() => !persistedGameState);
    const [streetReveal, setStreetReveal] = useState({
        active: false,
        fromIndex: 0,
    });
    const botTimerRef = useRef<number | null>(null);
    const blindRevealTimerRef = useRef<number | null>(null);
    const revealTimerRef = useRef<number | null>(null);
    const blindRevealActiveRef = useRef(false);
    const streetRevealActiveRef = useRef(false);
    const skipInitialRevealRef = useRef(Boolean(persistedGameState));
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
    const foldAction = useMemo(() => legalActions.find((action) => action.type === "fold") ?? null, [legalActions]);
    const responseAction = useMemo(
        () => legalActions.find((action) => action.type === "check" || action.type === "call") ?? null,
        [legalActions]
    );
    const aggressiveAction = useMemo(() => getPrimaryAggressiveAction(legalActions), [legalActions]);

    const handResult = gameState.lastHandResult;
    const isHandComplete = gameState.street === "hand_complete" && handResult !== null;
    const showVillainHoleCards = gameState.street === "showdown" || handResult?.kind === "showdown";
    const showHandRevealResult = handResult?.kind === "showdown" && !streetReveal.active;
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
    const seatRoleBadgesByPlayerId = useMemo(
        () => buildSeatRoleBadges(gameState),
        [gameState.buttonSeatIndex, gameState.dealerSeatIndex, gameState.players]
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
        if (!aggressiveAction || !isBetOrRaiseAction(aggressiveAction)) {
            setAggressiveDraft(null);
            return;
        }

        setAggressiveDraft({
            action: aggressiveAction,
            amount: aggressiveAction.minAmount ?? aggressiveAction.maxAmount ?? 0,
        });
    }, [currentActor?.id, aggressiveAction, gameState.handNumber, gameState.street]);

    useEffect(() => {
        if (gameState.street !== "preflop") {
            if (blindActionLabels.size > 0) {
                setBlindActionLabels(new Map());
            }

            return;
        }

        if (blindRevealActiveRef.current) {
            return;
        }

        setBlindActionLabels(new Map(buildBlindRevealActions(gameState).map((entry) => [entry.playerId, entry.label])));
    }, [blindActionLabels.size, gameState]);

    useEffect(() => {
        if (persistedGameState !== null && (tableLocked || streetReveal.active)) {
            return;
        }

        savePersistedGameState(gameState);
    }, [gameState, persistedGameState, streetReveal.active, tableLocked]);

    useEffect(() => {
        savePersistedDebugSettings({
            version: DEBUG_SETTINGS_STORAGE_VERSION,
            revealAllCards: debugRevealAllCards,
            botAutoplayEnabled,
        });
    }, [botAutoplayEnabled, debugRevealAllCards]);

    useEffect(() => {
        if (tableLocked) {
            return;
        }

        setTableActionLabels(visibleActionByPlayerId);
    }, [tableLocked, visibleActionByPlayerId]);

    useEffect(() => {
        return () => {
            clearRevealTimers(botTimerRef, blindRevealTimerRef, revealTimerRef);
        };
    }, []);

    useLayoutEffect(() => {
        if (skipInitialRevealRef.current) {
            skipInitialRevealRef.current = false;
            lastHandledStartHandIdRef.current = latestStartHandRecord?.id ?? null;
            return;
        }

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

        const isAllInRunoutReveal =
            gameState.street === "hand_complete" &&
            handResult?.kind === "showdown" &&
            previousStreet !== gameState.street &&
            previousBoardLength < gameState.board.length;

        const runoutRevealTargets = getRunoutRevealTargets(previousStreet);

        if (isAllInRunoutReveal && runoutRevealTargets.length > 0) {
            setBlindActionLabels(new Map());
            streetRevealActiveRef.current = true;
            const previousStreetActions = buildVisibleActionLabelsForStreet(gameState, previousStreet);

            setTableActionLabels(previousStreetActions);
            setTableLocked(true);
            setStreetReveal({
                active: true,
                fromIndex: runoutRevealTargets[0],
            });

            let nextRevealIndex = 1;

            const revealNextStreetCard = () => {
                if (nextRevealIndex < runoutRevealTargets.length) {
                    setStreetReveal({
                        active: true,
                        fromIndex: runoutRevealTargets[nextRevealIndex],
                    });
                    nextRevealIndex += 1;

                    if (nextRevealIndex < runoutRevealTargets.length) {
                        revealTimerRef.current = window.setTimeout(
                            revealNextStreetCard,
                            STREET_REVEAL_DELAY_MS
                        );
                        return;
                    }
                }

                streetRevealActiveRef.current = false;
                setTableActionLabels(visibleActionByPlayerId);
                setTableLocked(false);
                setStreetReveal({
                    active: false,
                    fromIndex: gameState.board.length,
                });
                revealTimerRef.current = null;
            };

            revealTimerRef.current = window.setTimeout(revealNextStreetCard, STREET_REVEAL_DELAY_MS);
            lastStreetRef.current = gameState.street;
            lastBoardLengthRef.current = gameState.board.length;
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
    const pendingStreetReveal =
        !streetReveal.active &&
        lastStreetRef.current !== gameState.street &&
        gameState.street !== "showdown" &&
        gameState.street !== "hand_complete";
    const communityRevealFromIndex = streetReveal.active
        ? streetReveal.fromIndex
        : pendingStreetReveal
            ? lastBoardLengthRef.current
            : gameState.board.length;

    function handleAction(action: PlayerAction) {
        if (tableLocked) {
            return;
        }

        setGameState((previous) => {
            const nextState = applyAction(previous, action);
            return nextState;
        });
    }

    function handleConfirmAggressiveAction(draft: AggressiveDraft) {
        if (!currentActor) {
            return;
        }

        const isAllIn = draft.amount === draft.action.maxAmount;

        handleAction({
            type: isAllIn ? "all_in" : draft.action.type,
            playerId: currentActor.id,
            amount: isAllIn ? undefined : draft.amount,
        });
        setAggressiveDraft(null);
    }

    function handleAllInAction() {
        if (!currentActor) {
            return;
        }

        handleAction({
            type: "all_in",
            playerId: currentActor.id,
        });
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

    function handlePlayerHoleCardsChange(playerId: string, holeCards: Card[]) {
        setGameState((previous) => ({
            ...previous,
            players: previous.players.map((player) => {
                if (player.id !== playerId) {
                    return player;
                }

                return {
                    ...player,
                    holeCards: holeCards.map((card) => ({ ...card })),
                };
            }),
        }));
    }

    function handleRebuyPlayer(playerId: string) {
        setGameState((previous) => rebuyPlayer(previous, playerId));
    }

    function handleResetGame() {
        clearRevealTimers(botTimerRef, blindRevealTimerRef, revealTimerRef);
        blindRevealActiveRef.current = false;
        streetRevealActiveRef.current = false;
        lastHandledStartHandIdRef.current = null;
        lastStreetRef.current = "not_started";
        lastBoardLengthRef.current = 0;
        setAggressiveDraft(null);
        setTableActionLabels(new Map());
        setBlindActionLabels(new Map());
        setTableLocked(true);
        setStreetReveal({
            active: false,
            fromIndex: 0,
        });
        setGameState(createInitialGameState());
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
            <section className="top-layout">
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
                            showHandRevealResult={showHandRevealResult}
                            visibleActionByPlayerId={sceneActionLabels}
                            seatRoleBadgesByPlayerId={seatRoleBadgesByPlayerId}
                            handResultByPlayerId={handResultByPlayerId}
                            highlightedCardKeys={highlightedCardKeys}
                            streetReveal={streetReveal}
                            communityRevealFromIndex={communityRevealFromIndex}
                            currentActorSeatIndex={gameState.betting.currentActorSeatIndex}
                        />
                    </div>

                    <section className="table-actions" aria-label="Legal actions">
                        <div className="table-actions__bar">
                            {currentActor ? (
                                <div className="table-actions__row table-actions__slots">
                                    <ActionButton
                                        label="FOLD"
                                        disabled={!foldAction}
                                        onClick={() => {
                                            if (!currentActor || !foldAction) {
                                                return;
                                            }

                                            handleAction({
                                                type: foldAction.type,
                                                playerId: currentActor.id,
                                            });
                                        }}
                                    />
                                    <ActionButton
                                        label={
                                            responseAction
                                                ? getLegalActionLabel(responseAction)
                                                : gameState.betting.currentBet > 0
                                                    ? "CALL"
                                                    : "CHECK"
                                        }
                                        disabled={!responseAction}
                                        onClick={() => {
                                            if (!currentActor || !responseAction) {
                                                return;
                                            }

                                            handleAction({
                                                type: responseAction.type,
                                                playerId: currentActor.id,
                                                amount: responseAction.callAmount,
                                            });
                                        }}
                                    />
                                    <AggressiveActionSlot
                                        gameState={gameState}
                                        action={aggressiveAction}
                                        draft={aggressiveDraft}
                                        onDraftChange={(nextDraft) => setAggressiveDraft(nextDraft)}
                                        onConfirm={handleConfirmAggressiveAction}
                                        onAllIn={currentActor ? handleAllInAction : null}
                                    />
                                </div>
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

                <CoachPanel gameState={gameState} />
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
                        onRebuyPlayer={handleRebuyPlayer}
                        onResetGame={handleResetGame}
                        onPlayerPersonaChange={handlePlayerPersonaChange}
                        onPlayerHoleCardsChange={handlePlayerHoleCardsChange}
                    />
                ) : null}
            </section>
        </main>
    );
}
