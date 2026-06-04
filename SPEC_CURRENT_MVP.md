# SPEC_CURRENT_MVP.md

## Current MVP scope

The app currently supports:
- playing a local Texas Hold'em hand
- one hero player
- simple bots
- table rendering
- action buttons
- action history
- starting next hands

AI analysis, animations, advanced bot strategy, hand evaluator correctness, multiplayer, database persistence, and GTO are out of scope for stabilization.

## Hand lifecycle acceptance criteria

- The first hand starts from a valid initialized table state with cards dealt, blinds posted, and a current actor selected.
- `startNextHand` increments `handNumber` by 1.
- Dealer and button rotation must advance from the previous completed hand, not from the initial fixture.
- Small blind and big blind assignment must follow the active-seat order defined by the engine.
- Player identities, seats, and chip stacks must be preserved across hands.
- A new hand must reset board cards, pot totals, street bets, hole cards, current actor, and per-street flags.
- Players with zero stack must be marked `out`.
- A hand must end as `hand_complete` when fewer than two active contenders remain.

## Betting/legal action acceptance criteria

- Legal actions must come from `getLegalActions`.
- UI and bots must not duplicate legality rules.
- `check` is only legal when facing no bet.
- `call` is only legal when facing a bet.
- `fold` is legal when facing a bet.
- `bet`, `raise`, and `all_in` amounts must respect the engine's legal min/max boundaries.
- `applyAction` must reject invalid actions and not silently accept them.

## Street progression acceptance criteria

- Preflop must progress to flop when the betting round is settled.
- Flop must progress to turn when the betting round is settled.
- Turn must progress to river when the betting round is settled.
- River must progress to showdown or `hand_complete` when the betting round is settled.
- All-in runout behavior must reveal the remaining board cards and then finish the hand.
- If only one contender remains, the hand must complete without advancing through extra streets.

## Bot auto-advance acceptance criteria

- Bots only act when the current actor is a bot.
- Bots only choose legal actions returned by the engine.
- The bot loop stops when the hero becomes the current actor.
- The bot loop stops on `hand_complete`.
- The bot loop cannot run forever; the `maxSteps` guard must be tested.

## Randomness acceptance criteria

- Tests may use deterministic injected random values.
- Live gameplay must not accidentally use a fixed seeded shuffle.
- New live hands should not reuse the previous deck order unless explicitly seeded for testing.

## Action history acceptance criteria

- Every visible player action displays the actor name.
- System events display clear labels.
- Amounts display for calls, bets, raises, blinds, and all-ins when relevant.
- The order of action history must be explicitly defined and kept consistent in the UI.
- Action history should remain readable as it grows.

## UI layout/rendering acceptance criteria

- The board does not overlap seats on common desktop widths.
- The hero seat does not overlap community cards.
- Mobile and narrow layouts remain readable.
- Hearts and diamonds render red.
- Clubs and spades render black.
- The current actor is visually distinguishable.
- Legal action buttons are visible and usable.
- `hand_complete` state shows a new-hand action.
