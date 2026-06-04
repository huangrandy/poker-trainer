# Architecture

## Core principle
The poker engine is the source of truth for state transitions and remains independent from React.

React should render `GameState` and trigger engine transitions. It should not encode poker rules.

## Current layers

### game-engine
Owns:
- `GameState`
- player state and stacks
- legal actions
- hand starts and next-hand rotation
- hand-end settlement
- showdown winner selection
- dealing and street progression
- hand completion

Does not own:
- React
- CSS
- AI analysis
- persistence
- motion/animation

### bots
Owns:
- simple bot action selection
- auto-advance over bot turns

Bots must only choose from legal actions returned by the engine.

### app shell
Owns:
- app bootstrapping
- current-actor lookup
- action dispatch
- bot advancement orchestration
- restart / rebuy button wiring
- table and dashboard composition

This file is still doing some orchestration that would eventually be cleaner in feature-level hooks or components, but it is acceptable for the stabilized MVP as long as behavior stays covered by tests.

### table UI
Owns:
- poker table layout
- player seats
- cards/chips display
- action buttons
- action history
- responsive layout rules

### future analysis / history
Owns:
- serializing current game state
- exporting hand history
- future AI-readable analysis files

## Data flow
UI event -> engine action -> engine returns new `GameState` -> React renders the next state.

## Testing
Engine and bot logic must be unit tested.
State transitions that affect the UI should also have App-level regression coverage.
Layout changes should be verified in the browser, not just by typecheck.
