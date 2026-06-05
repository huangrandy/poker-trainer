import http from "node:http";
import { buildCoachPrompt } from "./prompt.mjs";
import { createMockCoachResponse } from "./mockCoach.mjs";
import { mockFlopCoachRequest, mockPreflopCoachRequest } from "./fixtures.mjs";

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value) {
  return typeof value === "string";
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isCard(value) {
  return isPlainObject(value) && isString(value.rank) && isString(value.suit);
}

function isLegalAction(value) {
  return (
    isPlainObject(value) &&
    isString(value.type) &&
    ["fold", "check", "call", "bet", "raise", "all_in"].includes(value.type) &&
    (value.callAmount === undefined || isNumber(value.callAmount)) &&
    (value.minAmount === undefined || isNumber(value.minAmount)) &&
    (value.maxAmount === undefined || isNumber(value.maxAmount))
  );
}

function isActionRecord(value) {
  return (
    isPlainObject(value) &&
    isString(value.id) &&
    isString(value.type) &&
    (isString(value.playerId) || value.playerId === null) &&
    isString(value.street) &&
    isNumber(value.handNumber) &&
    (value.amount === undefined || isNumber(value.amount)) &&
    isNumber(value.timestampMs)
  );
}

function isPlayer(value) {
  return (
    isPlainObject(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNumber(value.seatIndex) &&
    typeof value.isHero === "boolean" &&
    isNumber(value.stack) &&
    isNumber(value.currentStreetBet) &&
    isNumber(value.totalCommittedThisHand) &&
    isString(value.status) &&
    Array.isArray(value.holeCards) &&
    value.holeCards.every(isCard)
  );
}

function isSnapshot(value) {
  return (
    isPlainObject(value) &&
    isNumber(value.handNumber) &&
    isString(value.street) &&
    (isString(value.heroPlayerId) || value.heroPlayerId === null) &&
    Array.isArray(value.legalActions) &&
    value.legalActions.every(isLegalAction) &&
    isPlainObject(value.gameState) &&
    Array.isArray(value.gameState.board) &&
    value.gameState.board.every(isCard) &&
    Array.isArray(value.gameState.players) &&
    value.gameState.players.every(isPlayer) &&
    isPlainObject(value.gameState.pot) &&
    isNumber(value.gameState.pot.mainPot) &&
    Array.isArray(value.gameState.pot.sidePots) &&
    isPlainObject(value.gameState.betting) &&
    isNumber(value.gameState.betting.currentBet) &&
    isNumber(value.gameState.betting.minRaiseTo) &&
    (value.gameState.betting.lastAggressorSeatIndex === null || isNumber(value.gameState.betting.lastAggressorSeatIndex)) &&
    (value.gameState.betting.currentActorSeatIndex === null || isNumber(value.gameState.betting.currentActorSeatIndex)) &&
    Array.isArray(value.gameState.actionHistory) &&
    value.gameState.actionHistory.every(isActionRecord)
  );
}

function validateCoachRequest(value) {
  if (!isPlainObject(value)) {
    return "Request body must be a JSON object.";
  }

  if (!isString(value.prompt) || value.prompt.trim().length === 0) {
    return "Field `prompt` is required and must be a non-empty string.";
  }

  if (!isSnapshot(value.snapshot)) {
    return "Field `snapshot` is required and must match the coach snapshot shape.";
  }

  if (!(value.sessionId === undefined || value.sessionId === null || isString(value.sessionId))) {
    return "Field `sessionId` must be a string or null.";
  }

  return null;
}

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  let raw = "";

  for await (const chunk of req) {
    raw += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  }

  if (raw.length === 0) {
    return null;
  }

  return JSON.parse(raw);
}

export async function handleCoachRequest(req, res) {
  let body;

  try {
    body = await readJsonBody(req);
  } catch {
    jsonResponse(res, 400, {
      ok: false,
      error: "Request body must be valid JSON.",
    });
    return;
  }

  const validationError = validateCoachRequest(body);

  if (validationError) {
    jsonResponse(res, 400, {
      ok: false,
      error: validationError,
    });
    return;
  }

  const prompt = buildCoachPrompt(body);
  const response = createMockCoachResponse(body);

  jsonResponse(res, 200, {
    ...response,
    prompt,
  });
}

export function createCoachServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/healthz") {
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/coach") {
      void handleCoachRequest(req, res);
      return;
    }

    jsonResponse(res, 404, {
      ok: false,
      error: "Not found.",
    });
  });
}

export async function startCoachServer({ port = 8787 } = {}) {
  const server = createCoachServer();

  await new Promise((resolve) => {
    server.listen(port, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Unable to determine server address.");
  }

  return {
    server,
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? "8787");
  const { port: actualPort } = await startCoachServer({ port });

  console.log(`Coach server listening on http://127.0.0.1:${actualPort}`);
}
