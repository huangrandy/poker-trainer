// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createCoachAdapterFromEnv, normalizeCoachModel } from "./coachAdapters.mjs";

describe("coach adapter model selection", () => {
  it("falls back from unsupported nano to mini", () => {
    expect(normalizeCoachModel("gpt-5.4-nano")).toBe("gpt-5.4-mini");
  });

  it("preserves supported models", () => {
    expect(normalizeCoachModel("gpt-5.4-mini")).toBe("gpt-5.4-mini");
    expect(normalizeCoachModel(null)).toBe(null);
  });

  it("defaults codex reasoning effort to low", () => {
    const adapter = createCoachAdapterFromEnv({
      COACH_PROVIDER: "codex",
      COACH_MODEL: "gpt-5.4-mini",
    });

    expect(typeof adapter).toBe("function");
  });
});
