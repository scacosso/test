const KEY_ERROR =
  "EVIDENCE_ENCRYPTION_KEY must be a 32-byte key encoded as Base64, Base64url, or 64 hex characters.";

export function decodeEvidenceKey(value: string) {
  const encoded = value.trim();
  let key: Buffer;

  if (/^[0-9a-f]{64}$/i.test(encoded)) {
    key = Buffer.from(encoded, "hex");
  } else {
    const unpadded = encoded.replace(/=+$/, "");
    if (!unpadded || unpadded.length % 4 === 1 || !/^[a-z0-9+/_-]+$/i.test(unpadded)) {
      throw new Error(KEY_ERROR);
    }
    const normalized = unpadded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    key = Buffer.from(padded, "base64");
  }

  if (key.length !== 32) {
    throw new Error(
      "EVIDENCE_ENCRYPTION_KEY must decode to exactly 32 bytes; generate it with npm run easypanel:env."
    );
  }
  return key;
}
