// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createAppServerCoachAdapter } from "./appServerCoach.mjs";
import { mockPreflopCoachRequest } from "./fixtures.mjs";
import { buildCoachPrompt } from "./prompt.mjs";

function createFakeClient() {
  const listeners = new Set();
  const requests = [];
  let turnCount = 0;

  return {
    requests,
    async connect() {},
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async request(method, params) {
      requests.push({ method, params });

      if (method === "initialize") {
        return { ok: true };
      }

      if (method === "thread/start") {
        return {
          thread: { id: "thread-1" },
        };
      }

      if (method === "turn/start") {
        turnCount += 1;
        const turnId = `turn-${turnCount}`;
        queueMicrotask(() => {
          const payload = JSON.stringify(
            turnCount === 1
              ? {
                  text: "Check back and realize equity.",
                  summary: "Mocked app-server summary 1.",
                  recommendedAction: "check",
                  confidence: "high",
                }
              : {
                  text: "Fire the turn barrel.",
                  summary: "Mocked app-server summary 2.",
                  recommendedAction: "bet",
                  confidence: "medium",
                }
          );

          for (const listener of listeners) {
            listener({
              method: "item/completed",
              params: {
                turnId,
                turn: { id: turnId },
                item: {
                  type: "agentMessage",
                  phase: "final_answer",
                  text: payload,
                },
              },
            });

            listener({
              method: "turn/completed",
              params: {
                turnId,
                turn: { id: turnId },
              },
            });
          }
        });

        return {
          turn: { id: turnId },
        };
      }

      throw new Error(`Unexpected request: ${method}`);
    },
    close() {},
  };
}

describe("app server coach adapter", () => {
  it("starts a thread, then resumes it on the next request", async () => {
    const client = createFakeClient();
    const adapter = createAppServerCoachAdapter({
      socketPath: "/tmp/app-server.sock",
      model: "gpt-5.4-mini",
      reasoningEffort: "low",
      cwd: "/workdir",
      timeoutMs: 1000,
      clientFactory: () => client,
    });

    const firstResponse = await adapter(
      mockPreflopCoachRequest,
      buildCoachPrompt(mockPreflopCoachRequest)
    );
    const secondResponse = await adapter(
      mockPreflopCoachRequest,
      buildCoachPrompt(mockPreflopCoachRequest)
    );

    expect(client.requests.map((request) => request.method)).toEqual([
      "initialize",
      "thread/start",
      "turn/start",
      "turn/start",
    ]);
    expect(client.requests[1].params.sandbox).toBe("read-only");
    expect(client.requests[2].params.outputSchema).toBeTypeOf("object");
    expect(client.requests[2].params.effort).toBe("low");
    expect(firstResponse).toEqual({
      ok: true,
      sessionId: "thread-1",
      text: "Check back and realize equity.",
      summary: "Mocked app-server summary 1.",
      recommendedAction: "check",
      confidence: "high",
    });
    expect(secondResponse).toEqual({
      ok: true,
      sessionId: "thread-1",
      text: "Fire the turn barrel.",
      summary: "Mocked app-server summary 2.",
      recommendedAction: "bet",
      confidence: "medium",
    });
  });
});
