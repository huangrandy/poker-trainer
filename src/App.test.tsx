import { render, screen, waitFor } from "@testing-library/react";
import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as engine from "./features/game-engine/engine";
import { createSampleGameState } from "./features/game-engine/fixtures";
import type { Card, GameState } from "./features/game-engine/types";

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

function makeCard(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

function createShowdownRevealState(): GameState {
  const showdownState: GameState = {
    ...createSampleGameState(),
    handNumber: 3,
    street: "river",
    dealerSeatIndex: 0,
    buttonSeatIndex: 0,
    board: [
      makeCard("2", "clubs"),
      makeCard("3", "diamonds"),
      makeCard("4", "hearts"),
      makeCard("5", "spades"),
      makeCard("9", "clubs"),
    ],
    deck: createSampleGameState().deck,
    players: createSampleGameState().players.map((player) => {
      if (player.id === "hero") {
        return {
          ...player,
          stack: 995,
          holeCards: [makeCard("A", "clubs"), makeCard("6", "clubs")],
          currentStreetBet: 0,
          totalCommittedThisHand: 10,
          status: "active" as const,
          hasActedThisStreet: true,
        };
      }

      return {
        ...player,
        stack: 990,
        holeCards: [makeCard("K", "clubs"), makeCard("K", "diamonds")],
        currentStreetBet: 0,
        totalCommittedThisHand: 10,
        status: "active" as const,
        hasActedThisStreet: true,
      };
    }),
    betting: {
      currentBet: 0,
      minRaiseTo: 10,
      lastAggressorSeatIndex: null,
      currentActorSeatIndex: 0,
    },
    pot: {
      mainPot: 25,
      sidePots: [],
    },
    actionHistory: [],
    lastHandResult: null,
  };

  const afterHeroCheck = engine.applyAction(showdownState, {
    type: "check",
    playerId: "hero",
  });

  return engine.applyAction(afterHeroCheck, {
    type: "check",
    playerId: "bot-1",
  });
}

function createActionChipState(): GameState {
  return {
    ...createSampleGameState(),
    handNumber: 2,
    street: "preflop",
    dealerSeatIndex: 0,
    buttonSeatIndex: 0,
    board: [],
    deck: createSampleGameState().deck,
    players: createSampleGameState().players.map((player) => {
      if (player.id === "hero") {
        return {
          ...player,
          stack: 990,
          holeCards: [makeCard("A", "clubs"), makeCard("K", "diamonds")],
          currentStreetBet: 10,
          totalCommittedThisHand: 10,
          status: "active" as const,
          hasActedThisStreet: true,
        };
      }

      return {
        ...player,
        stack: 990,
        holeCards: [makeCard("Q", "clubs"), makeCard("J", "diamonds")],
        currentStreetBet: 10,
        totalCommittedThisHand: 10,
        status: "active" as const,
        hasActedThisStreet: true,
      };
    }),
    betting: {
      currentBet: 10,
      minRaiseTo: 20,
      lastAggressorSeatIndex: 1,
      currentActorSeatIndex: null,
    },
    pot: {
      mainPot: 20,
      sidePots: [],
    },
    actionHistory: [
      {
        id: "2:1",
        type: "call",
        playerId: "hero",
        amount: 10,
        street: "preflop",
        handNumber: 2,
        timestampMs: 1,
      },
      {
        id: "2:2",
        type: "check",
        playerId: "bot-1",
        street: "preflop",
        handNumber: 2,
        timestampMs: 2,
      },
    ],
    lastHandResult: null,
  };
}

function createBoardHeaderState(): GameState {
  return {
    ...createActionChipState(),
    board: [
      makeCard("9", "diamonds"),
      makeCard("8", "clubs"),
      makeCard("A", "hearts"),
    ],
  };
}

describe("App", () => {
  it("increments the hand count when starting a new hand", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const handLabel = screen.getByText("Hand", { exact: true });
    const handStat = handLabel.parentElement;

    expect(handStat).not.toBeNull();
    expect(handStat).toHaveTextContent("1");
    expect(container.querySelector(".seat-card.is-current")).not.toBeNull();

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

  it("shows the winner reveal after a completed showdown hand", () => {
    vi.spyOn(engine, "startHand").mockImplementation(() => createShowdownRevealState());

    const { container } = render(<App />);
    const potPill = container.querySelector(".board-panel__pot");

    expect(potPill).not.toBeNull();
    expect(within(potPill as HTMLElement).getByText("Pot awarded")).toBeInTheDocument();
    expect(within(potPill as HTMLElement).getByText("25")).toBeInTheDocument();
    expect(container.querySelector(".hand-reveal__players")).not.toBeInTheDocument();

    const winnerSeat = container.querySelector(".seat-card--winner");
    expect(winnerSeat).not.toBeNull();
    expect(within(winnerSeat as HTMLElement).getByText("Straight, 6 high")).toBeInTheDocument();

    const heroWinningCard = screen.getByText("6", { selector: ".table-card__rank" }).closest(".table-card");
    expect(heroWinningCard).toHaveClass("table-card--highlighted");

    const heroUnusedCard = screen.getByText("A", { selector: ".table-card__rank" }).closest(".table-card");
    expect(heroUnusedCard).toHaveClass("table-card--muted");

    const botCards = screen.getAllByText("K", { selector: ".table-card__rank" });
    expect(botCards[0].closest(".table-card")).toHaveClass("table-card--muted");
  });

  it("shows recent seat action chips on the table", () => {
    vi.spyOn(engine, "startHand").mockImplementation(() => createActionChipState());

    render(<App />);

    expect(screen.getByText("Call 10")).toBeInTheDocument();
    expect(screen.getByText("Check")).toBeInTheDocument();
  });

  it("renders the legal actions in the table strip", () => {
    const { container } = render(<App />);
    const actionStrip = container.querySelector(".table-actions");

    expect(actionStrip).not.toBeNull();
    expect(within(actionStrip as HTMLElement).getByRole("button", { name: "Fold" })).toBeInTheDocument();
  });

  it("highlights the current actor instead of showing a footer row", () => {
    const { container } = render(<App />);

    expect(container.querySelector(".seat-card.is-current")).not.toBeNull();
    expect(screen.queryByText("Current actor")).not.toBeInTheDocument();
  });

  it("does not show the board label or card counter in the community panel", () => {
    vi.spyOn(engine, "startHand").mockImplementation(() => createBoardHeaderState());

    render(<App />);

    expect(screen.queryByText("Board")).not.toBeInTheDocument();
    expect(screen.queryByText("3/5")).not.toBeInTheDocument();
  });
});
