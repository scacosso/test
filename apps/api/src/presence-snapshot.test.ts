import { describe, expect, it } from "vitest";
import { decodePresenceSnapshot, MAX_PRESENCE_SNAPSHOT_BYTES } from "./presence-snapshot.js";

describe("presence snapshot decoding", () => {
  it("keeps a validated JPEG in volatile memory metadata", () => {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01]);
    const capturedAt = new Date("2026-08-02T20:00:00.000Z");
    expect(decodePresenceSnapshot(`data:image/jpeg;base64,${image.toString("base64")}`, capturedAt)).toEqual({
      image,
      capturedAt: capturedAt.toISOString()
    });
  });

  it("rejects malformed and oversized images", () => {
    expect(() => decodePresenceSnapshot("data:image/png;base64,AAAA")).toThrow();
    const oversized = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(MAX_PRESENCE_SNAPSHOT_BYTES)
    ]);
    expect(() => decodePresenceSnapshot(`data:image/jpeg;base64,${oversized.toString("base64")}`)).toThrow();
  });
});
