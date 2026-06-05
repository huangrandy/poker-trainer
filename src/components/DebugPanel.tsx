import type { ChangeEvent } from "react";
import { BOT_PERSONA_PROFILES, getBotPersonaProfile, type BotPersonaId } from "../features/bots/personas";
import type { PlayerState } from "../features/game-engine/types";

type DebugPanelProps = {
    players: PlayerState[];
    currentActorSeatIndex: number | null;
    revealAllCards: boolean;
    botAutoplayEnabled: boolean;
    onToggleRevealAllCards: () => void;
    onToggleBotAutoplay: () => void;
    onStepBot: () => void;
    onPlayerPersonaChange: (playerId: string, botPersonaId: BotPersonaId) => void;
};

const botPersonaOptions = Object.values(BOT_PERSONA_PROFILES);

function formatPersonaHint(botPersonaId: BotPersonaId | undefined): string {
    const selectedProfile = getBotPersonaProfile(botPersonaId);

    if (botPersonaId === undefined || botPersonaId === selectedProfile.id) {
        return `Effective: ${selectedProfile.label}`;
    }

    const selectedLabel = BOT_PERSONA_PROFILES[botPersonaId]?.label ?? botPersonaId;

    return `Selected: ${selectedLabel}. Effective: ${selectedProfile.label}`;
}

export function DebugPanel({
    players,
    currentActorSeatIndex,
    revealAllCards,
    botAutoplayEnabled,
    onToggleRevealAllCards,
    onToggleBotAutoplay,
    onStepBot,
    onPlayerPersonaChange,
}: DebugPanelProps) {
    const botPlayers = players.filter((player) => player.isBot);
    const currentActor = players.find((player) => player.seatIndex === currentActorSeatIndex) ?? null;
    const canStepBot = Boolean(currentActor?.isBot) && !botAutoplayEnabled;

    function handlePersonaChange(playerId: string, event: ChangeEvent<HTMLSelectElement>) {
        onPlayerPersonaChange(playerId, event.target.value as BotPersonaId);
    }

    return (
        <article className="panel debug-panel" aria-label="Debug controls">
            <div className="panel__header">
                <h2>Debug</h2>
                <span>Local only</span>
            </div>

            <div className="debug-panel__summary">
                <div>
                    <span>Current actor</span>
                    <strong>{currentActor ? currentActor.name : "None"}</strong>
                </div>
                <div>
                    <span>Autoplay</span>
                    <strong>{botAutoplayEnabled ? "On" : "Paused"}</strong>
                </div>
                <div>
                    <span>Reveal cards</span>
                    <strong>{revealAllCards ? "On" : "Off"}</strong>
                </div>
            </div>

            <div className="debug-panel__toggles">
                <button
                    className="action-button"
                    type="button"
                    aria-pressed={revealAllCards}
                    onClick={onToggleRevealAllCards}
                >
                    {revealAllCards ? "Hide all cards" : "Reveal all cards"}
                </button>
                <button
                    className="action-button"
                    type="button"
                    aria-pressed={botAutoplayEnabled}
                    onClick={onToggleBotAutoplay}
                >
                    {botAutoplayEnabled ? "Pause bot autoplay" : "Resume bot autoplay"}
                </button>
                <button className="primary-button" type="button" onClick={onStepBot} disabled={!canStepBot}>
                    Step bot once
                </button>
            </div>

            <div className="debug-panel__players">
                {botPlayers.map((player) => {
                    const selectedPersona = player.botPersonaId ?? "tag";

                    return (
                        <label key={player.id} className="debug-panel__player">
                            <span className="debug-panel__player-name">
                                {player.name}
                                <small>Seat {player.seatIndex}</small>
                            </span>
                            <select
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
                        </label>
                    );
                })}
            </div>

            <p className="debug-panel__note">
                Future personas still resolve to the active TAG behavior until their strategy is enabled.
            </p>
        </article>
    );
}
