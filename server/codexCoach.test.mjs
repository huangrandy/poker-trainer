// @vitest-environment node

import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createCodexCoachAdapter } from "./codexCoach.mjs";
import { mockPreflopCoachRequest } from "./fixtures.mjs";
import { buildCoachPrompt } from "./prompt.mjs";

function createFakeChild() {
  const child = new EventEmitter();

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    end(value) {
      child.prompt = value;
    },
  };
  child.stdout.setEncoding = () => {};
  child.stderr.setEncoding = () => {};
  child.kill = () => {};

  return child;
}

describe("codex coach adapter", () => {
  it("spawns codex exec with the coach prompt and parses the output file", async () => {
    const child = createFakeChild();
    const spawnCalls = [];
    const adapter = createCodexCoachAdapter({
      command: "codex",
      cwd: "/workdir",
      timeoutMs: 1000,
      spawnImpl: (command, args, options) => {
        spawnCalls.push({ command, args, options });
        queueMicrotask(() => {
          child.emit("close", 0);
        });

        return child;
      },
      mkdtempImpl: async () => "/tmp/poker-coach-test",
      readFileImpl: async () =>
        JSON.stringify({
          text: "Check back and realize equity.",
          summary: "Mocked Codex summary.",
          recommendedAction: "check",
          confidence: "high",
        }),
      rmImpl: async () => {},
      tmpdirImpl: () => "/tmp",
    });

    const response = await adapter(mockPreflopCoachRequest, buildCoachPrompt(mockPreflopCoachRequest));

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].command).toBe("codex");
    expect(spawnCalls[0].args).toContain("exec");
    expect(spawnCalls[0].args).toContain("--output-schema");
    expect(spawnCalls[0].args).toContain("--output-last-message");
    expect(spawnCalls[0].options.cwd).toBe("/workdir");
    expect(child.prompt).toContain("Return only valid JSON");
    expect(response).toEqual({
      ok: true,
      sessionId: null,
      text: "Check back and realize equity.",
      summary: "Mocked Codex summary.",
      recommendedAction: "check",
      confidence: "high",
    });
  });
});

