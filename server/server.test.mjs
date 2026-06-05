// @vitest-environment node

import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { handleCoachRequest } from "./index.mjs";
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

  return handleCoachRequest(request, response).then(() => {
    const parsedBody = responseState.body ? JSON.parse(responseState.body) : null;

    return {
      statusCode: responseState.statusCode,
      headers: responseState.headers,
      body: parsedBody,
    };
  });
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
});
