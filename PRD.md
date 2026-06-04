# Poker Trainer PRD

## Goal
Build a local poker trainer where the user can play Texas Hold'em hands at a table against simple bots.

## MVP
The first working version should allow:
- Start a new hand
- Seat one human player and several bot players
- Post blinds
- Deal hole cards
- Progress through preflop, flop, turn, river, showdown
- Let the human choose fold, check, call, bet, raise when legal
- Let bots choose simple legal actions
- Track pot, stacks, board, current street, current actor
- End the hand and start a new one

## Out of scope for MVP
- AI analysis
- GTO strategy
- Real-money logic
- Multiplayer
- Accounts
- Advanced animations
- Perfect bot intelligence
- Complex side-pot handling unless easy to test

## Future roadmap
- Export current game state for Codex/AI analysis
- Save hand history
- Ask AI for advice at any point
- Bot personas
- Leak tracking
- Stats dashboard
- Replay mode

## Success criteria
- User can complete a full hand from preflop to showdown.
- Game prevents illegal actions.
- Engine tests cover core state transitions.
- UI reflects game state accurately.