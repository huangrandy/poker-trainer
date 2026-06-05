import http from "node:http";
import { randomUUID } from "node:crypto";
import { createCoachLogStore } from "./logStore.mjs";
import { buildCoachPrompt } from "./prompt.mjs";
import { createCoachAdapterFromEnv } from "./coachAdapters.mjs";
import { createCoachTracer } from "./trace.mjs";

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

function htmlResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
  });
  res.end(body);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLogPage(entries, filePath) {
  const rows = entries
    .map((entry) => {
      const details = entry.details === null || entry.details === undefined
        ? ""
        : `<pre class="coach-log__details">${escapeHtml(
            typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details, null, 2)
          )}</pre>`;

      return `
        <article class="coach-log__entry coach-log__entry--${escapeHtml(entry.level.toLowerCase())}">
          <header class="coach-log__meta">
            <span class="coach-log__timestamp">${escapeHtml(entry.timestamp)}</span>
            <span class="coach-log__step">${escapeHtml(entry.step)}</span>
            <span class="coach-log__elapsed">+${escapeHtml(entry.elapsedMs)}ms</span>
            <span class="coach-log__level">${escapeHtml(entry.level)}</span>
          </header>
          ${details}
        </article>
      `;
    })
    .join("\n");

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Coach Logs</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #0a0f14;
          --panel: #101821;
          --panel-border: #233041;
          --text: #e6edf3;
          --muted: #90a4b8;
          --accent: #6ee7b7;
          --warn: #fbbf24;
          --error: #f87171;
        }
        body {
          margin: 0;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          background: radial-gradient(circle at top, #132131, var(--bg) 55%);
          color: var(--text);
        }
        .coach-log {
          max-width: 1100px;
          margin: 0 auto;
          padding: 24px;
        }
        .coach-log__header {
          display: grid;
          gap: 8px;
          margin-bottom: 20px;
          padding: 18px 20px;
          border: 1px solid var(--panel-border);
          border-radius: 16px;
          background: rgba(16, 24, 33, 0.88);
        }
        .coach-log__header h1 {
          margin: 0;
          font-size: 20px;
        }
        .coach-log__header p,
        .coach-log__header code {
          margin: 0;
          color: var(--muted);
          font-size: 13px;
        }
        .coach-log__entry {
          margin-bottom: 14px;
          padding: 16px 18px;
          border: 1px solid var(--panel-border);
          border-radius: 14px;
          background: rgba(16, 24, 33, 0.92);
        }
        .coach-log__entry--warn {
          border-color: rgba(251, 191, 36, 0.35);
        }
        .coach-log__entry--error {
          border-color: rgba(248, 113, 113, 0.35);
        }
        .coach-log__meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 14px;
          color: var(--muted);
          font-size: 12px;
          margin-bottom: 10px;
        }
        .coach-log__step {
          color: var(--accent);
        }
        .coach-log__level {
          color: var(--warn);
        }
        .coach-log__details {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--text);
          font-size: 13px;
          line-height: 1.5;
        }
      </style>
    </head>
    <body>
      <main class="coach-log">
        <header class="coach-log__header">
          <h1>Coach Logs</h1>
          <p>Recent persisted trace entries from the local coach server.</p>
          <p><code>${escapeHtml(filePath)}</code></p>
        </header>
        ${rows || "<p>No coach logs yet.</p>"}
      </main>
    </body>
  </html>`;
}

async function readRawBody(req) {
  let raw = "";

  for await (const chunk of req) {
    raw += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  }

  return raw;
}

export async function handleCoachRequest(
  req,
  res,
  {
    coachAdapter = createCoachAdapterFromEnv(),
    traceEnabled = process.env.COACH_TRACE !== "0",
    logStore = createCoachLogStore({ filePath: process.env.COACH_LOG_FILE }),
  } = {}
) {
  const tracer = createCoachTracer({
    enabled: traceEnabled,
    requestId: randomUUID(),
    sink: (entry) => {
      logStore.append(entry);
    },
  });

  try {
    tracer.info("request.start", {
      method: req.method,
      url: req.url,
      headers: req.headers,
    });

    const rawBody = await readRawBody(req);
    tracer.info("request.body.raw", rawBody);

    if (rawBody.length === 0) {
      throw new Error("Request body must be valid JSON.");
    }

    const body = JSON.parse(rawBody);
    tracer.info("request.body.parsed", body);

    const validationError = validateCoachRequest(body);

    if (validationError) {
      tracer.warn("request.validation.failed", {
        validationError,
      });
      jsonResponse(res, 400, {
        ok: false,
        error: validationError,
      });
      return;
    }

    tracer.info("request.validated", {
      handNumber: body.snapshot.handNumber,
      street: body.snapshot.street,
      sessionId: body.sessionId ?? null,
    });

    const prompt = buildCoachPrompt(body);
    tracer.info("prompt.built", {
      prompt,
    });

    tracer.info("adapter.dispatch", {
      provider: process.env.COACH_PROVIDER ?? "mock",
    });

    const response = await coachAdapter(body, prompt, { trace: tracer });

    tracer.info("response.ready", response);

    jsonResponse(res, 200, {
      ...response,
      prompt,
    });
    tracer.info("response.sent", {
      statusCode: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tracer.warn("request.failed", {
      message,
    });

    jsonResponse(res, 400, {
      ok: false,
      error: error instanceof SyntaxError ? "Request body must be valid JSON." : message,
    });
  }
}

export function createCoachServer({
  coachAdapter = createCoachAdapterFromEnv(),
  traceEnabled = process.env.COACH_TRACE !== "0",
  logStore = createCoachLogStore({ filePath: process.env.COACH_LOG_FILE }),
} = {}) {

  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/healthz") {
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/coach-logs") {
      htmlResponse(res, 200, renderLogPage(logStore.list(), logStore.filePath));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/coach/logs") {
      jsonResponse(res, 200, {
        ok: true,
        filePath: logStore.filePath,
        entries: logStore.list(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/coach") {
      void handleCoachRequest(req, res, { coachAdapter, traceEnabled, logStore });
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
