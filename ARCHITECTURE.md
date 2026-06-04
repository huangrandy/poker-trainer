# Architecture

## Core principle
The poker engine is pure TypeScript and independent from the UI.

React components should render state and dispatch actions. They should not contain poker rules.

## Layers

### game-engine
Owns:
- GameState
- PlayerState
- Legal actions
- Street transitions
- Pot/stacks/bets
- Dealing
- Hand completion

Does not own:
- React
- CSS
- Animations
- AI analysis
- Persistence

### bots
Owns:
- Simple bot action selection
- Bot personas later

Bots may only choose from legal actions returned by the engine.

### table-ui
Owns:
- Poker table layout
- Player seats
- Cards/chips display
- Action buttons

### hand-history
Owns:
- Serializing current game state
- Exporting hand history
- Future AI-readable state files

## Data flow
UI event -> dispatch engine action -> engine returns new GameState -> UI renders new state.

## Testing
Engine and bot logic must be unit tested.
UI can be manually verified at first.