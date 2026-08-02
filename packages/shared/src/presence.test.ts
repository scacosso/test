import { describe, expect, it } from "vitest";
import { clientEventTypes, presenceSnapshotSchema } from "./index.js";

describe("presence snapshots", () => {
  it("accepts bounded JPEG data URLs from the connected client", () => {
    expect(clientEventTypes).toContain("presence.snapshot");
    expect(presenceSnapshotSchema.parse({
      image: "data:image/jpeg;base64,anBlZw=="
    })).toBeTruthy();
  });

  it("rejects other image types and oversized payloads", () => {
    expect(presenceSnapshotSchema.safeParse({ image: "data:image/png;base64,AAAA" }).success).toBe(false);
    expect(presenceSnapshotSchema.safeParse({
      image: `data:image/jpeg;base64,${"A".repeat(180_001)}`
    }).success).toBe(false);
  });
});
