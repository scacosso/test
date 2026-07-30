import { randomUUID, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import websocket from "@fastify/websocket";
import { clientEventTypes, queueJoinSchema, reportSchema, wsEnvelopeSchema } from "@nexocam/shared";
import { z } from "zod";
import { auth, sessionUser } from "./auth.js";
import { isAdultDateOfBirth } from "./auth-policy.js";
import { config } from "./config.js";
import {
  closeSession,
  createBlock,
  createReport,
  createSession,
  featureFlagDefaults,
  getFeatureFlags,
  isBlocked,
  isSanctioned,
  pool,
  recordConsent,
  updateFeatureFlags
} from "./db.js";
import { prepareRoom, terminateRoom } from "./livekit.js";
import { Matchmaker } from "./matchmaker.js";
import { readEncryptedEvidence, storeEncryptedChat } from "./evidence.js";
import { purgeExpiredEvidence } from "./retention.js";
import { RedisMatchmaker } from "./redis-matchmaker.js";

type SocketLike = {
  readyState: number;
  send: (payload: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
};
type Client = {
  userId: string;
  socketId: string;
  socket: SocketLike;
  sessionId?: string;
  peerId?: string;
  queue?: { userId: string; socketId: string; language: string; country: string; joinedAt: number };
};
type ActiveSession = { id: string; roomName: string; users: [string, string]; messages: { userId: string; text: string; at: string }[] };

const app = Fastify({
  logger: { level: config.nodeEnv === "production" ? "info" : "debug" },
  bodyLimit: 64 * 1024,
  trustProxy: true
});
const clients = new Map<string, Client>();
const users = new Map<string, Client>();
const sessions = new Map<string, ActiveSession>();
const matcher = config.redisUrl
  ? new RedisMatchmaker(config.redisUrl, isBlocked, isSanctioned)
  : new Matchmaker(isBlocked, isSanctioned);

await app.register(cookie, { secret: config.authSecret });
await app.register(cors, { origin: config.allowedOrigins, credentials: true });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
await app.register(websocket, {
  options: { maxPayload: 16 * 1024 }
});

const envelope = (type: string, payload: Record<string, unknown>, requestId: string = randomUUID()) =>
  JSON.stringify({ type, requestId, payload, version: 1 });
const send = (client: Client | undefined, type: string, payload: Record<string, unknown>, requestId?: string) => {
  if (client?.socket.readyState === 1) client.socket.send(envelope(type, payload, requestId));
};
const originAllowed = (request: FastifyRequest) => {
  const origin = request.headers.origin;
  return !origin || config.allowedOrigins.includes(origin);
};
const requestHeaders = (request: FastifyRequest) => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  return headers;
};
const internalAuthorized = (authorization: string | undefined) => {
  if (!config.moderationServiceToken || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(config.moderationServiceToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

app.get("/health/live", async () => ({ status: "ok" }));
app.get("/health/ready", async (_request, reply) => {
  try {
    if (pool) await pool.query("select 1");
    return { status: "ready", queue: matcher.size, sessions: sessions.size };
  } catch {
    return reply.code(503).send({ status: "not-ready" });
  }
});
app.get("/api/config", async () => {
  const features = await getFeatureFlags();
  return {
    googleOAuth: Boolean(config.googleClientId && config.googleClientSecret),
    livekitUrl: config.livekitUrl,
    maxConcurrentUsers: config.maxConcurrentUsers,
    features: {
      emailVerification: features.email_verification,
      guestAccess: features.guest_access,
      moderation: features.moderation,
      monitoring: features.monitoring,
      registration: features.registration,
      reporting: features.reporting
    }
  };
});

const authHandler = auth;
if (authHandler) {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: async (request, reply) => {
      const target = new URL(request.url, config.appUrl);
      const features = await getFeatureFlags();
      const isAnonymousSignIn = request.method === "POST" && target.pathname.endsWith("/sign-in/anonymous");
      const isEmailSignUp = request.method === "POST" && target.pathname.endsWith("/sign-up/email");

      if (isAnonymousSignIn && !features.guest_access) {
        return reply.code(403).send({ error: "guest_access_disabled" });
      }
      if (isAnonymousSignIn && request.headers["x-nexocam-age-confirmed"] !== "true") {
        return reply.code(400).send({ error: "adult_confirmation_required" });
      }
      if (isEmailSignUp && !features.registration) {
        return reply.code(403).send({ error: "registration_disabled" });
      }
      if (isEmailSignUp && !isAdultDateOfBirth((request.body as { dateOfBirth?: unknown } | undefined)?.dateOfBirth)) {
        return reply.code(400).send({ error: "adult_date_of_birth_required" });
      }

      const body = request.method === "GET" ? undefined : JSON.stringify(request.body ?? {});
      const response = await authHandler.handler(new Request(target, {
        method: request.method,
        headers: requestHeaders(request),
        body
      }));
      reply.code(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      const responseBody = Buffer.from(await response.arrayBuffer());
      if (response.ok && (isAnonymousSignIn || isEmailSignUp)) {
        let data: { user?: { email?: string; id?: string } } | undefined;
        try {
          data = JSON.parse(responseBody.toString()) as { user?: { email?: string; id?: string } };
        } catch {
          app.log.warn("Better Auth response did not expose a user id for consent recording");
        }
        if (data?.user?.id) {
          await recordConsent(data.user.id, "adult_18_attestation", "alpha-1");
        }
        if (isEmailSignUp && features.email_verification && data?.user?.email) {
          void authHandler.api.sendVerificationEmail({
            body: {
              email: data.user.email,
              callbackURL: `${config.appUrl}/auth`
            },
            headers: requestHeaders(request)
          }).catch((error) => app.log.error(error, "Verification email failed"));
        }
      }
      return reply.send(responseBody);
    }
  });
} else {
  app.post("/api/auth/sign-up/email", async (_request, reply) => reply.code(202).send({ demo: true, emailVerification: false }));
  app.post("/api/auth/sign-in/anonymous", async (request, reply) => {
    if (request.headers["x-nexocam-age-confirmed"] !== "true") {
      return reply.code(400).send({ error: "adult_confirmation_required" });
    }
    return reply.code(202).send({ demo: true, guest: true });
  });
}

const featureFlagUpdateSchema = z.object(
  Object.fromEntries(
    Object.keys(featureFlagDefaults).map((key) => [key, z.boolean().optional()])
  ) as Record<keyof typeof featureFlagDefaults, z.ZodOptional<z.ZodBoolean>>
).partial().refine((value) => Object.keys(value).length > 0, "At least one feature flag is required");

app.get("/api/admin/features", async (request, reply) => {
  const user = await sessionUser(requestHeaders(request));
  if (!user || !["admin", "superuser"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
  return { features: await getFeatureFlags() };
});

app.patch("/api/admin/features", async (request, reply) => {
  if (!originAllowed(request)) return reply.code(403).send({ error: "origin_not_allowed" });
  const user = await sessionUser(requestHeaders(request));
  if (!user || !["admin", "superuser"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
  const parsed = featureFlagUpdateSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_feature_flags" });
  return { features: await updateFeatureFlags(parsed.data, user.id) };
});

app.get("/api/admin/reports", async (request, reply) => {
  const user = await sessionUser(requestHeaders(request));
  if (!user || !["moderator", "admin", "superuser"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
  if (!pool) return [];
  const result = await pool.query(
    `select r.id, r.reason, r.priority, r.status, r.created_at, count(e.id)::int as evidence_count
     from reports r
     left join evidence e on e.report_id = r.id and e.expires_at > now()
     where status in ('pending', 'reviewing')
     group by r.id
     order by case r.priority when 'urgent' then 0 when 'high' then 1 else 2 end, r.created_at asc
     limit 100`
  );
  return result.rows;
});

app.get("/api/admin/evidence/:id", async (request, reply) => {
  const user = await sessionUser(requestHeaders(request));
  if (!user || !["moderator", "admin", "superuser"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
  const id = (request.params as { id: string }).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: "invalid_id" });
  const evidence = await readEncryptedEvidence(id, user.id);
  if (!evidence) return reply.code(404).send({ error: "not_found" });
  reply.header("cache-control", "no-store");
  reply.header("content-security-policy", "default-src 'none'");
  return reply.type(evidence.contentType).send(evidence.body);
});

app.post("/api/internal/moderation/event", async (request, reply) => {
  if (!internalAuthorized(request.headers.authorization)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  if (!(await getFeatureFlags()).moderation) {
    return reply.code(503).send({ error: "moderation_disabled" });
  }
  const input = request.body as {
    sessionId?: string;
    userId?: string;
    label?: string;
    confidence?: number;
    strong?: boolean;
    evidence?: { objectKey: string; sha256: string }[];
  };
  if (!input.sessionId || !input.userId || !input.label) return reply.code(400).send({ error: "invalid_event" });
  const session = sessions.get(input.sessionId);
  if (!session || !session.users.includes(input.userId)) return reply.code(404).send({ error: "session_not_found" });
  const eventId = randomUUID();
  if (pool) {
    await pool.query(
      `insert into moderation_events (id, session_id, user_id, source, label, confidence)
       values ($1, $2, $3, 'classifier', $4, $5)`,
      [eventId, input.sessionId, input.userId, input.label, input.confidence ?? null]
    );
    for (const item of (input.evidence ?? []).slice(0, 3)) {
      await pool.query(
        `insert into evidence (moderation_event_id, object_key, media_type, sha256, encrypted_key)
         values ($1, $2, 'image', $3, 'env:EVIDENCE_ENCRYPTION_KEY')`,
        [eventId, item.objectKey, item.sha256]
      );
    }
  }
  await storeEncryptedChat(eventId, session.id, session.messages);
  if (input.strong) {
    if (pool) {
      await pool.query(
        `insert into sanctions (user_id, type, reason, automatic, expires_at)
         values ($1, 'temporary_hold', $2, true, now() + interval '1 hour')`,
        [input.userId, `classifier:${input.label}`]
      );
    }
    const client = users.get(input.userId);
    if (client) {
      send(client, "moderation.warning", { label: input.label, action: "session-ended" });
      await endSession(client, "moderation");
    }
  }
  return reply.code(202).send({ eventId });
});

app.get("/api/internal/moderation/sessions", async (request, reply) => {
  if (!internalAuthorized(request.headers.authorization)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  return [...sessions.values()].map((session) => ({
    sessionId: session.id,
    roomName: session.roomName
  }));
});

async function matchFound(left: Client, right: Client) {
  const sessionId = randomUUID();
  const roomName = `nexocam-${sessionId}`;
  const tokens = await prepareRoom(roomName, [left.userId, right.userId]);
  sessions.set(sessionId, { id: sessionId, roomName, users: [left.userId, right.userId], messages: [] });
  left.sessionId = right.sessionId = sessionId;
  left.peerId = right.userId;
  right.peerId = left.userId;
  left.queue = right.queue = undefined;
  await createSession(sessionId, roomName, left.userId, right.userId);
  send(left, "match.found", { sessionId, peerId: right.userId, roomName, token: tokens[0]?.token, livekitUrl: config.livekitUrl });
  send(right, "match.found", { sessionId, peerId: left.userId, roomName, token: tokens[1]?.token, livekitUrl: config.livekitUrl });
}

async function endSession(client: Client, reason: string, notifyPeer = true) {
  if (!client.sessionId) return;
  const session = sessions.get(client.sessionId);
  const peer = client.peerId ? users.get(client.peerId) : undefined;
  if (session) {
    sessions.delete(session.id);
    await closeSession(session.id, reason);
    await terminateRoom(session.roomName);
    session.users.forEach((id) => matcher.release(id));
  }
  const id = client.sessionId;
  client.sessionId = client.peerId = undefined;
  if (peer) {
    peer.sessionId = peer.peerId = undefined;
    if (notifyPeer) send(peer, "session.peerLeft", { sessionId: id, reason });
  }
}

app.get("/ws/v1", { websocket: true }, async (socket, request) => {
  const clientSocket = socket as unknown as SocketLike;
  if (!originAllowed(request)) {
    clientSocket.close(1008, "Origin not allowed");
    return;
  }
  if (clients.size >= config.maxConcurrentUsers) {
    clientSocket.close(1013, "At capacity");
    return;
  }
  const query = request.query as { user?: string };
  const authenticated = await sessionUser(requestHeaders(request));
  if (!authenticated && !config.demoMode) {
    clientSocket.close(1008, "Authentication required");
    return;
  }
  const userId = authenticated?.id ?? (query.user ? query.user.slice(0, 128) : randomUUID());
  if (users.has(userId)) {
    clientSocket.close(1008, "Duplicate connection");
    return;
  }
  const client: Client = { userId, socketId: randomUUID(), socket: clientSocket };
  clients.set(client.socketId, client);
  users.set(userId, client);

  clientSocket.on("message", async (raw: Buffer | string) => {
    try {
      const message = wsEnvelopeSchema.parse(JSON.parse(raw.toString()));
      if (!clientEventTypes.includes(message.type as (typeof clientEventTypes)[number])) throw new Error("Unknown event");
      if (message.type === "heartbeat") {
        if (client.queue && !client.sessionId) {
          const result = await matcher.join(client.queue);
          if (result) {
            await matchFound(users.get(result.left.userId)!, users.get(result.right.userId)!);
            return;
          }
        }
        send(client, "queue.state", { waiting: matcher.size, stages: matcher.stageCounts }, message.requestId);
        return;
      }
      if (message.type === "queue.join") {
        if (await isSanctioned(userId)) {
          send(client, "account.sanctioned", { reason: "active-sanction" }, message.requestId);
          return;
        }
        const filter = queueJoinSchema.parse(message.payload);
        client.queue = { userId, socketId: client.socketId, ...filter, joinedAt: Date.now() };
        const result = await matcher.join(client.queue);
        if (result) await matchFound(users.get(result.left.userId)!, users.get(result.right.userId)!);
        else send(client, "queue.state", { state: "searching", waiting: matcher.size }, message.requestId);
        return;
      }
      if (message.type === "queue.leave") {
        matcher.leave(userId);
        client.queue = undefined;
        send(client, "queue.state", { state: "idle" }, message.requestId);
        return;
      }
      if (message.type === "match.next") {
        await endSession(client, "next");
        const payload = queueJoinSchema.parse({ language: message.payload.language ?? "es", country: message.payload.country ?? "AR" });
        client.queue = { userId, socketId: client.socketId, ...payload, joinedAt: Date.now() };
        const result = await matcher.join(client.queue);
        if (result) await matchFound(users.get(result.left.userId)!, users.get(result.right.userId)!);
        else send(client, "queue.state", { state: "searching", waiting: matcher.size }, message.requestId);
        return;
      }
      if (message.type === "chat.send") {
        const text = String(message.payload.text ?? "").trim().slice(0, 500);
        if (!text || !client.sessionId || !client.peerId) return;
        const session = sessions.get(client.sessionId);
        session?.messages.push({ userId, text, at: new Date().toISOString() });
        if (session && session.messages.length > 20) session.messages.splice(0, session.messages.length - 20);
        send(users.get(client.peerId), "chat.message", { text, senderId: userId }, message.requestId);
        return;
      }
      if (message.type === "session.block") {
        if (client.peerId) await createBlock(userId, client.peerId, client.sessionId);
        await endSession(client, "blocked");
        send(client, "session.ended", { reason: "blocked" }, message.requestId);
        return;
      }
      if (message.type === "session.report") {
        if (!(await getFeatureFlags()).reporting) {
          send(client, "error", { code: "FEATURE_DISABLED", message: "Reporting is currently disabled." }, message.requestId);
          return;
        }
        const report = reportSchema.parse({ ...message.payload, sessionId: client.sessionId, reportedUserId: client.peerId });
        await createReport({
          reporterId: userId,
          reportedId: report.reportedUserId,
          sessionId: report.sessionId,
          reason: report.reason,
          details: report.details
        });
        if (report.reason === "possible_minor" && client.peerId && pool) {
          await pool.query(
            `insert into sanctions (user_id, type, reason, automatic, expires_at)
             values ($1, 'temporary_hold', 'possible_minor_report', true, now() + interval '24 hours')`,
            [client.peerId]
          );
        }
        await endSession(client, `reported:${report.reason}`);
        send(client, "session.ended", { reason: "reported" }, message.requestId);
      }
    } catch (error) {
      send(client, "error", { code: "INVALID_MESSAGE", message: "The message could not be processed." });
    }
  });

  clientSocket.on("close", async () => {
    matcher.leave(userId);
    await endSession(client, "disconnect");
    clients.delete(client.socketId);
    users.delete(userId);
  });
});

if (config.nodeEnv === "production") {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "../../../dist/client");
  await app.register(staticPlugin, { root });
  app.setNotFoundHandler((_request, reply) => reply.sendFile("index.html"));
}

await app.listen({ port: config.port, host: "0.0.0.0" });
const retentionTimer = setInterval(() => {
  void purgeExpiredEvidence().catch((error) => app.log.error(error, "Evidence retention failed"));
}, 24 * 60 * 60 * 1000);
retentionTimer.unref();
