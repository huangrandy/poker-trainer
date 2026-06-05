import type { ChangeEvent } from "react";
import { BOT_PERSONA_PROFILES, getBotPersonaProfile, type BotPersonaId } from "../features/bots/personas";
import type { Card, PlayerState } from "../features/game-engine/types";

type DebugPanelProps = {
    players: PlayerState[];
    currentActorSeatIndex: number | null;
    revealAllCards: boolean;
    botAutoplayEnabled: boolean;
    onToggleRevealAllCards: () => void;
    onToggleBotAutoplay: () => void;
    onStepBot: () => void;
    onRebuyPlayer: (playerId: string) => void;
    onResetGame: () => void;
    onPlayerPersonaChange: (playerId: string, botPersonaId: BotPersonaId) => void;
    onPlayerHoleCardsChange: (playerId: string, holeCards: Card[]) => void;
};

const botPersonaOptions = Object.values(BOT_PERSONA_PROFILES);
const cardRankOptions: Card["rank"][] = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const cardSuitOptions: Card["suit"][] = ["spades", "hearts", "diamonds", "clubs"];
const fallbackHoleCards: [Card, Card] = [
    { rank: "A", suit: "spades" },
    { rank: "K", suit: "spades" },
];

function formatPersonaHint(botPersonaId: BotPersonaId | undefined): string {
    const selectedProfile = getBotPersonaProfile(botPersonaId);

    if (botPersonaId === undefined || botPersonaId === selectedProfile.id) {
        return `Effective: ${selectedProfile.label}`;
    }

    const selectedLabel = BOT_PERSONA_PROFILES[botPersonaId]?.label ?? botPersonaId;

    return `Selected: ${selectedLabel}. Effective: ${selectedProfile.label}`;
}

function formatCard(card: Card): string {
    const suitSymbols: Record<Card["suit"], string> = {
        clubs: "♣",
        diamonds: "♦",
        hearts: "♥",
        spades: "♠",
    };

    return `${card.rank}${suitSymbols[card.suit]}`;
}

function getEditableHoleCards(holeCards: Card[]): [Card, Card] {
    return [
        holeCards[0] ?? fallbackHoleCards[0],
        holeCards[1] ?? fallbackHoleCards[1],
    ];
}

export function DebugPanel({
    players,
    currentActorSeatIndex,
    revealAllCards,
    botAutoplayEnabled,
    onToggleRevealAllCards,
    onToggleBotAutoplay,
    onStepBot,
    onRebuyPlayer,
    onResetGame,
    onPlayerPersonaChange,
    onPlayerHoleCardsChange,
}: DebugPanelProps) {
    const botPlayers = players.filter((player) => player.isBot);
    const currentActor = players.find((player) => player.seatIndex === currentActorSeatIndex) ?? null;
    const canStepBot = Boolean(currentActor?.isBot) && !botAutoplayEnabled;

    function handlePersonaChange(playerId: string, event: ChangeEvent<HTMLSelectElement>) {
        onPlayerPersonaChange(playerId, event.target.value as BotPersonaId);
    }

    function handleHoleCardChange(
        playerId: string,
        playerHoleCards: Card[],
        cardIndex: number,
        key: "rank" | "suit",
        value: Card["rank"] | Card["suit"]
    ) {
        const nextHoleCards = playerHoleCards.map((card, index) => {
            if (index !== cardIndex) {
                return card;
            }

            return {
                ...card,
                [key]: value,
            } as Card;
        });

        onPlayerHoleCardsChange(playerId, nextHoleCards);
    }

    return (
        <article className="panel debug-panel" aria-label="Debug controls">
            <div className="panel__header">
                <h2>Debug</h2>
                <span>Local only</span>
            </div>

            <div className="debug-panel__toggles">
                <label className="debug-toggle">
                    <span className="debug-toggle__copy">
                        <strong>Reveal cards</strong>
                        <small>{revealAllCards ? "On" : "Off"}</small>
                    </span>
                    <span className="debug-toggle__switch">
                        <input
                            aria-label="Reveal cards"
                            className="debug-toggle__input"
                            type="checkbox"
                            checked={revealAllCards}
                            onChange={() => onToggleRevealAllCards()}
                        />
                        <span className="debug-toggle__track" aria-hidden="true">
                            <span className="debug-toggle__thumb" />
                        </span>
                    </span>
                </label>
                <label className="debug-toggle">
                    <span className="debug-toggle__copy">
                        <strong>Bot autoplay</strong>
                        <small>{botAutoplayEnabled ? "On" : "Paused"}</small>
                    </span>
                    <span className="debug-toggle__switch">
                        <input
                            aria-label="Bot autoplay"
                            className="debug-toggle__input"
                            type="checkbox"
                            checked={botAutoplayEnabled}
                            onChange={() => onToggleBotAutoplay()}
                        />
                        <span className="debug-toggle__track" aria-hidden="true">
                            <span className="debug-toggle__thumb" />
                        </span>
                    </span>
                </label>
                <button className="primary-button" type="button" onClick={onStepBot} disabled={!canStepBot}>
                    Step bot once
                </button>
                <button className="debug-panel__reset-button" type="button" onClick={onResetGame}>
                    Reset game
                </button>
            </div>

            <div className="debug-panel__players">
                {botPlayers.map((player) => {
                    const selectedPersona = player.botPersonaId ?? "tag";
                    const editableHoleCards = getEditableHoleCards(player.holeCards);
                    const canRebuyPlayer = player.status === "out" || player.stack === 0;

                    return (
                        <div key={player.id} className="debug-panel__player">
                            <span className="debug-panel__player-name">
                                {player.name}
                                <small>Seat {player.seatIndex}</small>
                            </span>
                            <select
                                aria-label={`${player.name} persona`}
                                className="debug-panel__select"
                                value={selectedPersona}
                                onChange={(event) => handlePersonaChange(player.id, event)}
                            >
                                {botPersonaOptions.map((profile) => (
                                    <option key={profile.id} value={profile.id}>
                                        {profile.label}
                                    </option>
                                ))}
                            </select>
                            <span className="debug-panel__hint">{formatPersonaHint(player.botPersonaId)}</span>
                            {canRebuyPlayer ? (
                                <div className="debug-panel__player-actions">
                                    <button
                                        className="debug-panel__rebuy-button"
                                        type="button"
                                        onClick={() => onRebuyPlayer(player.id)}
                                    >
                                        Rebuy bot
                                    </button>
                                </div>
                            ) : null}
                            <div className="debug-panel__cards" aria-label={`${player.name} hole cards`}>
                                {editableHoleCards.map((card, cardIndex) => (
                                    <div key={`${player.id}-card-${cardIndex}`} className="debug-card-picker">
                                        <span className="debug-card-picker__title">
                                            Card {cardIndex + 1}
                                            <small>{formatCard(card)}</small>
                                        </span>
                                        <div className="debug-card-picker__controls">
                                            <label className="debug-card-picker__control">
                                                <span>Rank</span>
                                                <select
                                                    aria-label={`${player.name} card ${cardIndex + 1} rank`}
                                                    className="debug-panel__select"
                                                    value={card.rank}
                                                    onChange={(event) =>
                                                        handleHoleCardChange(
                                                            player.id,
                                                            editableHoleCards,
                                                            cardIndex,
                                                            "rank",
                                                            event.target.value as Card["rank"]
                                                        )
                                                    }
                                                >
                                                    {cardRankOptions.map((rank) => (
                                                        <option key={rank} value={rank}>
                                                            {rank}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label className="debug-card-picker__control">
                                                <span>Suit</span>
                                                <select
                                                    aria-label={`${player.name} card ${cardIndex + 1} suit`}
                                                    className="debug-panel__select"
                                                    value={card.suit}
                                                    onChange={(event) =>
                                                        handleHoleCardChange(
                                                            player.id,
                                                            editableHoleCards,
                                                            cardIndex,
                                                            "suit",
                                                            event.target.value as Card["suit"]
                                                        )
                                                    }
                                                >
                                                    {cardSuitOptions.map((suit) => (
                                                        <option key={suit} value={suit}>
                                                            {suit}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            <p className="debug-panel__note">
                Disabled personas still resolve to the active TAG behavior until their strategy is enabled.
            </p>
        </article>
    );
}
