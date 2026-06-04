# Stabilization Audit

## Status

The MVP is now substantially stabilized:
- engine lifecycle, bot stop conditions, and table UI regressions are covered
- hand settlement on fold and showdown is implemented
- busted-hero rebuy flow is implemented
- the remaining work is mostly roadmap cleanup, winner/settlement messaging, and future product features

## Current architecture summary

- `src/features/game-engine/engine.ts` is the real source of truth for hand lifecycle, blinds, dealing, betting, street progression, showdown/hand completion, and legal action calculation.
- `src/features/bots/simpleBot.ts` is a thin consumer of the engine. It asks the engine for legal actions, picks one, and can auto-advance multiple bot turns.
- `src/App.tsx` is doing more than rendering. It owns bootstrapping, action dispatch, bot auto-advance orchestration, restart/rebuy wiring, current-actor lookup, legal-action rendering, action-history formatting, and seat/table presentation helpers.
- `src/features/game-engine/fixtures.ts` still provides the sample state used by the live app boot path through `createInitialGameState()`.
- `src/styles.css` owns all table layout, seat positioning, card styling, and responsive behavior.
- The current implementation is not split into separate `components/`, `motion/`, or feature slices beyond `game-engine` and `bots`. The code is functional, but the UI/orchestration boundary is already blurred in `App.tsx`.

## Remaining risk areas

1. UI orchestration is still coupled too closely to engine state.
   - `App.tsx` both renders state and drives progression (`applyAction` + `advanceBotTurns` + `startNextHand`).
   - That makes it easier for bugs to hide in the interaction between React effects, state cloning, and engine transitions.
2. Hand lifecycle logic is split across multiple helpers with overlapping responsibilities.
   - `resetPlayersForNewHand()`, `startHand()`, `startNextHand()`, and the settlement/rebuy helpers all participate in setup/rotation/reset behavior.
   - The more places that know about dealer/button/actor reset rules, the easier it is for one path to drift.
3. Live gameplay still starts from a fixture-like sample state.
   - `createInitialGameState()` boots from `createSampleGameState()`.
   - That is fine for now, but it increases the chance that a sample object becomes an accidental source of truth for live behavior.
4. Visual bugs are still largely outside unit-test coverage.
   - Seat placement, board overlap, action-history readability, and mobile layout all live in CSS/UI behavior that current tests do not verify.
5. Documentation needs to stay in sync with the stabilized behavior.
   - When these docs drift, future sessions can end up re-solving already-fixed lifecycle issues.

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

## Remaining spec gaps

### New hand behavior

- A new hand must preserve stack counts and player seat identities.
- A new hand must reset board, pot, betting state, and per-street flags.
- A new hand must increment `handNumber`.
- A new hand must rotate dealer/button consistently from the prior hand.
- A new hand must mark players with zero chips as `out`.
- A new hand must stop and mark `hand_complete` if fewer than two active players remain.
- A busted hero must be able to rebuy before the next hand if the table can continue.

### Button/blind rotation

- Preflop blind placement must be explicit for both normal tables and heads-up tables.
- Button/dealer progression must be defined relative to the prior hand, not the sample fixture.
- First actor selection must be specified for:
  - 2 players
  - 3+ players
  - all-in blind posts

### Hand settlement

- Fold-ending hands must award the pot to the last remaining contender.
- Showdown-ending hands must award the pot to the best hand.
- Tied showdown hands must split the pot according to the engine's settlement rule.
- The UI should expose the settlement result clearly enough that the player can tell who won.

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

## Remaining tests to consider

### Engine unit tests

- `src/features/game-engine/engine.test.ts`
  - `it("updates minimum raise thresholds after a legal raise")`
  - `it("handles a new hand when only one active player remains")`
- `src/features/game-engine/engine.test.ts` or a new `src/features/game-engine/lifecycle.test.ts`
  - `it("preserves player stacks and status while resetting board, betting, and per-street flags")`
  - `it("increments handNumber without resetting action history unexpectedly")`

### Bot tests

- `src/features/bots/simpleBot.test.ts`
  - `it("returns null when no legal actions exist")`
  - `it("does not exceed the maxSteps guard on a looping state")`

### Integration / state lifecycle tests

- `src/features/game-engine/engine.test.ts`
  - `it("startHand -> hero action -> bot auto-advance -> next hand preserves table state")`
  - `it("startNextHand rotates the button after a completed hand with multiple active players")`
- A new integration file such as `src/features/game-engine/stateLifecycle.test.ts`
  - `it("plays a full hand from preflop to showdown with alternating hero and bot turns")`
  - `it("starts a second hand from the completed table state and does not reuse the previous deck order")`
  - `it("shows the settlement result or winner after the hand ends")`

### UI/component/visual checks

- A future UI test file such as `src/App.test.tsx` or `src/App.visual.test.tsx`
  - `it("renders the table, board, legal actions, and history for a started hand")`
  - `it("renders the hand-complete state with the new-hand button")`
  - `it("highlights the current actor seat")`
- Manual visual acceptance checks for the table layout
  - Desktop: board centered, seats outside the board, no overlap
  - Mobile: dashboard stacks cleanly, cards remain legible, action buttons remain tappable

## Recommended next order

1. Keep the docs and roadmap aligned with the now-stabilized MVP.
2. Add a visible settlement/winner summary if product clarity needs it.
3. Decide the next product-layer feature: history export, persistence, or stats.
4. Clean up architecture boundaries if `App.tsx` starts to grow again.

## Doc drift to update next

- `.agent/plans/activeContext.md`
  - Now reflects the stabilized MVP, but should stay aligned as new product work is added.
- `.agent/plans/progress.md`
  - Now reflects the current implementation state, but should continue to be kept current.
- `.agent/plans/systemPatterns.md`
  - Now describes the current engine/App boundary, but should be revisited if orchestration moves out of `App.tsx`.
- `TASKS.md`
  - Updated to reflect current MVP and next product-layer additions.
- `ARCHITECTURE.md`
  - Updated to reflect the current ownership split, especially the orchestration currently sitting in `App.tsx`.

## Do not implement yet

This file is now a review artifact, not a blocking stabilization gate.
