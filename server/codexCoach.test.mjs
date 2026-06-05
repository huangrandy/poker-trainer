// @vitest-environment node

import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createCodexCoachAdapter } from "./codexCoach.mjs";
import { mockPreflopCoachRequest } from "./fixtures.mjs";
import { buildCoachPrompt } from "./prompt.mjs";

function createFakeStream() {
  const listeners = new Set();

  return {
    setEncoding() {},
    on(event, listener) {
      if (event === "data") {
        listeners.add(listener);
      }
    },
    emitData(chunk) {
      for (const listener of listeners) {
        listener(chunk);
      }
    },
  };
}

function createFakeChild() {
  const child = new EventEmitter();

  child.stdout = createFakeStream();
  child.stderr = createFakeStream();
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
      model: "gpt-5.4-nano",
      reasoningEffort: "low",
      cwd: "/workdir",
      timeoutMs: 1000,
      spawnImpl: (command, args, options) => {
        spawnCalls.push({ command, args, options });
        setImmediate(() => {
          child.stdout.emitData("Check back and realize equity.\n");
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
    expect(spawnCalls[0].args).toContain("-c");
    expect(spawnCalls[0].args).toContain("model_reasoning_effort=low");
    expect(spawnCalls[0].args).toContain("-m");
    expect(spawnCalls[0].args).toContain("gpt-5.4-nano");
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

  it("can run in plain-text mode without output schema", async () => {
    const child = createFakeChild();
    const spawnCalls = [];
    const adapter = createCodexCoachAdapter({
      command: "codex",
      model: "gpt-5.4-mini",
      reasoningEffort: "low",
      structuredOutput: false,
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
      readFileImpl: async () => "Check back and realize equity.\n",
      rmImpl: async () => {},
      tmpdirImpl: () => "/tmp",
    });

    const response = await adapter(mockPreflopCoachRequest, buildCoachPrompt(mockPreflopCoachRequest));

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].args).toContain("-c");
    expect(spawnCalls[0].args).toContain("model_reasoning_effort=low");
    expect(spawnCalls[0].args).toContain("-m");
    expect(spawnCalls[0].args).toContain("gpt-5.4-mini");
    expect(spawnCalls[0].args).toContain("exec");
    expect(spawnCalls[0].args).not.toContain("--output-schema");
    expect(spawnCalls[0].args).toContain("--output-last-message");
    expect(child.prompt).toContain("Return a concise plain-text answer.");
    expect(response).toEqual({
      ok: true,
      sessionId: null,
      text: "Check back and realize equity.",
      summary: "Check back and realize equity.",
      recommendedAction: null,
      confidence: null,
    });
  });
});
