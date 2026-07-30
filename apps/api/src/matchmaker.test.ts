import { describe, expect, it } from "vitest";
import { Matchmaker } from "./matchmaker.js";

const candidate = (userId: string, country = "AR", joinedAt = 0) => ({
  userId,
  socketId: userId,
  language: "es",
  country,
  joinedAt
});

describe("Matchmaker", () => {
  it("atomically prevents double matches", async () => {
    const matcher = new Matchmaker();
    expect(await matcher.join(candidate("a"), 5_000)).toBeNull();
    expect(await matcher.join(candidate("b"), 5_000)).not.toBeNull();
    expect(await matcher.join(candidate("c"), 5_000)).toBeNull();
    expect(await matcher.join(candidate("a"), 5_000)).toBeNull();
  });

  it("excludes blocked and sanctioned users", async () => {
    const matcher = new Matchmaker(
      (left, right) => [left, right].includes("blocked"),
      (userId) => userId === "suspended"
    );
    await matcher.join(candidate("blocked"), 31_000);
    expect(await matcher.join(candidate("safe"), 31_000)).toBeNull();
    expect(await matcher.join(candidate("suspended"), 31_000)).toBeNull();
  });
});
