import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DebugPanel } from "./DebugPanel";
import type { PlayerState } from "../features/game-engine/types";

function createPlayer(overrides: Partial<PlayerState>): PlayerState {
  return {
    id: overrides.id ?? "bot-1",
    name: overrides.name ?? "Bot 1",
    seatIndex: overrides.seatIndex ?? 1,
    isHero: overrides.isHero ?? false,
    isBot: overrides.isBot ?? true,
    botPersonaId: overrides.botPersonaId,
    stack: overrides.stack ?? 1000,
    holeCards: overrides.holeCards ?? [],
    currentStreetBet: overrides.currentStreetBet ?? 0,
    totalCommittedThisHand: overrides.totalCommittedThisHand ?? 0,
    status: overrides.status ?? "active",
    hasActedThisStreet: overrides.hasActedThisStreet ?? false,
  };
}

describe("DebugPanel", () => {
  it("renders debug controls and forwards persona changes", () => {
    const onToggleRevealAllCards = vi.fn();
    const onToggleBotAutoplay = vi.fn();
    const onStepBot = vi.fn();
    const onRebuyPlayer = vi.fn();
    const onResetGame = vi.fn();
    const onPlayerPersonaChange = vi.fn();
    const onPlayerHoleCardsChange = vi.fn();

    render(
      <DebugPanel
        players={[
          createPlayer({
            id: "bot-1",
            name: "Bot 1",
            seatIndex: 1,
            botPersonaId: "tag",
            holeCards: [
              { rank: "A", suit: "spades" },
              { rank: "K", suit: "diamonds" },
            ],
          }),
          createPlayer({ id: "hero", name: "Hero", seatIndex: 0, isHero: true, isBot: false }),
        ]}
        currentActorSeatIndex={1}
        revealAllCards={false}
        botAutoplayEnabled={false}
        onToggleRevealAllCards={onToggleRevealAllCards}
        onToggleBotAutoplay={onToggleBotAutoplay}
        onStepBot={onStepBot}
        onRebuyPlayer={onRebuyPlayer}
        onResetGame={onResetGame}
        onPlayerPersonaChange={onPlayerPersonaChange}
        onPlayerHoleCardsChange={onPlayerHoleCardsChange}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Reveal cards" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Bot autoplay" }));
    fireEvent.click(screen.getByRole("button", { name: "Step bot once" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Bot 1 persona" }), {
      target: { value: "nit" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Bot 1 card 1 rank" }), {
      target: { value: "Q" },
    });

    expect(onToggleRevealAllCards).toHaveBeenCalledTimes(1);
    expect(onToggleBotAutoplay).toHaveBeenCalledTimes(1);
    expect(onStepBot).toHaveBeenCalledTimes(1);
    expect(onRebuyPlayer).not.toHaveBeenCalled();
    expect(onResetGame).not.toHaveBeenCalled();
    expect(onPlayerPersonaChange).toHaveBeenCalledWith("bot-1", "nit");
    expect(onPlayerHoleCardsChange).toHaveBeenCalledWith("bot-1", [
      { rank: "Q", suit: "spades" },
      { rank: "K", suit: "diamonds" },
    ]);
    expect(screen.getByText(/Current actor:/i)).toBeInTheDocument();
    expect(screen.getByText("Effective: TAG")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "General" })).toBeInTheDocument();
  });

  it("disables stepping while autoplay is enabled", () => {
    render(
      <DebugPanel
        players={[createPlayer({ id: "bot-1", name: "Bot 1", seatIndex: 1 })]}
        currentActorSeatIndex={1}
        revealAllCards={true}
        botAutoplayEnabled={true}
        onToggleRevealAllCards={() => {}}
        onToggleBotAutoplay={() => {}}
        onStepBot={() => {}}
        onRebuyPlayer={() => {}}
        onResetGame={() => {}}
        onPlayerPersonaChange={() => {}}
        onPlayerHoleCardsChange={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Step bot once" })).toBeDisabled();
  });

  it("forwards bot rebuy and game reset actions", () => {
    const onRebuyPlayer = vi.fn();
    const onResetGame = vi.fn();

    render(
      <DebugPanel
        players={[
          createPlayer({ id: "bot-1", name: "Bot 1", seatIndex: 1 }),
          createPlayer({ id: "bot-2", name: "Bot 2", seatIndex: 2, stack: 0, status: "out" }),
        ]}
        currentActorSeatIndex={null}
        revealAllCards={false}
        botAutoplayEnabled={false}
        onToggleRevealAllCards={() => {}}
        onToggleBotAutoplay={() => {}}
        onStepBot={() => {}}
        onRebuyPlayer={onRebuyPlayer}
        onResetGame={onResetGame}
        onPlayerPersonaChange={() => {}}
        onPlayerHoleCardsChange={() => {}}
      />
    );

    expect(screen.queryAllByRole("button", { name: "Rebuy bot" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Rebuy bot" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset game" }));

    expect(onRebuyPlayer).toHaveBeenCalledWith("bot-2");
    expect(onResetGame).toHaveBeenCalledTimes(1);
  });
});
