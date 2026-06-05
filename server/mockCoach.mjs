function chooseRecommendedAction(legalActions) {
  const preferredOrder = ["check", "call", "raise", "bet", "all_in", "fold"];

  for (const type of preferredOrder) {
    const match = legalActions.find((action) => action.type === type);

    if (match) {
      return match;
    }
  }

  return legalActions[0] ?? null;
}

function describeAction(action) {
  if (!action) {
    return "No legal action was provided.";
  }

  if (action.type === "check") {
    return "check";
  }

  if (action.type === "fold") {
    return "fold";
  }

  if (action.type === "call" && typeof action.callAmount === "number") {
    return `call $${action.callAmount}`;
  }

  if ((action.type === "bet" || action.type === "raise") && typeof action.minAmount === "number") {
    return `${action.type} to $${action.minAmount}`;
  }

  if (action.type === "all_in" && typeof action.maxAmount === "number") {
    return `all in for $${action.maxAmount}`;
  }

  return action.type;
}

export function createMockCoachResponse(request) {
  const recommendedAction = chooseRecommendedAction(request.snapshot.legalActions);
  const recommendedActionText = describeAction(recommendedAction);
  const boardText = request.snapshot.gameState.board.length > 0
    ? request.snapshot.gameState.board.map((card) => `${card.rank}${card.suit[0].toUpperCase()}`).join(", ")
    : "no board cards yet";
  const hero = request.snapshot.gameState.players.find((player) => player.id === request.snapshot.heroPlayerId) ?? null;
  const heroCards = hero && hero.holeCards.length > 0
    ? hero.holeCards.map((card) => `${card.rank}${card.suit[0].toUpperCase()}`).join(", ")
    : "unknown";

  return {
    ok: true,
    sessionId: request.sessionId ?? null,
    text: [
      `Recommended action: ${recommendedActionText}.`,
      `Street: ${request.snapshot.street}.`,
      `Hero cards: ${heroCards}.`,
      `Board: ${boardText}.`,
      "This is a mock coaching response that proves the bridge contract before Codex is wired in.",
    ].join(" "),
    summary: `Mock analysis for hand ${request.snapshot.handNumber} on ${request.snapshot.street}.`,
    recommendedAction: recommendedAction ? recommendedActionText : null,
    confidence: "medium",
  };
}

export function createMockCoachAdapter() {
  return async (request, prompt) => {
    return {
      ...createMockCoachResponse(request),
      prompt,
    };
  };
}
