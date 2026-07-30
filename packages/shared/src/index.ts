import { z } from "zod";

export const WS_VERSION = 1 as const;

export const clientEventTypes = [
  "queue.join",
  "queue.leave",
  "match.next",
  "chat.send",
  "session.report",
  "session.block",
  "heartbeat"
] as const;

export const serverEventTypes = [
  "queue.state",
  "match.found",
  "session.peerLeft",
  "session.ended",
  "moderation.warning",
  "account.sanctioned",
  "chat.message",
  "error"
] as const;

export type ClientEventType = (typeof clientEventTypes)[number];
export type ServerEventType = (typeof serverEventTypes)[number];

export const wsEnvelopeSchema = z.object({
  type: z.string().min(1).max(64),
  requestId: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()).default({}),
  version: z.literal(WS_VERSION)
});

export type WsEnvelope = z.infer<typeof wsEnvelopeSchema>;

export const queueJoinSchema = z.object({
  language: z.string().regex(/^[a-z]{2}$/i).transform((value) => value.toLowerCase()),
  country: z.string().regex(/^[A-Z]{2}$/i).transform((value) => value.toUpperCase())
});

export const reportReasons = ["nudity", "harassment", "violence", "spam", "possible_minor"] as const;
export const reportSchema = z.object({
  sessionId: z.string().uuid(),
  reportedUserId: z.string().uuid(),
  reason: z.enum(reportReasons),
  details: z.string().max(1000).optional()
});

export const roleSchema = z.enum(["user", "moderator", "admin"]);
export type Role = z.infer<typeof roleSchema>;

export type QueueCandidate = {
  userId: string;
  socketId: string;
  language: string;
  country: string;
  joinedAt: number;
};

export function candidateMatches(
  left: QueueCandidate,
  right: QueueCandidate,
  now: number,
  blocked: (a: string, b: string) => boolean
) {
  if (left.userId === right.userId || blocked(left.userId, right.userId)) return false;
  const age = Math.max(now - left.joinedAt, now - right.joinedAt);
  if (age < 10_000) return left.language === right.language && left.country === right.country;
  return left.language === right.language;
}

export function matchingStage(joinedAt: number, now = Date.now()) {
  const elapsed = now - joinedAt;
  if (elapsed < 10_000) return "country-language" as const;
  if (elapsed < 30_000) return "language-nearby" as const;
  return "language-global" as const;
}
