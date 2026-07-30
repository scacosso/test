import { describe, expect, it } from "vitest";
import { isAdultDateOfBirth } from "./auth-policy.js";

describe("adult date-of-birth policy", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");

  it("accepts someone on their eighteenth birthday", () => {
    expect(isAdultDateOfBirth("2008-07-30", now)).toBe(true);
  });

  it("rejects someone one day too young", () => {
    expect(isAdultDateOfBirth("2008-07-31", now)).toBe(false);
  });

  it("rejects malformed and impossible dates", () => {
    expect(isAdultDateOfBirth("2008-02-30", now)).toBe(false);
    expect(isAdultDateOfBirth("not-a-date", now)).toBe(false);
  });
});
