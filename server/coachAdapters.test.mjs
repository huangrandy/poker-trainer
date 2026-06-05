// @vitest-environment node

import { describe, expect, it } from "vitest";
import { normalizeCoachModel } from "./coachAdapters.mjs";

describe("coach adapter model selection", () => {
  it("falls back from unsupported nano to mini", () => {
    expect(normalizeCoachModel("gpt-5.4-nano")).toBe("gpt-5.4-mini");
  });

  it("preserves supported models", () => {
    expect(normalizeCoachModel("gpt-5.4-mini")).toBe("gpt-5.4-mini");
    expect(normalizeCoachModel(null)).toBe(null);
  });
});

