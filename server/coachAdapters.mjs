import { createMockCoachAdapter } from "./mockCoach.mjs";
import { createCodexCoachAdapter } from "./codexCoach.mjs";

export function createCoachAdapterFromEnv(env = process.env) {
  if ((env.COACH_PROVIDER ?? "mock") === "codex") {
    return createCodexCoachAdapter({
      cwd: env.COACH_CWD ?? process.cwd(),
      command: env.COACH_COMMAND ?? "codex",
      timeoutMs: Number(env.COACH_TIMEOUT_MS ?? "120000"),
    });
  }

  return createMockCoachAdapter();
}
