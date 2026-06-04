# System Patterns

## Poker engine
Use a reducer/state-machine style.

Every game action should be explicit:
- START_HAND
- FOLD
- CHECK
- CALL
- BET
- RAISE
- DEAL_NEXT_STREET
- SHOWDOWN

Avoid mutating GameState directly unless using a clear internal helper.

## Legal actions
The UI and bots must ask the engine for legal actions.
Do not duplicate legality logic in React components.

## Bots
Bots receive GameState and legal actions.
Bots return one legal action.

## Future AI analysis
GameState should be serializable to JSON.
Avoid functions, classes, Maps, Sets, or circular references inside persisted GameState.