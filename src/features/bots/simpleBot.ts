import { applyAction, getLegalActions } from "../game-engine/engine";
import type { GameState, LegalAction, PlayerAction, PlayerState } from "../game-engine/types";
import { chooseBotActionProfiled } from "./personas";

function getCurrentActor(state: GameState): PlayerState | undefined {
  if (state.betting.currentActorSeatIndex === null) {
    return undefined;
  }

  return state.players.find((player) => player.seatIndex === state.betting.currentActorSeatIndex);
}

function pickActionByType(legalActions: LegalAction[], type: LegalAction["type"]): PlayerAction | null {
  const action = legalActions.find((candidate) => candidate.type === type);

  if (!action) {
    return null;
  }

  if (type === "bet" || type === "raise") {
    return {
      type,
      playerId: null,
      amount: action.minAmount ?? action.maxAmount ?? 0,
    };
  }

  return {
    type,
    playerId: null,
  };
}

export function chooseSimpleBotAction(legalActions: LegalAction[]): PlayerAction | null {
  const preferredTypes: Array<LegalAction["type"]> = [
    "check",
    "call",
    "bet",
    "raise",
    "all_in",
    "fold",
  ];

  for (const type of preferredTypes) {
    const action = pickActionByType(legalActions, type);

    if (action) {
      return action;
    }
  }

  return null;
}

export function chooseBotActionForPlayer(
  state: GameState,
  player: PlayerState,
  legalActions: LegalAction[]
): PlayerAction | null {
  return chooseBotActionProfiled(state, player, legalActions) ?? chooseSimpleBotAction(legalActions);
}

type AdvanceBotTurnsOptions = {
  maxSteps?: number;
};

export function advanceBotTurns(
  state: GameState,
  options: AdvanceBotTurnsOptions = {}
): GameState {
  const maxSteps = options.maxSteps ?? 100;
  let nextState = state;

  for (let step = 0; step < maxSteps; step += 1) {
    const currentActor = getCurrentActor(nextState);

    if (!currentActor || !currentActor.isBot || nextState.street === "hand_complete") {
      return nextState;
    }

    const legalActions = getLegalActions(nextState, currentActor.id);
    const chosenAction = chooseBotActionForPlayer(nextState, currentActor, legalActions);

    if (!chosenAction) {
      return nextState;
    }

    nextState = applyAction(nextState, {
      ...chosenAction,
      playerId: currentActor.id,
    });
  }

  return nextState;
}
