import { describe, expect, it } from "vitest";
import { candidateMatches, matchingStage, type QueueCandidate } from "./index.js";

const base: QueueCandidate = {
  userId: "one",
  socketId: "a",
  language: "es",
  country: "AR",
  joinedAt: 1_000
};

describe("matching policy", () => {
  it("starts exact, then relaxes country", () => {
    expect(candidateMatches(base, { ...base, userId: "two" }, 5_000, () => false)).toBe(true);
    expect(candidateMatches(base, { ...base, userId: "two", country: "UY" }, 5_000, () => false)).toBe(false);
    expect(candidateMatches(base, { ...base, userId: "two", country: "UY" }, 11_001, () => false)).toBe(true);
  });

  it("preserves language and excludes self or blocked peers", () => {
    expect(candidateMatches(base, { ...base, userId: "two", language: "en" }, 31_001, () => false)).toBe(false);
    expect(candidateMatches(base, base, 31_001, () => false)).toBe(false);
    expect(candidateMatches(base, { ...base, userId: "two" }, 31_001, () => true)).toBe(false);
  });

  it("reports all search stages", () => {
    expect(matchingStage(1_000, 10_999)).toBe("country-language");
    expect(matchingStage(1_000, 11_000)).toBe("language-nearby");
    expect(matchingStage(1_000, 31_000)).toBe("language-global");
  });
});
