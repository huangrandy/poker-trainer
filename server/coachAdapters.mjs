import { createMockCoachAdapter } from "./mockCoach.mjs";
import { createCodexCoachAdapter } from "./codexCoach.mjs";
import { createAppServerCoachAdapter } from "./appServerCoach.mjs";

export function normalizeCoachModel(model) {
  if (model === "gpt-5.4-nano") {
    return "gpt-5.4-mini";
  }

  return model;
}

export function createCoachAdapterFromEnv(env = process.env) {
  if ((env.COACH_PROVIDER ?? "mock") === "app-server") {
    const requestedModel = env.COACH_MODEL ?? null;
    const normalizedModel = normalizeCoachModel(requestedModel);
    const reasoningEffort = env.COACH_REASONING_EFFORT ?? "low";

    if (requestedModel === "gpt-5.4-nano" && normalizedModel !== requestedModel) {
      console.warn(
        "[coach] gpt-5.4-nano is not supported on this account; falling back to gpt-5.4-mini."
      );
    }

    return createAppServerCoachAdapter({
      socketPath: env.COACH_APP_SOCKET_PATH ?? undefined,
      cwd: env.COACH_CWD ?? process.cwd(),
      model: normalizedModel,
      reasoningEffort,
      timeoutMs: Number(env.COACH_TIMEOUT_MS ?? "120000"),
    });
  }

  if ((env.COACH_PROVIDER ?? "mock") === "codex") {
    const requestedModel = env.COACH_MODEL ?? null;
    const normalizedModel = normalizeCoachModel(requestedModel);
    const reasoningEffort = env.COACH_REASONING_EFFORT ?? "low";
    const structuredOutput = env.COACH_OUTPUT_MODE !== "plain";

    if (requestedModel === "gpt-5.4-nano" && normalizedModel !== requestedModel) {
      console.warn(
        "[coach] gpt-5.4-nano is not supported on this account; falling back to gpt-5.4-mini."
      );
    }

    return createCodexCoachAdapter({
      cwd: env.COACH_CWD ?? process.cwd(),
      command: env.COACH_COMMAND ?? "codex",
      model: normalizedModel,
      reasoningEffort,
      structuredOutput,
      timeoutMs: Number(env.COACH_TIMEOUT_MS ?? "120000"),
    });
  }

  return createMockCoachAdapter();
}
