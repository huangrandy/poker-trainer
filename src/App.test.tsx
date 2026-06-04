import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as engine from "./features/game-engine/engine";
import { createSampleGameState } from "./features/game-engine/fixtures";
import type { GameState } from "./features/game-engine/types";

import App from "./App";

afterEach(() => {
  vi.restoreAllMocks();
});

function createBustedHeroState(startHandImpl: typeof engine.startHand): GameState {
  const started = startHandImpl(createSampleGameState(), { random: () => 0 });

  return {
    ...started,
    street: "hand_complete",
    board: [...started.board],
    betting: {
      ...started.betting,
      currentActorSeatIndex: null,
    },
    pot: {
      ...started.pot,
      mainPot: 1010,
    },
    players: started.players.map((player) => {
      if (player.id === "hero") {
        return {
          ...player,
          stack: 0,
          status: "all_in" as const,
        };
      }

      return {
        ...player,
        stack: 990,
      };
    }),
  };
}

describe("App", () => {
  it("increments the hand count when starting a new hand", async () => {
    const user = userEvent.setup();
    render(<App />);

    const handLabel = screen.getByText("Hand", { exact: true });
    const handStat = handLabel.parentElement;

    expect(handStat).not.toBeNull();
    expect(handStat).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "Fold" }));

    const newHandButton = await screen.findByRole("button", { name: "Start new hand" });
    await user.click(newHandButton);

    await waitFor(() => {
      expect(handStat).toHaveTextContent("2");
    });
  });

  it("shows the rebuy flow when the hero is busted", async () => {
    const user = userEvent.setup();
    const realStartHand = engine.startHand;
    vi.spyOn(engine, "startHand").mockImplementation(() => createBustedHeroState(realStartHand));

    render(<App />);

    expect(
      await screen.findByText("Hand complete. Rebuy the hero to continue.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Rebuy and start new hand" }));

    await waitFor(() => {
      expect(screen.getByText("Hand", { exact: true }).parentElement).toHaveTextContent("2");
    });

    expect(screen.getByText("Street", { exact: true }).parentElement).toHaveTextContent(
      "preflop"
    );
  });
});
