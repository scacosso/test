import { describe, expect, it } from "vitest";
import { isExpired } from "./retention.js";

describe("evidence retention", () => {
  it("expires evidence at the boundary", () => {
    const now = new Date("2026-07-29T12:00:00Z");
    expect(isExpired(new Date("2026-07-29T12:00:00Z"), now)).toBe(true);
    expect(isExpired(new Date("2026-07-29T12:00:01Z"), now)).toBe(false);
  });
});
