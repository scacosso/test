import { describe, expect, it } from "vitest";
import { decodeEvidenceKey } from "./evidence-key.js";

const raw = Buffer.from(Array.from({ length: 32 }, (_, index) => index));

describe("decodeEvidenceKey", () => {
  it("accepts padded and unpadded Base64", () => {
    const padded = raw.toString("base64");
    expect(decodeEvidenceKey(padded)).toEqual(raw);
    expect(decodeEvidenceKey(padded.replace(/=+$/, ""))).toEqual(raw);
  });

  it("accepts unpadded Base64url and hex", () => {
    expect(decodeEvidenceKey(raw.toString("base64url"))).toEqual(raw);
    expect(decodeEvidenceKey(raw.toString("hex"))).toEqual(raw);
  });

  it("rejects placeholders and keys with the wrong decoded size", () => {
    expect(() => decodeEvidenceKey("replace-with-base64-encoded-32-byte-value")).toThrow(
      "EVIDENCE_ENCRYPTION_KEY"
    );
    expect(() => decodeEvidenceKey(Buffer.from("too-short").toString("base64"))).toThrow(
      "exactly 32 bytes"
    );
  });
});
