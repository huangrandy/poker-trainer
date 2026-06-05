function formatCard(card) {
  return `${card.rank}${card.suit[0].toUpperCase()}`;
}

function formatLegalAction(action) {
  if (action.type === "call" && typeof action.callAmount === "number") {
    return `call $${action.callAmount}`;
  }

  if ((action.type === "bet" || action.type === "raise") && typeof action.minAmount === "number") {
    const maxAmount = typeof action.maxAmount === "number" ? `-$${action.maxAmount}` : "";

    return `${action.type} $${action.minAmount}${maxAmount}`;
  }

  if (action.type === "all_in" && typeof action.maxAmount === "number") {
    return `all in $${action.maxAmount}`;
  }

  return action.type;
}

function formatAction(record) {
  if (record.playerId === null) {
    return `${record.type}`;
  }

  if (record.type === "call" && typeof record.amount === "number") {
    return `${record.playerId} called $${record.amount}`;
  }

  if ((record.type === "bet" || record.type === "raise") && typeof record.amount === "number") {
    return `${record.playerId} ${record.type} to $${record.amount}`;
  }

  if (record.type === "check") {
    return `${record.playerId} checked`;
  }

  if (record.type === "fold") {
    return `${record.playerId} folded`;
  }

  if (record.type === "all_in" && typeof record.amount === "number") {
    return `${record.playerId} went all in for $${record.amount}`;
  }

  return `${record.playerId} ${record.type}`;
}

export function buildCoachPrompt(request) {
  const { prompt, snapshot } = request;
  const hero = snapshot.gameState.players.find((player) => player.id === snapshot.heroPlayerId) ?? null;
  const board = snapshot.gameState.board.length > 0
    ? snapshot.gameState.board.map(formatCard).join(", ")
    : "none";
  const heroCards = hero && hero.holeCards.length > 0
    ? hero.holeCards.map(formatCard).join(", ")
    : "unknown";
  const legalActions = snapshot.legalActions.map(formatLegalAction).join("; ");
  const recentActions = snapshot.gameState.actionHistory
    .map(formatAction)
    .join(" | ");

  return [
    "You are a poker training coach.",
    "Give theory-aligned advice, but do not claim exact solver output.",
    "Be concise, useful, and explicit about assumptions.",
    "",
    `User prompt: ${prompt}`,
    `Hand #: ${snapshot.handNumber}`,
    `Street: ${snapshot.street}`,
    `Hero: ${hero?.name ?? "unknown"}`,
    `Hero stack: ${hero?.stack ?? "unknown"}`,
    `Hero hole cards: ${heroCards}`,
    `Board: ${board}`,
    `Pot: $${snapshot.gameState.pot.mainPot}`,
    `Current bet: $${snapshot.gameState.betting.currentBet}`,
    `Min raise to: $${snapshot.gameState.betting.minRaiseTo}`,
    `Current actor seat: ${snapshot.gameState.betting.currentActorSeatIndex ?? "none"}`,
    `Legal actions: ${legalActions || "none"}`,
    `Recent actions: ${recentActions || "none"}`,
  ].join("\n");
}

