import { describe, expect, it } from "vitest";
import { reportSchema } from "./index.js";

describe("report schema", () => {
  it("accepts Better Auth user identifiers that are not UUIDs", () => {
    const result = reportSchema.safeParse({
      sessionId: "48a925c7-7a1f-49ca-85f0-6f25674e1f98",
      reportedUserId: "Uv2uJwgkxV6rSl1pP8JcmHc1Kh0Tm1MX",
      reason: "spam"
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty and oversized user identifiers", () => {
    const input = {
      sessionId: "48a925c7-7a1f-49ca-85f0-6f25674e1f98",
      reason: "spam"
    };

    expect(reportSchema.safeParse({ ...input, reportedUserId: "" }).success).toBe(false);
    expect(reportSchema.safeParse({ ...input, reportedUserId: "x".repeat(129) }).success).toBe(false);
  });
});
