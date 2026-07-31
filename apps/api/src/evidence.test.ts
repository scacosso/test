import { createCipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptEvidencePayload } from "./evidence.js";

function sealImage(plaintext: Buffer, key: Buffer, sessionId: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(sessionId));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { nonce, ciphertext, tag };
}

describe("evidence encryption compatibility", () => {
  it("opens the current nonce-tag-ciphertext image format", () => {
    const key = randomBytes(32);
    const sessionId = "8f9bb654-2636-42f1-a36d-8fa29d917404";
    const plaintext = Buffer.from("current capture");
    const sealed = sealImage(plaintext, key, sessionId);
    const body = Buffer.concat([sealed.nonce, sealed.tag, sealed.ciphertext]);

    expect(decryptEvidencePayload(body, key, "image", sessionId)).toEqual(plaintext);
  });

  it("opens legacy Python nonce-ciphertext-tag captures", () => {
    const key = randomBytes(32);
    const sessionId = "845ff2d3-e395-4974-a356-483628f5bd82";
    const plaintext = Buffer.from("legacy capture");
    const sealed = sealImage(plaintext, key, sessionId);
    const body = Buffer.concat([sealed.nonce, sealed.ciphertext, sealed.tag]);

    expect(decryptEvidencePayload(body, key, "image", sessionId)).toEqual(plaintext);
  });
});
