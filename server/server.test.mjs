// @vitest-environment node

import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createCoachLogStore } from "./logStore.mjs";
import { createCoachServer, handleCoachRequest } from "./index.mjs";
import { buildCoachPrompt } from "./prompt.mjs";
import { createMockCoachResponse } from "./mockCoach.mjs";
import { mockFlopCoachRequest, mockPreflopCoachRequest } from "./fixtures.mjs";

function invokeCoachEndpoint(body) {
  const request = Readable.from([body]);
  const responseState = {
    statusCode: null,
    headers: null,
    body: "",
  };

  const response = {
    writeHead(statusCode, headers) {
      responseState.statusCode = statusCode;
      responseState.headers = headers;
    },
    end(payload) {
      responseState.body = payload ?? "";
    },
  };

  return handleCoachRequest(request, response, { traceEnabled: false }).then(() => {
    const parsedBody = responseState.body ? JSON.parse(responseState.body) : null;

    return {
      statusCode: responseState.statusCode,
      headers: responseState.headers,
      body: parsedBody,
    };
  });
}

function invokeServerRoute(server, method, url, body = "", { parseJson = true } = {}) {
  const request = Readable.from([body]);
  request.method = method;
  request.url = url;
  request.headers = {
    "content-type": "application/json",
  };

  const responseState = {
    statusCode: null,
    headers: null,
    body: "",
  };

  const response = {
    writeHead(statusCode, headers) {
      responseState.statusCode = statusCode;
      responseState.headers = headers;
    },
    end(payload) {
      responseState.body = payload ?? "";
    },
  };

  server.emit("request", request, response);

  return {
    statusCode: responseState.statusCode,
    headers: responseState.headers,
    body: parseJson && responseState.body ? JSON.parse(responseState.body) : responseState.body,
    rawBody: responseState.body,
  };
}

describe("coach prompt builder", () => {
  it("creates a deterministic prompt for a preflop hand", () => {
    const prompt = buildCoachPrompt(mockPreflopCoachRequest);

    expect(prompt).toContain("You are a poker training coach.");
    expect(prompt).toContain("User prompt: What is the best play here?");
    expect(prompt).toContain("Street: preflop");
    expect(prompt).toContain("Hero hole cards: AS, KS");
    expect(prompt).toContain("Legal actions: fold; call $10; raise $30-$120");
  });
});

describe("mock coach adapter", () => {
  it("returns a stable coaching response", () => {
    const response = createMockCoachResponse(mockFlopCoachRequest);

    expect(response).toEqual({
      ok: true,
      sessionId: "session-123",
      text: expect.stringContaining("Recommended action: check."),
      summary: "Mock analysis for hand 13 on flop.",
      recommendedAction: "check",
      confidence: "medium",
    });
  });
});

describe("coach server", () => {
  it("accepts a preflop spot and returns coaching output", async () => {
    const response = await invokeCoachEndpoint(JSON.stringify(mockPreflopCoachRequest));

    expect(response.statusCode).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.summary).toBe("Mock analysis for hand 12 on preflop.");
    expect(response.body.sessionId).toBeNull();
    expect(response.body.text).toContain("Recommended action:");
    expect(response.body.prompt).toContain("Street: preflop");
  });

  it("accepts a flop spot with a session id", async () => {
    const response = await invokeCoachEndpoint(JSON.stringify(mockFlopCoachRequest));

    expect(response.statusCode).toBe(200);
    expect(response.body.sessionId).toBe("session-123");
    expect(response.body.summary).toBe("Mock analysis for hand 13 on flop.");
    expect(response.body.prompt).toContain("Board: QH, 8C, 4D");
  });

  it("rejects invalid JSON", async () => {
    const response = await invokeCoachEndpoint("{");

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({
      ok: false,
      error: "Request body must be valid JSON.",
    });
  });

  it("rejects missing prompt", async () => {
    const invalidRequest = {
      ...mockPreflopCoachRequest,
      prompt: "",
    };

    const response = await invokeCoachEndpoint(JSON.stringify(invalidRequest));

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe("Field `prompt` is required and must be a non-empty string.");
  });

  it("stores logs and serves them through the browser endpoint", async () => {
    const logFile = join(process.cwd(), ".tmp-coach-logs-test.jsonl");
    const logStore = createCoachLogStore({ filePath: logFile, maxEntries: 50 });
    logStore.clear();
    const server = createCoachServer({
      traceEnabled: false,
      logStore,
    });

    await handleCoachRequest(
      Object.assign(Readable.from([JSON.stringify(mockPreflopCoachRequest)]), {
        method: "POST",
        url: "/api/coach",
        headers: {
          "content-type": "application/json",
        },
      }),
      {
        writeHead() {},
        end() {},
      },
      { traceEnabled: false, logStore }
    );

    await handleCoachRequest(
      Object.assign(Readable.from([JSON.stringify(mockFlopCoachRequest)]), {
        method: "POST",
        url: "/api/coach",
        headers: {
          "content-type": "application/json",
        },
      }),
      {
        writeHead() {},
        end() {},
      },
      { traceEnabled: false, logStore }
    );

    const logsPage = invokeServerRoute(server, "GET", "/coach-logs", "", { parseJson: false });
    const logsJson = invokeServerRoute(server, "GET", "/api/coach/logs");

    expect(logsPage.statusCode).toBe(200);
    expect(logsPage.rawBody).toContain("Coach Logs");
    expect(logsPage.rawBody.match(/<summary class="coach-log__summary coach-log__request-summary">/g)?.length).toBe(2);
    expect(logsPage.rawBody.match(/<summary class="coach-log__summary coach-log__step-summary">/g)?.length).toBeGreaterThan(0);
    expect(logsPage.rawBody).toContain("request.start");
    expect(logsPage.rawBody).toContain("response.sent");
    expect(logsJson.statusCode).toBe(200);
    expect(logsJson.body.ok).toBe(true);
    expect(logsJson.body.entries.length).toBeGreaterThan(0);
    expect(logsJson.body.entries.at(-1).step).toBe("response.sent");
  });
});
