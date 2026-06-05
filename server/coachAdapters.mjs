import { createMockCoachAdapter } from "./mockCoach.mjs";
import { createCodexCoachAdapter } from "./codexCoach.mjs";

export function normalizeCoachModel(model) {
  if (model === "gpt-5.4-nano") {
    return "gpt-5.4-mini";
  }

  return model;
}

export function createCoachAdapterFromEnv(env = process.env) {
  if ((env.COACH_PROVIDER ?? "mock") === "codex") {
    const requestedModel = env.COACH_MODEL ?? null;
    const normalizedModel = normalizeCoachModel(requestedModel);

    if (requestedModel === "gpt-5.4-nano" && normalizedModel !== requestedModel) {
      console.warn(
        "[coach] gpt-5.4-nano is not supported on this account; falling back to gpt-5.4-mini."
      );
    }

    return createCodexCoachAdapter({
      cwd: env.COACH_CWD ?? process.cwd(),
      command: env.COACH_COMMAND ?? "codex",
      model: normalizedModel,
      timeoutMs: Number(env.COACH_TIMEOUT_MS ?? "120000"),
    });
  }

  return createMockCoachAdapter();
}
