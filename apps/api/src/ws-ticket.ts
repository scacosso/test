import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

type WsTicketPayload = {
  sub: string;
  exp: number;
  nonce: string;
};

const usedNonces = new Map<string, number>();

const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

export function createWsTicket(
  userId: string,
  secret: string,
  now = Date.now(),
  ttlMs = 30_000
) {
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: now + ttlMs,
    nonce: randomUUID()
  } satisfies WsTicketPayload)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function websocketTicketFromProtocols(
  header: string | string[] | undefined,
  fallback?: string
) {
  const protocols = (Array.isArray(header) ? header.join(",") : header ?? "")
    .split(",")
    .map((protocol) => protocol.trim());
  return protocols[0] === "nexocam-v1" && protocols[1]
    ? protocols[1]
    : fallback;
}

export function consumeWsTicket(ticket: string, secret: string, now = Date.now()) {
  const [payload, suppliedSignature, extra] = ticket.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expectedSignature = Buffer.from(sign(payload, secret));
  const receivedSignature = Buffer.from(suppliedSignature);
  if (
    expectedSignature.length !== receivedSignature.length ||
    !timingSafeEqual(expectedSignature, receivedSignature)
  ) return null;

  let decoded: WsTicketPayload;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as WsTicketPayload;
  } catch {
    return null;
  }
  if (
    typeof decoded.sub !== "string" ||
    !decoded.sub ||
    typeof decoded.exp !== "number" ||
    decoded.exp < now ||
    decoded.exp > now + 60_000 ||
    typeof decoded.nonce !== "string" ||
    !decoded.nonce
  ) return null;

  for (const [nonce, expiresAt] of usedNonces) {
    if (expiresAt < now) usedNonces.delete(nonce);
  }
  if (usedNonces.has(decoded.nonce)) return null;
  usedNonces.set(decoded.nonce, decoded.exp);
  return decoded.sub;
}

export function resetConsumedWsTickets() {
  usedNonces.clear();
}
