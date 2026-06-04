import { describe, expect, it } from "vitest";
import { sampleGameState } from "./fixtures";
import { LEGAL_ACTION_TYPES, PLAYER_ACTION_TYPES, RANKS, STREETS, SUITS } from "./schema";

describe("game-engine foundation", () => {
  it("exposes the expected card and action schemas", () => {
    expect(SUITS).toHaveLength(4);
    expect(RANKS).toHaveLength(13);
    expect(STREETS).toContain("hand_complete");
    expect(LEGAL_ACTION_TYPES).toContain("all_in");
    expect(PLAYER_ACTION_TYPES).toContain("deal_next_street");
  });

  it("produces a JSON-serializable sample game state", () => {
    const roundTripped = JSON.parse(JSON.stringify(sampleGameState));

    expect(roundTripped).toEqual(sampleGameState);
  });
});
