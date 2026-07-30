import { describe, expect, it } from "vitest";
import { copy } from "./App";

function keys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => keys(item, `${prefix}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

describe("translations", () => {
  it("keeps Spanish and English structurally complete", () => {
    expect(keys(copy.es)).toEqual(keys(copy.en));
  });
});
