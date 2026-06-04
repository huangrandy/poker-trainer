# Stabilization Audit

## Current architecture summary

- `src/features/game-engine/engine.ts` is the real source of truth for hand lifecycle, blinds, dealing, betting, street progression, showdown/hand completion, and legal action calculation.
- `src/features/bots/simpleBot.ts` is a thin consumer of the engine. It asks the engine for legal actions, picks one, and can auto-advance multiple bot turns.
- `src/App.tsx` is doing more than rendering. It owns bootstrapping, action dispatch, bot auto-advance orchestration, current-actor lookup, legal-action rendering, action-history formatting, and seat/table presentation helpers.
- `src/features/game-engine/fixtures.ts` still provides the sample state used by the live app boot path through `createInitialGameState()`.
- `src/styles.css` owns all table layout, seat positioning, card styling, and responsive behavior.
- The current implementation is not split into separate `components/`, `motion/`, or feature slices beyond `game-engine` and `bots`. The code is functional, but the UI/orchestration boundary is already blurred in `App.tsx`.

## Suspected root causes of repeated bugs

1. Missing explicit specs for state transitions and legality enforcement.
   - The engine tests currently cover the happy path, but not the edge cases that tend to regress: minimum raise enforcement, all-in edge cases, heads-up rotation, stack exhaustion, and hand completion from unusual states.
   - Example risk: `applyAction()` validates turn order and basic action shape, but not every amount rule implied by `getLegalActions()`.
2. UI orchestration is coupled too closely to engine state.
   - `App.tsx` both renders state and drives progression (`applyAction` + `advanceBotTurns` + `startNextHand`).
   - That makes it easier for bugs to hide in the interaction between React effects, state cloning, and engine transitions.
3. Hand lifecycle logic is split across multiple helpers with overlapping responsibilities.
   - `resetPlayersForNewHand()`, `initializeHandState()`, `startHand()`, and `startNextHand()` all participate in setup/rotation/reset behavior.
   - The more places that know about dealer/button/actor reset rules, the easier it is for one path to drift.
4. Live gameplay still starts from a fixture-like sample state.
   - `createInitialGameState()` boots from `createSampleGameState()`.
   - That is fine for now, but it increases the chance that a sample object becomes an accidental source of truth for live behavior.
5. Visual bugs are largely outside unit-test coverage.
   - Seat placement, board overlap, action-history readability, and mobile layout all live in CSS/UI behavior that current tests do not verify.
6. Documentation is stale enough to mislead future sessions.
   - The `.agent/plans/*` docs still describe a pre-engine project state, which can steer future work in the wrong direction.

## Architecture risks

- `src/App.tsx`
  - Owns bootstrapping, orchestration, and presentation helpers in one file.
  - This is the main place where a future state bug can be introduced without an obvious engine test failing.
- `src/features/game-engine/engine.ts`
  - Uses internal mutation on cloned state. That is fine, but it means any missed clone or reset can leak across hands.
  - `startHand()` and `startNextHand()` are close enough that regressions can appear as “same bug, different entry point.”
- `src/features/game-engine/fixtures.ts`
  - A sample state exists alongside live state transitions. That is useful for tests, but risky if it stays intertwined with boot flow.
- `src/styles.css`
  - Seat placement is hard-coded with absolute positioning and breakpoint overrides. That is fragile on smaller screens and with different seat counts.
- `src/features/bots/simpleBot.ts`
  - The bot loop is correct in principle, but it has a `maxSteps` guard and relies on the engine to keep state coherent. That needs explicit regression coverage.

## Missing specs

### New hand behavior

- A new hand must preserve stack counts and player seat identities.
- A new hand must reset board, pot, betting state, and per-street flags.
- A new hand must increment `handNumber`.
- A new hand must rotate dealer/button consistently from the prior hand.
- A new hand must mark players with zero chips as `out`.
- A new hand must stop and mark `hand_complete` if fewer than two active players remain.

### Button/blind rotation

- Preflop blind placement must be explicit for both normal tables and heads-up tables.
- Button/dealer progression must be defined relative to the prior hand, not the sample fixture.
- First actor selection must be specified for:
  - 2 players
  - 3+ players
  - all-in blind posts

### Random vs deterministic shuffling

- Test shuffles should be deterministic through injected `random`.
- Live gameplay should use default randomness and must not accidentally reuse a fixed shuffle source.
- The deck contract should specify that a shuffled deck preserves card identity and count.

### Action history formatting

- Action history must always identify the actor, including system-generated records.
- The UI should show the newest action first.
- Record formatting should be stable for:
  - `start_hand`
  - `deal_next_street`
  - `showdown`
  - player actions with amounts

### Bot auto-advance behavior

- Bots may only act when they are the current actor.
- Bots must stop when the hero becomes the current actor.
- Bots must stop on `hand_complete`.
- Bots must never bypass a hero turn.
- The `maxSteps` guard must be documented and tested so a malformed state does not cause an infinite loop.

### UI layout acceptance criteria

- Seat cards must not overlap the board panel at desktop widths.
- Seat cards must remain readable on mobile widths.
- The current actor must remain visually distinguishable.
- Suit color must remain correct for red/black cards.
- The action-history panel must stay usable when the list grows.
- The table must still render correctly with only two players.

## Missing tests

### Engine unit tests

- `src/features/game-engine/engine.test.ts`
  - `it("rejects bet and raise amounts below the legal minimum")`
  - `it("updates minimum raise thresholds after a legal raise")`
  - `it("rotates dealer, button, and first actor correctly for a three-player hand")`
  - `it("handles a new hand when only one active player remains")`
  - `it("runs out the board and finishes the hand when every active player is all-in")`
  - `it("keeps hand state clean across consecutive startNextHand calls")`
- `src/features/game-engine/engine.test.ts` or a new `src/features/game-engine/lifecycle.test.ts`
  - `it("preserves player stacks and status while resetting board, betting, and per-street flags")`
  - `it("increments handNumber without resetting action history unexpectedly")`

### Bot tests

- `src/features/bots/simpleBot.test.ts`
  - `it("returns null when no legal actions exist")`
  - `it("stops advancing when the hero is the current actor")`
  - `it("stops advancing when the hand is complete")`
  - `it("does not exceed the maxSteps guard on a looping state")`
  - `it("only emits actions that were returned by getLegalActions")`

### Integration / state lifecycle tests

- `src/features/game-engine/engine.test.ts`
  - `it("startHand -> hero action -> bot auto-advance -> next hand preserves table state")`
  - `it("startNextHand rotates the button after a completed hand with multiple active players")`
- A new integration file such as `src/features/game-engine/stateLifecycle.test.ts`
  - `it("plays a full hand from preflop to showdown with alternating hero and bot turns")`
  - `it("starts a second hand from the completed table state and does not reuse the previous deck order")`

### UI/component/visual checks

- A future UI test file such as `src/App.test.tsx` or `src/App.visual.test.tsx`
  - `it("renders the table, board, legal actions, and history for a started hand")`
  - `it("renders the hand-complete state with the new-hand button")`
  - `it("highlights the current actor seat")`
- Manual visual acceptance checks for the table layout
  - Desktop: board centered, seats outside the board, no overlap
  - Mobile: dashboard stacks cleanly, cards remain legible, action buttons remain tappable

## Recommended stabilization order

1. Lock down specs.
   - Write the missing behavior contract for hand transitions, rotation, legality, bot auto-advance, and layout expectations before changing engine behavior.
2. Add regression tests for known bugs and edge cases.
   - Cover minimum raise enforcement, rotation, hand completion, all-in paths, and bot stop conditions.
3. Fix state lifecycle issues in the engine.
   - Keep the changes small and focused on the transition helpers and action validation.
4. Clean up architecture boundaries.
   - If anything still feels too coupled after the tests are in place, move UI-only helpers out of orchestration and reduce the amount of game logic living in `App.tsx`.
5. Improve UI layout verification.
   - Add manual or automated visual checks for the table layout, responsive behavior, and action-history readability.

## Doc drift to update next

- `.agent/plans/activeContext.md`
  - Still says the project is only starting and the engine is not implemented.
- `.agent/plans/progress.md`
  - Still says the poker engine is not yet implemented.
- `.agent/plans/systemPatterns.md`
  - Still describes the intended reducer/state-machine approach, but it needs to be reconciled with the current file layout and the fact that `App.tsx` now orchestrates bot turns and hand starts.
- `TASKS.md`
  - Milestones should be updated to reflect what is already implemented and what remains to stabilize.
- `ARCHITECTURE.md`
  - Should be updated to reflect the current actual ownership split, especially the orchestration currently sitting in `App.tsx`.

## Do not implement yet

Awaiting approval before making changes.
