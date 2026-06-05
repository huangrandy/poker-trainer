# AI Coaching Bridge Plan

## Purpose
Add a local AI coach for poker training that can explain plays, describe theory-aligned or "GTO-like" lines, and answer follow-up questions about the current hand.

This is for personal use. The initial goal is to validate the full request/response loop locally before wiring the feature into the React UI.

## Current State

- The app is currently a client-side React app built with Vite.
- Game state lives in React state and persists to `localStorage`.
- The poker engine is already the source of truth for gameplay state and legal actions.
- There is no backend server in the repo yet.
- The new AI layer should be introduced without disturbing gameplay behavior.

## Core Design Principle

Keep the AI integration behind a local server bridge.

- The browser should send a compact analysis snapshot to a local endpoint.
- The server should own orchestration of the AI call.
- The UI should only render results and manage chat state.
- Game rules and state transitions should remain in the engine.

## Recommended End State

1. React app builds an analysis snapshot from `GameState`.
2. A local server exposes a coaching endpoint.
3. The server can talk to Codex CLI or a mock adapter.
4. The browser renders a chat-style coach panel.
5. The coach can answer follow-up questions using the same session when possible.

## Implementation Phases

### Phase 1 - Standalone server with mock states

Goal:
Prove the full server contract, prompt assembly, and response shaping without touching the frontend.

What to build:

- A local Node server.
- A single coaching endpoint.
- A mock adapter that returns deterministic coaching output.
- One or more mock poker hand snapshots.
- Prompt/context assembly from snapshot to coach prompt.
- Tests for request validation and response shape.

Success criteria:

- `POST /api/coach` works locally.
- The endpoint accepts a poker snapshot payload.
- The endpoint returns stable JSON.
- The server works without the browser.
- The server can be exercised entirely with mock states.

### Phase 2 - Codex bridge adapter

Goal:
Swap the mock adapter for a real Codex-backed adapter behind the same interface.

What to build:

- A `CoachAdapter` interface.
- A Codex CLI adapter.
- Optional session reuse or resume support.
- Timeouts and error handling.

Success criteria:

- The same endpoint still works.
- The server can switch between mock and real adapters.
- The interface stays stable for the frontend.

### Phase 3 - Session persistence

Goal:
Keep a conversation attached to a hand or training thread.

What to build:

- A session id model.
- Resume or continuation support.
- Reset / new session behavior.

Success criteria:

- Follow-up questions can reuse context.
- A new hand can start a new session if desired.

### Phase 4 - Frontend integration

Goal:
Connect the React app to the server bridge.

What to build:

- Coach panel UI.
- Request trigger from the live game state.
- Loading, success, and error states.
- Response rendering.

Success criteria:

- The current hand can be sent to the server from the browser.
- The server response appears in the UI.
- Gameplay remains unchanged.

### Phase 5 - Prompt refinement

Goal:
Make the coach useful as a poker trainer.

What to build:

- Better system prompt.
- Consistent explanation format.
- Action recommendation plus reasons.
- Range, pot-odds, and blocker explanations.
- Clear assumptions when the spot is ambiguous.

### Phase 6 - UX polish

Goal:
Make the coach comfortable to use repeatedly during study.

What to build:

- Quick-prompt buttons.
- Conversation history per hand.
- Streaming or partial response handling if available.
- Reset / replay interaction.

## Phase 1 Spec

### Objective

Build a standalone local server that can accept a mock poker snapshot and return a coaching response, with no dependency on the React frontend.

### Why this is the first atomic step

This proves:

- the server can receive data
- the server can validate data
- the server can format a prompt
- the server can return a stable result
- the AI bridge can be swapped later without changing the API

### Phase 1 Non-goals

- No React UI changes.
- No browser integration.
- No real Codex CLI execution yet.
- No session persistence yet.
- No streaming required yet.

### Proposed Server Contract

#### `POST /api/coach`

Request body:

```ts
type CoachRequest = {
  prompt: string;
  snapshot: CoachSnapshot;
  sessionId?: string | null;
};
```

Snapshot shape:

```ts
type CoachSnapshot = {
  handNumber: number;
  street: "not_started" | "preflop" | "flop" | "turn" | "river" | "showdown" | "hand_complete";
  heroPlayerId: string | null;
  legalActions: Array<{
    type: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
    minAmount?: number;
    maxAmount?: number;
    callAmount?: number;
  }>;
  gameState: {
    board: Array<{ rank: string; suit: string }>;
    players: Array<{
      id: string;
      name: string;
      seatIndex: number;
      isHero: boolean;
      stack: number;
      currentStreetBet: number;
      totalCommittedThisHand: number;
      status: string;
      holeCards: Array<{ rank: string; suit: string }>;
    }>;
    pot: {
      mainPot: number;
      sidePots: Array<{
        amount: number;
        eligiblePlayerIds: string[];
      }>;
    };
    betting: {
      currentBet: number;
      minRaiseTo: number;
      lastAggressorSeatIndex: number | null;
      currentActorSeatIndex: number | null;
    };
    actionHistory: Array<{
      id: string;
      type: string;
      playerId: string | null;
      street: string;
      handNumber: number;
      amount?: number;
      timestampMs: number;
    }>;
  };
};
```

Response shape:

```ts
type CoachResponse = {
  ok: true;
  sessionId: string | null;
  text: string;
  summary: string;
  recommendedAction: string | null;
  confidence: "low" | "medium" | "high" | null;
};
```

### Prompt Assembly Requirements

The server should convert the snapshot into a compact coaching prompt that includes:

- hero hole cards
- board cards
- street
- pot size
- stacks
- legal actions
- current actor
- recent action history
- any relevant assumptions

The first version should keep prompt construction deterministic so it can be tested.

### Mock Adapter Behavior

The mock adapter should:

- ignore the real Codex CLI
- return predictable coaching text
- echo the important snapshot details back in a structured way
- include a recommended action and short reasoning

This is only for validating the server contract.

### Suggested Phase 1 Files

- `server/index.ts`
- `server/types.ts`
- `server/prompt.ts`
- `server/mockCoach.ts`
- `server/fixtures/*.ts`
- `server/server.test.ts`

### Phase 1 Acceptance Criteria

- The server starts locally.
- The endpoint accepts at least one mock preflop and one mock postflop spot.
- Invalid requests are rejected with clear validation errors.
- Valid requests return stable JSON.
- Prompt assembly is testable without the frontend.
- No browser code is required to verify success.

### Phase 1 Test Matrix

- valid preflop spot
- valid flop spot
- missing prompt
- missing snapshot
- malformed player array
- malformed legal action array
- deterministic prompt output
- stable mock response output

## Future Notes for Any Agent

- Keep the frontend and server loosely coupled.
- Prefer a small request/response contract over passing the entire app state around.
- Keep mock state fixtures around even after the real Codex adapter exists.
- If the Codex CLI integration changes later, preserve the endpoint contract and swap only the adapter.
- Do not move poker rules into the server bridge. The game engine remains the source of truth.

