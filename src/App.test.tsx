import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { within } from "@testing-library/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as engine from "./features/game-engine/engine";
import { createSampleGameState } from "./features/game-engine/fixtures";
import type { Card, GameState } from "./features/game-engine/types";

import App from "./App";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

const GAME_STATE_STORAGE_KEY = "poker-trainer:game-state";

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

function createFoldedVillainState(): GameState {
  return {
    ...createActionChipState(),
    players: createActionChipState().players.map((player) => {
      if (player.id === "bot-1") {
        return {
          ...player,
          status: "folded" as const,
        };
      }

      return player;
    }),
  };
}

function createRaiseActionState(): GameState {
  return {
    ...createSampleGameState(),
    handNumber: 2,
    street: "preflop",
    dealerSeatIndex: 1,
    buttonSeatIndex: 1,
    board: [],
    deck: createSampleGameState().deck,
    players: createSampleGameState().players.map((player) => {
      if (player.id === "hero") {
        return {
          ...player,
          stack: 940,
          holeCards: [makeCard("A", "clubs"), makeCard("K", "diamonds")],
          currentStreetBet: 10,
          totalCommittedThisHand: 10,
          status: "active" as const,
          hasActedThisStreet: false,
        };
      }

      return {
        ...player,
        stack: 950,
        holeCards: [makeCard("Q", "clubs"), makeCard("J", "diamonds")],
        currentStreetBet: 50,
        totalCommittedThisHand: 50,
        status: "active" as const,
        hasActedThisStreet: true,
      };
    }),
    betting: {
      currentBet: 50,
      minRaiseTo: 100,
      lastAggressorSeatIndex: 1,
      currentActorSeatIndex: 0,
    },
    pot: {
      mainPot: 100,
      sidePots: [],
    },
    actionHistory: [
      {
        id: "2:1",
        type: "bet",
        playerId: "bot-1",
        amount: 50,
        street: "preflop",
        handNumber: 2,
        timestampMs: 1,
      },
    ],
    lastHandResult: null,
    };
}

function createPostflopActionChipState(): GameState {
  const actionChipState = createActionChipState();

  return {
    ...actionChipState,
    street: "flop",
    board: [
      makeCard("9", "diamonds"),
      makeCard("8", "clubs"),
      makeCard("A", "hearts"),
    ],
    betting: {
      ...actionChipState.betting,
      currentActorSeatIndex: null,
    },
    actionHistory: actionChipState.actionHistory.map((record) => ({
      ...record,
      street: "flop",
    })),
  };
}

function createBlindRevealState(startHandImpl: typeof engine.startHand): GameState {
  const started = startHandImpl(createSampleGameState(), { random: () => 0 });

  return {
    ...started,
    betting: {
      ...started.betting,
      currentActorSeatIndex: null,
    },
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

function createStreetRevealState(startHandImpl: typeof engine.startHand): GameState {
  const started = startHandImpl(createSampleGameState(), { random: () => 0 });
  const afterHeroCall = engine.applyAction(started, {
    type: "call",
    playerId: "hero",
  });

  return engine.applyAction(afterHeroCall, {
    type: "check",
    playerId: "bot-1",
  });
}

describe("App", () => {
  it("keeps the center board height fixed as the board changes", () => {
    const emptyRender = render(<App />);
    const emptyBoardPanel = emptyRender.container.querySelector(".poker-table-scene");

    expect(emptyBoardPanel).not.toBeNull();

    const emptyHeight = window.getComputedStyle(emptyBoardPanel as HTMLElement).height;
    emptyRender.unmount();

    const realStartHand = engine.startHand;
    vi.spyOn(engine, "startHand").mockImplementation(() => createStreetRevealState(realStartHand));
    const filledRender = render(<App />);
    const filledBoardPanel = filledRender.container.querySelector(".poker-table-scene");

    expect(filledBoardPanel).not.toBeNull();
    expect(window.getComputedStyle(filledBoardPanel as HTMLElement).height).toBe(emptyHeight);
    filledRender.unmount();
  });

  it("increments the hand count when starting a new hand", async () => {
    const realStartHand = engine.startHand;
    vi.spyOn(engine, "startHand").mockImplementation(() => createBustedHeroState(realStartHand));

    const { container } = render(<App />);

    const handLabel = screen.getByText("Hand", { exact: true });
    const handStat = handLabel.parentElement;

    expect(handStat).not.toBeNull();
    expect(handStat).toHaveTextContent("1");
    expect(container.querySelectorAll(".poker-table-scene__seat").length).toBe(6);

    expect(
      await screen.findByText("Hand complete. Rebuy the hero to continue.", {}, { timeout: 5000 })
    ).toBeInTheDocument();

    const newHandButton = await screen.findByRole("button", { name: "Rebuy and start new hand" }, { timeout: 5000 });
    act(() => {
      newHandButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      expect(handStat).toHaveTextContent("2");
    });
  }, 10000);

  it("shows the rebuy flow when the hero is busted", async () => {
    const realStartHand = engine.startHand;
    vi.spyOn(engine, "startHand").mockImplementation(() => createBustedHeroState(realStartHand));

    render(<App />);

    expect(
      await screen.findByText("Hand complete. Rebuy the hero to continue.", {}, { timeout: 5000 })
    ).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: "Rebuy and start new hand" }).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Hand", { exact: true }).parentElement).toHaveTextContent("2");
    });

    expect(screen.getByText("Street", { exact: true }).parentElement).toHaveTextContent(
      "preflop"
    );
  }, 10000);

  it("shows showdown winners, losers, and hand tooltips", () => {
    vi.spyOn(engine, "startHand").mockImplementation(() => createShowdownRevealState());

    const { container } = render(<App />);
    const potPill = container.querySelector(".poker-table-scene__pot");
    const winnerBanner = container.querySelector(".poker-table-scene__banner--winner");
    const loserBanner = container.querySelector(".poker-table-scene__banner--loser");

    expect(potPill).not.toBeNull();
    expect(within(potPill as HTMLElement).getByText("Pot awarded")).toBeInTheDocument();
    expect(within(potPill as HTMLElement).getByText("25")).toBeInTheDocument();
    expect(winnerBanner).not.toBeNull();
    expect(loserBanner).not.toBeNull();
    expect(container.querySelectorAll(".poker-table-scene__hand-tooltip")).toHaveLength(2);
    expect(container.querySelectorAll(".table-card--highlighted").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".table-card--muted").length).toBeGreaterThan(0);
    expect(within(winnerBanner as HTMLElement).getByText(/Straight/i)).toBeInTheDocument();
    expect(within(loserBanner as HTMLElement).getByText(/Pair/i)).toBeInTheDocument();
  });

  it("restores a saved game state from local storage", () => {
    window.localStorage.setItem(
      GAME_STATE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        gameState: createShowdownRevealState(),
      })
    );

    const { container } = render(<App />);

    expect(screen.getByText("Hand", { exact: true }).parentElement).toHaveTextContent("3");
    expect(screen.getByText("Street", { exact: true }).parentElement).toHaveTextContent("hand_complete");
    expect(within(container.querySelector(".poker-table-scene__pot") as HTMLElement).getByText("Pot awarded")).toBeInTheDocument();
    expect(container.querySelectorAll(".poker-table-scene__hand-tooltip")).toHaveLength(2);
  });

  it("falls back to a fresh game when saved state is invalid", () => {
    window.localStorage.setItem(GAME_STATE_STORAGE_KEY, "{\"version\":1,\"gameState\":null}");

    render(<App />);

    expect(screen.getByText("Hand", { exact: true }).parentElement).toHaveTextContent("1");
    expect(screen.getByText("Street", { exact: true }).parentElement).toHaveTextContent("preflop");

    const savedSnapshot = JSON.parse(window.localStorage.getItem(GAME_STATE_STORAGE_KEY) ?? "null");
    expect(savedSnapshot.version).toBe(1);
    expect(savedSnapshot.gameState.handNumber).toBe(1);
  });

  it("shows recent seat action chips on the table", async () => {
    vi.spyOn(engine, "startHand").mockImplementation(() => createPostflopActionChipState());

    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelectorAll(".poker-table-scene__action")).toHaveLength(2);
      expect(screen.getByText("Call $10")).toBeInTheDocument();
      expect(screen.getByText("Check")).toBeInTheDocument();
    });
  });

  it("keeps villain hole cards face down during the hand and dims folded cards", () => {
    vi.spyOn(engine, "startHand").mockImplementation(() => createActionChipState());

    const { container } = render(<App />);

    expect(container.querySelectorAll(".poker-table-scene__hole-cards .table-card").length).toBe(4);
    expect(container.querySelectorAll(".poker-table-scene__hole-cards .table-card--face-down")).toHaveLength(2);
  });

  it("dims folded villain cards before showdown", () => {
    vi.spyOn(engine, "startHand").mockImplementation(() => createFoldedVillainState());

    const { container } = render(<App />);
    const foldedCards = container.querySelectorAll(".poker-table-scene__hole-cards .table-card--muted");

    expect(foldedCards.length).toBe(2);
    expect(container.querySelectorAll(".poker-table-scene__hole-cards .table-card--face-down")).toHaveLength(2);
  });

  it("flips all villain hole cards face up on showdown", () => {
    vi.spyOn(engine, "startHand").mockImplementation(() => createShowdownRevealState());

    const { container } = render(<App />);

    expect(container.querySelectorAll(".poker-table-scene__hole-cards .table-card--face-down")).toHaveLength(0);
  });

  it("keeps blind chips visible through the end of preflop betting", async () => {
    const realStartHand = engine.startHand;
    vi.spyOn(engine, "startHand").mockImplementation(() => createBlindRevealState(realStartHand));

    vi.useFakeTimers();

    const { container } = render(<App />);

    await act(async () => {
      vi.runAllTimers();
    });

    expect(container.querySelectorAll(".poker-table-scene__action")).toHaveLength(2);
    expect(screen.getByText("BB $10")).toBeInTheDocument();
  });

  it("renders the community cards directly without a face-down reveal", async () => {
    const realStartHand = engine.startHand;
    vi.spyOn(engine, "startHand").mockImplementation(() => createStreetRevealState(realStartHand));

    const { container } = render(<App />);
    const boardCards = container.querySelectorAll(".poker-table-scene__community .table-card");

    expect(boardCards.length).toBeGreaterThan(0);
    boardCards.forEach((card) => {
      expect(card).not.toHaveClass("table-card--face-down");
    });
  });

  it("renders the legal actions in the table strip", () => {
    const { container } = render(<App />);
    const actionStrip = container.querySelector(".table-actions");

    expect(actionStrip).not.toBeNull();
    expect(within(actionStrip as HTMLElement).getByRole("button", { name: "Fold" })).toBeInTheDocument();
  });

  it("opens a raise tray and confirms a sized raise", async () => {
    vi.spyOn(engine, "startHand").mockImplementation(() => createRaiseActionState());

    const { container } = render(<App />);

    act(() => {
      screen.getByRole("button", { name: "Raise $100" }).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    const raiseTray = container.querySelector(".raise-tray");
    expect(raiseTray).not.toBeNull();
    expect(within(raiseTray as HTMLElement).getByText("Raise to")).toBeInTheDocument();
    expect(screen.getByLabelText("Raise amount")).toHaveValue("100");

    act(() => {
      fireEvent.click(within(raiseTray as HTMLElement).getByRole("button", { name: /3\/4 POT/i }));
    });

    expect(screen.getByLabelText("Raise amount")).toHaveValue("125");

    act(() => {
      within(raiseTray as HTMLElement).getByRole("button", { name: "Confirm raise" }).dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    await waitFor(() => {
      expect(screen.queryByLabelText("Raise controls")).not.toBeInTheDocument();
      expect(screen.getByText(/Hero raised to \$125/)).toBeInTheDocument();
    });
  });

  it("renders the six-seat ring without current-actor styling", () => {
    const { container } = render(<App />);

    expect(container.querySelectorAll(".poker-table-scene__seat").length).toBe(6);
    expect(container.querySelector(".poker-table-scene__seat.is-current")).toBeNull();
  });

  it("does not show the board label or card counter in the community panel", () => {
    vi.spyOn(engine, "startHand").mockImplementation(() => createBoardHeaderState());

    render(<App />);

    expect(screen.queryByText("Board")).not.toBeInTheDocument();
    expect(screen.queryByText("3/5")).not.toBeInTheDocument();
  });
});
