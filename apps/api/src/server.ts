import { randomUUID, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import websocket from "@fastify/websocket";
import { clientEventTypes, queueJoinSchema, reportSchema, wsEnvelopeSchema } from "@nexocam/shared";
import { z } from "zod";
import {
  adminRoles,
  applyReportAction,
  createSanction,
  ensureConfiguredSuperuser,
  getAdminUser,
  getOperationalMetrics,
  getOverviewDatabaseCounts,
  getReport,
  getServiceHeartbeats,
  isRole,
  listAdminUsers,
  listAudit,
  listReports,
  listSanctions,
  permissionsFor,
  recordOperationalMetric,
  revokeSanction,
  syncConfiguredSuperusers,
  updateAdminUserRole,
  updateServiceHeartbeat,
  type Role
} from "./admin.js";
import { auth, sessionUser } from "./auth.js";
import { forwardAuthResponseHeaders } from "./auth-response.js";
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
import {
  createUserPreviewSubscriberToken,
  healthLiveKit,
  prepareRoom,
  prepareUserPreviewRoom,
  removeLiveReviewParticipant,
  terminateRoom
} from "./livekit.js";
import { Matchmaker, type Match } from "./matchmaker.js";
import {
  healthEvidenceStore,
  readEncryptedEvidence,
  storeEncryptedChatForEvent,
  storeEncryptedChatForReport
} from "./evidence.js";
import { purgeExpiredEvidence } from "./retention.js";
import { RedisMatchmaker } from "./redis-matchmaker.js";
import { consumeWsTicket, createWsTicket, websocketTicketFromProtocols } from "./ws-ticket.js";

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
  connectedAt: string;
  sessionId?: string;
  peerId?: string;
  previewRoomName?: string;
  previewReady?: boolean;
  adminReservationId?: string;
  matchSetup?: boolean;
  queue?: { userId: string; socketId: string; language: string; country: string; joinedAt: number };
};
type ActiveSession = {
  id: string;
  roomName: string;
  users: [string, string];
  kind: "random" | "admin";
  startedAt: string;
  messages: { userId: string; text: string; at: string }[];
};
type PendingReportEvidence = {
  reportId: string;
  sessionId: string;
  roomName: string;
  reportedUserId: string;
  expiresAt: number;
};

const app = Fastify({
  logger: { level: config.nodeEnv === "production" ? "info" : "debug" },
  bodyLimit: 64 * 1024,
  trustProxy: true
});
const clients = new Map<string, Client>();
const users = new Map<string, Client>();
const sessions = new Map<string, ActiveSession>();
const pendingReportEvidence = new Map<string, PendingReportEvidence>();
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
const requireRole = async (
  request: FastifyRequest,
  reply: FastifyReply,
  allowed: readonly Role[]
) => {
  const user = await sessionUser(requestHeaders(request));
  if (!user) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  if (!allowed.includes(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
};
const requireMutationOrigin = (request: FastifyRequest, reply: FastifyReply) => {
  if (originAllowed(request)) return true;
  reply.code(403).send({ error: "origin_not_allowed" });
  return false;
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

app.post("/api/chat/ws-ticket", {
  config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
}, async (request, reply) => {
  if (!requireMutationOrigin(request, reply)) return;
  const user = await sessionUser(requestHeaders(request));
  if (!user) return reply.code(401).send({ error: "unauthorized" });
  reply.header("cache-control", "no-store");
  return {
    ticket: createWsTicket(user.id, config.authSecret),
    expiresInMs: 30_000
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
      const isEmailSignIn = request.method === "POST" && target.pathname.endsWith("/sign-in/email");
      const isSignOut = request.method === "POST" && target.pathname.endsWith("/sign-out");

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
      forwardAuthResponseHeaders(reply, response, {
        clearSessionCookies: isSignOut,
        secureCookies: config.nodeEnv === "production"
      });
      reply.header("cache-control", "no-store");
      const responseBody = Buffer.from(await response.arrayBuffer());
      if (response.ok && (isAnonymousSignIn || isEmailSignUp || isEmailSignIn)) {
        let data: { user?: { email?: string; id?: string } } | undefined;
        try {
          data = JSON.parse(responseBody.toString()) as { user?: { email?: string; id?: string } };
        } catch {
          app.log.warn("Better Auth response did not expose a user id for consent recording");
        }
        if (data?.user?.id && (isAnonymousSignIn || isEmailSignUp)) {
          await recordConsent(data.user.id, "adult_18_attestation", "alpha-1");
        }
        if (data?.user?.id && data.user.email && (isEmailSignUp || isEmailSignIn)) {
          await ensureConfiguredSuperuser({ id: data.user.id, email: data.user.email });
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

const featureFlagValuesSchema = z.object(
  Object.fromEntries(
    Object.keys(featureFlagDefaults).map((key) => [key, z.boolean().optional()])
  ) as Record<keyof typeof featureFlagDefaults, z.ZodOptional<z.ZodBoolean>>
).partial().refine((value) => Object.keys(value).length > 0, "At least one feature flag is required");
const featureFlagUpdateSchema = z.object({
  features: featureFlagValuesSchema,
  reason: z.string().trim().min(3).max(500)
});
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0)
});
const uuidSchema = z.string().uuid();
const roleUpdateSchema = z.object({
  role: z.enum(["user", "moderator", "admin", "superuser"]),
  reason: z.string().trim().min(3).max(500),
  confirmEmail: z.string().email().optional()
});
const reportActionSchema = z.object({
  action: z.enum(["start_review", "resolve", "dismiss", "temporary_hold"]),
  reason: z.string().trim().min(3).max(500),
  durationHours: z.coerce.number().int().min(1).max(24).optional()
});
const reportEvidenceSchema = z.object({
  reportId: z.string().uuid(),
  sessionId: z.string().uuid(),
  evidence: z.array(z.object({
    objectKey: z.string().min(1).max(512),
    sha256: z.string().regex(/^[a-f0-9]{64}$/)
  })).max(3)
});
const sanctionCreateSchema = z.object({
  userId: z.string().min(1).max(128),
  type: z.enum(["temporary_hold", "suspension"]),
  reason: z.string().trim().min(3).max(500),
  expiresAt: z.string().datetime().optional(),
  confirmEmail: z.string().email().optional()
});
const sanctionRevokeSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});
const adminUserConnectSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});
const adminUserAccessEndSchema = z.object({
  endReason: z.enum([
    "viewer_closed",
    "viewer_disconnected",
    "token_expired",
    "target_disconnected"
  ]).default("viewer_closed")
});

app.get("/api/admin/me", async (request, reply) => {
  const user = await requireRole(request, reply, adminRoles);
  if (!user) return;
  reply.header("cache-control", "no-store");
  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      isGuest: user.isGuest
    },
    permissions: permissionsFor(user.role)
  };
});

app.get("/api/admin/overview", async (request, reply) => {
  const user = await requireRole(request, reply, ["superuser"]);
  if (!user) return;
  const [counts, features, audit] = await Promise.all([
    getOverviewDatabaseCounts(),
    getFeatureFlags(),
    listAudit({ limit: 6, offset: 0 })
  ]);
  return {
    generatedAt: new Date().toISOString(),
    capacity: config.maxConcurrentUsers,
    connectedUsers: clients.size,
    queuedUsers: matcher.size,
    activeSessions: sessions.size,
    counts,
    features,
    recentAudit: audit.items
  };
});

app.get("/api/admin/features", async (request, reply) => {
  const user = await requireRole(request, reply, ["superuser"]);
  if (!user) return;
  return { features: await getFeatureFlags() };
});

app.patch("/api/admin/features", async (request, reply) => {
  if (!requireMutationOrigin(request, reply)) return;
  const user = await requireRole(request, reply, ["superuser"]);
  if (!user) return;
  const parsed = featureFlagUpdateSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_feature_flags" });
  return {
    features: await updateFeatureFlags(parsed.data.features, user.id, parsed.data.reason)
  };
});

app.get("/api/admin/users", async (request, reply) => {
  const user = await requireRole(request, reply, ["admin", "superuser"]);
  if (!user) return;
  const raw = request.query as Record<string, unknown>;
  const pagination = paginationSchema.safeParse(raw);
  if (!pagination.success) return reply.code(400).send({ error: "invalid_pagination" });
  const role = typeof raw.role === "string" && isRole(raw.role) ? raw.role : undefined;
  const status = raw.status === "active" || raw.status === "sanctioned" ? raw.status : undefined;
  return listAdminUsers({
    query: typeof raw.query === "string" ? raw.query.trim().slice(0, 100) : undefined,
    role,
    status,
    ...pagination.data
  });
});

app.get("/api/admin/users/:id", async (request, reply) => {
  const user = await requireRole(request, reply, ["admin", "superuser"]);
  if (!user) return;
  const id = (request.params as { id: string }).id.slice(0, 128);
  const target = await getAdminUser(id);
  if (!target) return reply.code(404).send({ error: "not_found" });
  return target;
});

app.patch("/api/admin/users/:id/role", async (request, reply) => {
  if (!requireMutationOrigin(request, reply)) return;
  const user = await requireRole(request, reply, ["superuser"]);
  if (!user) return;
  const parsed = roleUpdateSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_role_update" });
  const result = await updateAdminUserRole({
    actorId: user.id,
    targetId: (request.params as { id: string }).id.slice(0, 128),
    ...parsed.data
  });
  if (!result) return reply.code(503).send({ error: "database_unavailable" });
  if ("error" in result) {
    const code = result.error === "not_found" ? 404 : result.error === "confirmation_required" ? 409 : 400;
    return reply.code(code).send(result);
  }
  return result;
});

app.get("/api/admin/reports", async (request, reply) => {
  const user = await requireRole(request, reply, adminRoles);
  if (!user) return;
  const raw = request.query as Record<string, unknown>;
  const pagination = paginationSchema.safeParse(raw);
  if (!pagination.success) return reply.code(400).send({ error: "invalid_pagination" });
  return listReports({
    status: typeof raw.status === "string" ? raw.status.slice(0, 20) : undefined,
    priority: typeof raw.priority === "string" ? raw.priority.slice(0, 20) : undefined,
    reason: typeof raw.reason === "string" ? raw.reason.slice(0, 40) : undefined,
    ...pagination.data
  });
});

app.get("/api/admin/reports/:id", async (request, reply) => {
  const user = await requireRole(request, reply, adminRoles);
  if (!user) return;
  const id = (request.params as { id: string }).id;
  if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: "invalid_id" });
  const report = await getReport(id);
  if (!report) return reply.code(404).send({ error: "not_found" });
  return report;
});

app.post("/api/admin/reports/:id/actions", async (request, reply) => {
  if (!requireMutationOrigin(request, reply)) return;
  const user = await requireRole(request, reply, adminRoles);
  if (!user) return;
  const id = (request.params as { id: string }).id;
  const parsed = reportActionSchema.safeParse(request.body);
  if (!uuidSchema.safeParse(id).success || !parsed.success) {
    return reply.code(400).send({ error: "invalid_report_action" });
  }
  const result = await applyReportAction({
    actorId: user.id,
    reportId: id,
    ...parsed.data
  });
  if (!result) return reply.code(404).send({ error: "not_found" });
  if ("error" in result) return reply.code(409).send(result);
  if (result.sanctionId) {
    const client = users.get(result.reportedUserId);
    if (client) {
      send(client, "account.sanctioned", { reason: parsed.data.reason });
      await endSession(client, "administrative-sanction");
    }
  }
  return result;
});

app.get("/api/admin/evidence/:id", async (request, reply) => {
  const user = await requireRole(request, reply, adminRoles);
  if (!user) return;
  const id = (request.params as { id: string }).id;
  if (!uuidSchema.safeParse(id).success) return reply.code(400).send({ error: "invalid_id" });
  const evidence = await readEncryptedEvidence(id, user.id);
  if (!evidence) return reply.code(404).send({ error: "not_found" });
  reply.header("cache-control", "no-store");
  reply.header("content-security-policy", "default-src 'none'");
  return reply.type(evidence.contentType).send(evidence.body);
});

app.get("/api/admin/sanctions", async (request, reply) => {
  const user = await requireRole(request, reply, ["admin", "superuser"]);
  if (!user) return;
  const raw = request.query as Record<string, unknown>;
  const pagination = paginationSchema.safeParse(raw);
  if (!pagination.success) return reply.code(400).send({ error: "invalid_pagination" });
  return listSanctions({
    status: typeof raw.status === "string" ? raw.status.slice(0, 20) : undefined,
    ...pagination.data
  });
});

app.post("/api/admin/sanctions", async (request, reply) => {
  if (!requireMutationOrigin(request, reply)) return;
  const user = await requireRole(request, reply, ["admin", "superuser"]);
  if (!user) return;
  const parsed = sanctionCreateSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_sanction" });
  const result = await createSanction({
    actorId: user.id,
    actorRole: user.role,
    ...parsed.data
  });
  if (!result) return reply.code(503).send({ error: "database_unavailable" });
  if ("error" in result) {
    const code = result.error === "not_found" ? 404 : result.error === "confirmation_required" ? 409 : 400;
    return reply.code(code).send(result);
  }
  const client = users.get(result.target.id);
  if (client) {
    send(client, "account.sanctioned", { reason: parsed.data.reason });
    await endSession(client, "administrative-sanction");
  }
  return reply.code(201).send(result);
});

app.post("/api/admin/sanctions/:id/revoke", async (request, reply) => {
  if (!requireMutationOrigin(request, reply)) return;
  const user = await requireRole(request, reply, ["admin", "superuser"]);
  if (!user) return;
  const id = (request.params as { id: string }).id;
  const parsed = sanctionRevokeSchema.safeParse(request.body);
  if (!uuidSchema.safeParse(id).success || !parsed.success) {
    return reply.code(400).send({ error: "invalid_revocation" });
  }
  const sanction = await revokeSanction({
    actorId: user.id,
    sanctionId: id,
    reason: parsed.data.reason
  });
  if (!sanction) return reply.code(404).send({ error: "not_found" });
  return sanction;
});

app.get("/api/admin/monitoring", async (request, reply) => {
  const user = await requireRole(request, reply, ["superuser"]);
  if (!user) return;
  const rawHours = Number((request.query as { hours?: unknown }).hours ?? 24);
  const hours = Number.isFinite(rawHours) ? Math.max(1, Math.min(168, Math.round(rawHours))) : 24;
  const databaseStart = performance.now();
  let databaseHealth = { healthy: false, latencyMs: null as number | null };
  try {
    if (pool) {
      await pool.query("select 1");
      databaseHealth = { healthy: true, latencyMs: Math.round(performance.now() - databaseStart) };
    }
  } catch {
    databaseHealth = { healthy: false, latencyMs: Math.round(performance.now() - databaseStart) };
  }
  const [history, heartbeats, livekit, storage, redis] = await Promise.all([
    getOperationalMetrics(hours),
    getServiceHeartbeats(),
    healthLiveKit(),
    healthEvidenceStore(),
    matcher instanceof RedisMatchmaker
      ? matcher.health().catch(() => ({ healthy: false, latencyMs: null }))
      : Promise.resolve({ healthy: true, latencyMs: 0 })
  ]);
  return {
    generatedAt: new Date().toISOString(),
    current: {
      connectedUsers: clients.size,
      queuedUsers: matcher.size,
      activeSessions: sessions.size,
      capacity: config.maxConcurrentUsers
    },
    services: {
      database: databaseHealth,
      redis,
      livekit,
      storage,
      moderation: heartbeats.find((item) => item.service === "moderation") ?? {
        service: "moderation",
        status: "offline",
        details: {},
        updated_at: null
      }
    },
    history
  };
});

app.get("/api/admin/live/users", async (request, reply) => {
  const actor = await requireRole(request, reply, ["superuser"]);
  if (!actor) return;
  reply.header("cache-control", "no-store");
  const connected = [...users.values()].filter((client) => client.userId !== actor.id);
  if (connected.length === 0) {
    return { generatedAt: new Date().toISOString(), users: [] };
  }
  const accounts = pool
    ? await pool.query<{
        id: string;
        email: string | null;
        name: string | null;
        role: string | null;
        is_anonymous: boolean;
      }>(
        `select id, email, name, role, coalesce("isAnonymous", false) as is_anonymous
         from "user"
         where id = any($1::text[])`,
        [connected.map((client) => client.userId)]
      )
    : { rows: [] };
  const accountById = new Map(accounts.rows.map((account) => [account.id, account]));
  return {
    generatedAt: new Date().toISOString(),
    users: connected.map((client) => {
      const account = accountById.get(client.userId);
      const status = client.sessionId || client.matchSetup
        ? "in_call"
        : client.adminReservationId
          ? "connecting"
          : client.queue
            ? "searching"
            : "online";
      return {
        id: client.userId,
        email: account?.email ?? null,
        name: account?.name ?? null,
        role: account?.role ?? "user",
        isGuest: account?.is_anonymous ?? false,
        connectedAt: client.connectedAt,
        status,
        previewReady: Boolean(client.previewRoomName && client.previewReady)
      };
    })
  };
});

app.post("/api/admin/live/users/:id/preview", {
  config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
}, async (request, reply) => {
  if (!requireMutationOrigin(request, reply)) return;
  const actor = await requireRole(request, reply, ["superuser"]);
  if (!actor) return;
  const targetUserId = (request.params as { id: string }).id;
  if (!targetUserId || targetUserId.length > 128 || targetUserId === actor.id) {
    return reply.code(400).send({ error: "invalid_target_user" });
  }
  const target = users.get(targetUserId);
  if (!target) return reply.code(404).send({ error: "user_not_connected" });
  if (!target.previewRoomName || !target.previewReady) {
    return reply.code(409).send({ error: "camera_preview_not_ready" });
  }
  if (!pool) return reply.code(503).send({ error: "database_unavailable" });

  const accessId = randomUUID();
  const participantIdentity = `admin-preview-${accessId}`;
  const expiresAt = new Date(Date.now() + 90_000);
  let token: string;
  try {
    token = await createUserPreviewSubscriberToken(
      target.previewRoomName,
      participantIdentity,
      targetUserId
    );
  } catch (error) {
    request.log.error(error, "Unable to create connected-user preview token");
    return reply.code(503).send({ error: "livekit_unavailable" });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into admin_user_access (
         id, actor_id, target_user_id, mode, room_name, participant_identity, reason, token_expires_at
       ) values ($1, $2, $3, 'preview', $4, $5, $6, $7)`,
      [
        accessId,
        actor.id,
        targetUserId,
        target.previewRoomName,
        participantIdentity,
        "Connected-users camera preview",
        expiresAt
      ]
    );
    await client.query(
      `insert into audit_log (actor_id, action, target_type, target_id, reason, metadata)
       values ($1, 'connected_user.preview_started', 'user', $2, $3, $4::jsonb)`,
      [
        actor.id,
        targetUserId,
        "Connected-users camera preview",
        JSON.stringify({ accessId, tokenExpiresAt: expiresAt.toISOString() })
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  reply.header("cache-control", "no-store");
  return {
    accessId,
    mode: "preview",
    targetUserId,
    token,
    livekitUrl: config.livekitUrl,
    expiresAt: expiresAt.toISOString()
  };
});

app.post("/api/admin/live/users/:id/connect", {
  config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
}, async (request, reply) => {
  if (!requireMutationOrigin(request, reply)) return;
  const actor = await requireRole(request, reply, ["superuser"]);
  if (!actor) return;
  const targetUserId = (request.params as { id: string }).id;
  const parsed = adminUserConnectSchema.safeParse(request.body);
  if (!targetUserId || targetUserId.length > 128 || targetUserId === actor.id || !parsed.success) {
    return reply.code(400).send({ error: "invalid_admin_connection" });
  }
  const target = users.get(targetUserId);
  if (!target) return reply.code(404).send({ error: "user_not_connected" });
  if (target.sessionId || target.matchSetup || target.adminReservationId) {
    return reply.code(409).send({ error: "user_busy" });
  }
  if (await isSanctioned(targetUserId)) {
    return reply.code(409).send({ error: "user_sanctioned" });
  }
  if (!pool) return reply.code(503).send({ error: "database_unavailable" });

  const accessId = randomUUID();
  const sessionId = randomUUID();
  const roomName = `nexocam-admin-${sessionId}`;
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const previousQueue = target.queue;
  target.adminReservationId = accessId;
  await matcher.leave(targetUserId);
  target.queue = undefined;

  try {
    const tokens = await prepareRoom(roomName, [actor.id, targetUserId]);
    const targetToken = tokens.find((item) => item.identity === targetUserId)?.token;
    const actorToken = tokens.find((item) => item.identity === actor.id)?.token;
    if (!targetToken || !actorToken) throw new Error("LiveKit did not return both room tokens.");
    if (users.get(targetUserId)?.socketId !== target.socketId) {
      throw new Error("Target disconnected while the admin room was being prepared.");
    }
    await createSession(sessionId, roomName, actor.id, targetUserId);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into admin_user_access (
           id, actor_id, target_user_id, mode, session_id, room_name,
           participant_identity, reason, token_expires_at
         ) values ($1, $2, $3, 'connect', $4, $5, $6, $7, $8)`,
        [accessId, actor.id, targetUserId, sessionId, roomName, actor.id, parsed.data.reason, expiresAt]
      );
      await client.query(
        `insert into audit_log (actor_id, action, target_type, target_id, reason, metadata)
         values ($1, 'connected_user.connection_started', 'user', $2, $3, $4::jsonb)`,
        [
          actor.id,
          targetUserId,
          parsed.data.reason,
          JSON.stringify({ accessId, sessionId, roomName, tokenExpiresAt: expiresAt.toISOString() })
        ]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    sessions.set(sessionId, {
      id: sessionId,
      roomName,
      users: [actor.id, targetUserId],
      kind: "admin",
      startedAt: new Date().toISOString(),
      messages: []
    });
    target.sessionId = sessionId;
    target.peerId = actor.id;
    target.adminReservationId = undefined;
    send(target, "match.found", {
      sessionId,
      peerId: actor.id,
      roomName,
      token: targetToken,
      livekitUrl: config.livekitUrl,
      adminConnection: true
    });
    reply.header("cache-control", "no-store");
    return {
      accessId,
      sessionId,
      mode: "connect",
      targetUserId,
      token: actorToken,
      livekitUrl: config.livekitUrl,
      expiresAt: expiresAt.toISOString()
    };
  } catch (error) {
    target.adminReservationId = undefined;
    await closeSession(sessionId, "admin_connection_failed").catch(() => undefined);
    await terminateRoom(roomName);
    if (previousQueue && !target.sessionId && users.get(targetUserId)?.socketId === target.socketId) {
      target.queue = previousQueue;
      const retry = await matcher.join(previousQueue);
      await dispatchMatch(retry);
      if (!target.sessionId) send(target, "queue.state", { state: "searching", waiting: matcher.size });
    }
    request.log.error(error, "Unable to create dedicated superuser connection");
    return reply.code(503).send({ error: "connection_setup_failed" });
  }
});

app.post("/api/admin/live/access/:id/end", async (request, reply) => {
  if (!requireMutationOrigin(request, reply)) return;
  const actor = await requireRole(request, reply, ["superuser"]);
  if (!actor) return;
  const accessId = (request.params as { id: string }).id;
  const parsed = adminUserAccessEndSchema.safeParse(request.body ?? {});
  if (!uuidSchema.safeParse(accessId).success || !parsed.success) {
    return reply.code(400).send({ error: "invalid_admin_user_access_end" });
  }
  if (!pool) return reply.code(503).send({ error: "database_unavailable" });
  const client = await pool.connect();
  let ended: {
    mode: "preview" | "connect";
    session_id: string | null;
    room_name: string;
    participant_identity: string;
    target_user_id: string;
  } | undefined;
  try {
    await client.query("begin");
    const result = await client.query<{
      mode: "preview" | "connect";
      session_id: string | null;
      room_name: string;
      participant_identity: string;
      target_user_id: string;
    }>(
      `update admin_user_access
       set ended_at = now(), end_reason = $3
       where id = $1 and actor_id = $2 and ended_at is null
       returning mode, session_id, room_name, participant_identity, target_user_id`,
      [accessId, actor.id, parsed.data.endReason]
    );
    ended = result.rows[0];
    if (ended) {
      await client.query(
        `insert into audit_log (actor_id, action, target_type, target_id, reason, metadata)
         values ($1, $2, 'user', $3, $4, $5::jsonb)`,
        [
          actor.id,
          ended.mode === "connect"
            ? "connected_user.connection_ended"
            : "connected_user.preview_ended",
          ended.target_user_id,
          parsed.data.endReason,
          JSON.stringify({ accessId, sessionId: ended.session_id })
        ]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (ended?.mode === "preview") {
    await removeLiveReviewParticipant(ended.room_name, ended.participant_identity);
  }
  if (ended?.mode === "connect") {
    const target = users.get(ended.target_user_id);
    if (target && target.sessionId === ended.session_id) {
      await endSession(target, "admin_ended", false);
      send(target, "session.ended", { reason: "admin_ended" });
    } else {
      if (ended.session_id) await closeSession(ended.session_id, "admin_ended");
      await terminateRoom(ended.room_name);
    }
  }
  return { ended: Boolean(ended) };
});

app.get("/api/admin/audit", async (request, reply) => {
  const user = await requireRole(request, reply, ["superuser"]);
  if (!user) return;
  const raw = request.query as Record<string, unknown>;
  const pagination = paginationSchema.safeParse(raw);
  if (!pagination.success) return reply.code(400).send({ error: "invalid_pagination" });
  return listAudit({
    action: typeof raw.action === "string" ? raw.action.slice(0, 100) : undefined,
    actorId: typeof raw.actorId === "string" ? raw.actorId.slice(0, 128) : undefined,
    ...pagination.data
  });
});

app.post("/api/internal/moderation/heartbeat", async (request, reply) => {
  if (!internalAuthorized(request.headers.authorization)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  const parsed = z.object({
    status: z.enum(["healthy", "degraded", "offline"]).default("healthy"),
    activeSessions: z.number().int().min(0).max(config.maxConcurrentUsers).default(0),
    inflight: z.number().int().min(0).max(1_000).default(0),
    lagSeconds: z.number().min(0).max(86_400).default(0)
  }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_heartbeat" });
  await updateServiceHeartbeat({
    service: "moderation",
    status: parsed.data.status,
    details: {
      activeSessions: parsed.data.activeSessions,
      inflight: parsed.data.inflight,
      lagSeconds: parsed.data.lagSeconds
    }
  });
  return reply.code(202).send({ accepted: true });
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
  await storeEncryptedChatForEvent(eventId, session.id, session.messages);
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

app.post("/api/internal/moderation/report-evidence", async (request, reply) => {
  if (!internalAuthorized(request.headers.authorization)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  const parsed = reportEvidenceSchema.safeParse(request.body);
  if (!parsed.success || !pool) {
    return reply.code(parsed.success ? 503 : 400).send({
      error: parsed.success ? "database_unavailable" : "invalid_report_evidence"
    });
  }
  const input = parsed.data;
  const pending = pendingReportEvidence.get(input.sessionId);
  if (!pending || pending.reportId !== input.reportId || pending.expiresAt <= Date.now()) {
    pendingReportEvidence.delete(input.sessionId);
    return reply.code(404).send({ error: "evidence_request_not_found" });
  }
  const report = await pool.query(
    `select id from reports where id = $1 and session_id = $2 and reported_id = $3`,
    [input.reportId, input.sessionId, pending.reportedUserId]
  );
  if (!report.rowCount) return reply.code(404).send({ error: "report_not_found" });
  for (const item of input.evidence) {
    if (!item.objectKey.startsWith(`incidents/${input.sessionId}/`)) {
      return reply.code(400).send({ error: "invalid_evidence_object" });
    }
    await pool.query(
      `insert into evidence (report_id, object_key, media_type, sha256, encrypted_key)
       values ($1, $2, 'image', $3, 'env:EVIDENCE_ENCRYPTION_KEY')
       on conflict (object_key) do nothing`,
      [input.reportId, item.objectKey, item.sha256]
    );
  }
  await pool.query(
    `insert into audit_log (action, target_type, target_id, metadata)
     values ('evidence.capture', 'report', $1, $2::jsonb)`,
    [input.reportId, JSON.stringify({ source: "moderation", images: input.evidence.length })]
  );
  pendingReportEvidence.delete(input.sessionId);
  return reply.code(202).send({ accepted: true, images: input.evidence.length });
});

app.get("/api/internal/moderation/sessions", async (request, reply) => {
  if (!internalAuthorized(request.headers.authorization)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  const active = new Map(
    [...sessions.values()].map((session) => [session.id, {
      sessionId: session.id,
      roomName: session.roomName,
      evidenceRequest: undefined as { reportId: string; userId: string } | undefined
    }])
  );
  for (const [sessionId, pending] of pendingReportEvidence) {
    if (pending.expiresAt <= Date.now()) {
      pendingReportEvidence.delete(sessionId);
      continue;
    }
    const item = active.get(sessionId) ?? {
      sessionId,
      roomName: pending.roomName,
      evidenceRequest: undefined
    };
    item.evidenceRequest = { reportId: pending.reportId, userId: pending.reportedUserId };
    active.set(sessionId, item);
  }
  return [...active.values()];
});

async function matchFound(left: Client, right: Client) {
  const sessionId = randomUUID();
  const roomName = `nexocam-${sessionId}`;
  const tokens = await prepareRoom(roomName, [left.userId, right.userId]);
  try {
    await createSession(sessionId, roomName, left.userId, right.userId);
  } catch (error) {
    await terminateRoom(roomName);
    throw error;
  }
  sessions.set(sessionId, {
    id: sessionId,
    roomName,
    users: [left.userId, right.userId],
    kind: "random",
    startedAt: new Date().toISOString(),
    messages: []
  });
  left.sessionId = right.sessionId = sessionId;
  left.peerId = right.userId;
  right.peerId = left.userId;
  left.queue = right.queue = undefined;
  send(left, "match.found", { sessionId, peerId: right.userId, roomName, token: tokens[0]?.token, livekitUrl: config.livekitUrl });
  send(right, "match.found", { sessionId, peerId: left.userId, roomName, token: tokens[1]?.token, livekitUrl: config.livekitUrl });
}

async function dispatchMatch(result: Match | null, requestId?: string, attempt = 0): Promise<boolean> {
  if (!result) return false;

  const left = users.get(result.left.userId);
  const right = users.get(result.right.userId);
  const leftIsCurrent = left?.socketId === result.left.socketId
    && !left.adminReservationId
    && !left.matchSetup;
  const rightIsCurrent = right?.socketId === result.right.socketId
    && !right.adminReservationId
    && !right.matchSetup;

  if (!leftIsCurrent || !rightIsCurrent) {
    app.log.warn({
      leftUserId: result.left.userId,
      rightUserId: result.right.userId,
      leftIsCurrent,
      rightIsCurrent
    }, "Discarded a stale queue match");
    await Promise.all([
      matcher.release(result.left.userId),
      matcher.release(result.right.userId)
    ]);

    if (attempt >= 10) {
      for (const activeClient of [left, right]) {
        if (activeClient?.queue && !activeClient.sessionId) {
          send(activeClient, "queue.state", { state: "searching", waiting: matcher.size }, requestId);
        }
      }
      return false;
    }

    for (const activeClient of [left, right]) {
      if (!activeClient?.queue || activeClient.sessionId) continue;
      const retry = await matcher.join(activeClient.queue);
      if (retry && await dispatchMatch(retry, requestId, attempt + 1)) return true;
      send(activeClient, "queue.state", { state: "searching", waiting: matcher.size }, requestId);
    }
    return false;
  }

  left.matchSetup = true;
  right.matchSetup = true;
  try {
    await matchFound(left, right);
    return true;
  } catch (error) {
    await Promise.all([
      matcher.release(left.userId),
      matcher.release(right.userId)
    ]);
    left.queue = right.queue = undefined;
    const payload = {
      code: "MATCH_SETUP_FAILED",
      message: "The video service could not create the room. Check the LiveKit deployment."
    };
    send(left, "error", payload, requestId);
    send(right, "error", payload, requestId);
    app.log.error({
      err: error,
      leftUserId: left.userId,
      rightUserId: right.userId,
      livekitPublicUrl: config.livekitUrl,
      livekitInternalUrl: config.livekitInternalUrl
    }, "Unable to create a LiveKit match");
    return false;
  } finally {
    left.matchSetup = false;
    right.matchSetup = false;
  }
}

async function expireLiveReviews() {
  if (!pool) return;
  const expired = await pool.query<{
    id: string;
    actor_id: string;
    session_id: string;
    room_name: string;
    participant_identity: string;
    mode: "observe" | "connect";
    target_user_id: string | null;
  }>(
    `with ended as (
       update live_reviews
       set ended_at = now(), end_reason = 'token_expired'
       where ended_at is null and token_expires_at <= now()
       returning id, actor_id, session_id, room_name, participant_identity, mode, target_user_id
     ), audited as (
       insert into audit_log (actor_id, action, target_type, target_id, reason, metadata)
       select actor_id,
              case when mode = 'connect' then 'live_connection.ended' else 'live_review.ended' end,
              'video_session', session_id::text,
              'token_expired',
              jsonb_build_object(
                'reviewId', id,
                'participantIdentity', participant_identity,
                'mode', mode,
                'targetUserId', target_user_id
              )
       from ended
     )
     select id, actor_id, session_id, room_name, participant_identity, mode, target_user_id from ended`
  );
  await Promise.all(expired.rows.map((review) =>
    removeLiveReviewParticipant(review.room_name, review.participant_identity)
  ));
}

async function expireAdminUserAccesses() {
  if (!pool) return;
  const expired = await pool.query<{
    id: string;
    mode: "preview" | "connect";
    session_id: string | null;
    room_name: string;
    participant_identity: string;
    target_user_id: string;
  }>(
    `with ended as (
       update admin_user_access
       set ended_at = now(), end_reason = 'token_expired'
       where ended_at is null and token_expires_at <= now()
       returning id, actor_id, target_user_id, mode, session_id, room_name, participant_identity
     ), audited as (
       insert into audit_log (actor_id, action, target_type, target_id, reason, metadata)
       select actor_id,
              case when mode = 'connect'
                then 'connected_user.connection_ended'
                else 'connected_user.preview_ended'
              end,
              'user', target_user_id, 'token_expired',
              jsonb_build_object('accessId', id, 'sessionId', session_id)
       from ended
     )
     select id, mode, session_id, room_name, participant_identity, target_user_id from ended`
  );
  for (const access of expired.rows) {
    if (access.mode === "preview") {
      await removeLiveReviewParticipant(access.room_name, access.participant_identity);
      continue;
    }
    const target = users.get(access.target_user_id);
    if (target && target.sessionId === access.session_id) {
      await endSession(target, "admin_connection_expired", false);
      send(target, "session.ended", { reason: "admin_connection_expired" });
    } else {
      if (access.session_id) await closeSession(access.session_id, "admin_connection_expired");
      await terminateRoom(access.room_name);
    }
  }
}

async function endSession(client: Client, reason: string, notifyPeer = true) {
  if (!client.sessionId) return;
  const session = sessions.get(client.sessionId);
  const peer = session?.kind === "admin"
    ? undefined
    : client.peerId
      ? users.get(client.peerId)
      : undefined;
  if (session) {
    sessions.delete(session.id);
    if (pool) {
      const reviews = await pool.query<{ room_name: string; participant_identity: string }>(
        `with ended as (
           update live_reviews
           set ended_at = now(), end_reason = 'room_ended'
           where session_id = $1 and ended_at is null
           returning id, actor_id, session_id, room_name, participant_identity, mode, target_user_id
         ), audited as (
           insert into audit_log (actor_id, action, target_type, target_id, reason, metadata)
           select actor_id,
                  case when mode = 'connect' then 'live_connection.ended' else 'live_review.ended' end,
                  'video_session', session_id::text,
                  'room_ended',
                  jsonb_build_object(
                    'reviewId', id,
                    'participantIdentity', participant_identity,
                    'mode', mode,
                    'targetUserId', target_user_id
                  )
           from ended
         )
         select room_name, participant_identity from ended`,
        [session.id]
      );
      await Promise.all(reviews.rows.map((review) =>
        removeLiveReviewParticipant(review.room_name, review.participant_identity)
      ));
    }
    await closeSession(session.id, reason);
    await terminateRoom(session.roomName);
    await Promise.all(session.users.map((id) => matcher.release(id)));
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
  const query = request.query as { user?: string; ticket?: string };
  const authenticated = await sessionUser(requestHeaders(request));
  const suppliedTicket = websocketTicketFromProtocols(
    request.headers["sec-websocket-protocol"],
    query.ticket
  );
  const ticketUserId = suppliedTicket
    ? consumeWsTicket(suppliedTicket, config.authSecret)
    : null;
  if (authenticated && ticketUserId && authenticated.id !== ticketUserId) {
    clientSocket.close(1008, "Authentication mismatch");
    return;
  }
  if (!authenticated && !ticketUserId && !config.demoMode) {
    clientSocket.close(1008, "Authentication required");
    return;
  }
  const userId = authenticated?.id ?? ticketUserId ?? (query.user ? query.user.slice(0, 128) : randomUUID());
  if (users.has(userId)) {
    clientSocket.close(1008, "Duplicate connection");
    return;
  }
  const client: Client = {
    userId,
    socketId: randomUUID(),
    socket: clientSocket,
    connectedAt: new Date().toISOString()
  };
  clients.set(client.socketId, client);
  users.set(userId, client);

  const previewRoomName = `nexocam-preview-${randomUUID()}`;
  client.previewRoomName = previewRoomName;
  void prepareUserPreviewRoom(previewRoomName, userId)
    .then((preview) => {
      if (users.get(userId)?.socketId !== client.socketId) {
        return terminateRoom(previewRoomName);
      }
      send(client, "presence.preview", {
        roomName: preview.roomName,
        token: preview.token,
        livekitUrl: config.livekitUrl
      });
    })
    .catch((error) => {
      client.previewRoomName = undefined;
      request.log.error({ err: error, userId }, "Unable to prepare camera-presence room");
    });

  clientSocket.on("message", async (raw: Buffer | string) => {
    let requestId: string | undefined;
    try {
      const message = wsEnvelopeSchema.parse(JSON.parse(raw.toString()));
      requestId = message.requestId;
      if (!clientEventTypes.includes(message.type as (typeof clientEventTypes)[number])) throw new Error("Unknown event");
      if (message.type === "presence.preview.ready") {
        client.previewReady = true;
        return;
      }
      if (message.type === "presence.preview.unavailable") {
        client.previewReady = false;
        return;
      }
      if (message.type === "heartbeat") {
        if (client.queue && !client.sessionId && !client.adminReservationId && !client.matchSetup) {
          const result = await matcher.join(client.queue);
          if (await dispatchMatch(result, message.requestId)) return;
        }
        send(client, "queue.state", { waiting: matcher.size, stages: matcher.stageCounts }, message.requestId);
        return;
      }
      if (message.type === "queue.join") {
        if (client.adminReservationId || client.matchSetup) {
          send(client, "queue.state", { state: "reserved" }, message.requestId);
          return;
        }
        if (await isSanctioned(userId)) {
          send(client, "account.sanctioned", { reason: "active-sanction" }, message.requestId);
          return;
        }
        const filter = queueJoinSchema.parse(message.payload);
        client.queue = { userId, socketId: client.socketId, ...filter, joinedAt: Date.now() };
        const result = await matcher.join(client.queue);
        if (result) await dispatchMatch(result, message.requestId);
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
        if (result) await dispatchMatch(result, message.requestId);
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
        const features = await getFeatureFlags();
        if (!features.reporting) {
          send(client, "error", { code: "FEATURE_DISABLED", message: "Reporting is currently disabled." }, message.requestId);
          return;
        }
        const report = reportSchema.parse({ ...message.payload, sessionId: client.sessionId, reportedUserId: client.peerId });
        const session = sessions.get(report.sessionId);
        const reportId = await createReport({
          reporterId: userId,
          reportedId: report.reportedUserId,
          sessionId: report.sessionId,
          reason: report.reason,
          details: report.details
        });
        if (session) {
          try {
            await storeEncryptedChatForReport(reportId, session.id, session.messages);
          } catch (error) {
            app.log.error({ err: error, reportId, sessionId: session.id }, "Unable to retain report chat evidence");
          }
          if (features.moderation) {
            pendingReportEvidence.set(session.id, {
              reportId,
              sessionId: session.id,
              roomName: session.roomName,
              reportedUserId: report.reportedUserId,
              expiresAt: Date.now() + 20_000
            });
          }
        }
        if (report.reason === "possible_minor" && client.peerId && pool) {
          await pool.query(
            `insert into sanctions (user_id, type, reason, automatic, expires_at)
             values ($1, 'temporary_hold', 'possible_minor_report', true, now() + interval '24 hours')`,
            [client.peerId]
          );
        }
        await endSession(client, `reported:${report.reason}`);
        send(client, "session.ended", {
          reason: "reported",
          reportId,
          evidenceStatus: features.moderation ? "capturing" : "chat-only"
        }, message.requestId);
      }
    } catch (error) {
      app.log.warn({ err: error, userId }, "WebSocket message failed");
      send(client, "error", { code: "INVALID_MESSAGE", message: "The message could not be processed." }, requestId);
    }
  });

  clientSocket.on("close", async () => {
    await matcher.leave(userId);
    await endSession(client, "disconnect");
    if (client.previewRoomName) await terminateRoom(client.previewRoomName);
    clients.delete(client.socketId);
    users.delete(userId);
  });
});

if (config.nodeEnv === "production") {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "../../../dist/client");
  await app.register(staticPlugin, { root });
  app.setNotFoundHandler((_request, reply) => reply.sendFile("index.html"));
}

await syncConfiguredSuperusers()
  .then((promoted) => {
    if (promoted > 0) app.log.info({ promoted }, "Configured superusers synchronized");
  })
  .catch((error) => app.log.warn(error, "Unable to synchronize configured superusers"));

await app.listen({ port: config.port, host: "0.0.0.0" });
const metricsTimer = setInterval(() => {
  void recordOperationalMetric({
    connectedUsers: clients.size,
    queuedUsers: matcher.size,
    activeSessions: sessions.size
  }).catch((error) => app.log.error(error, "Operational metric collection failed"));
}, 30 * 1000);
metricsTimer.unref();
const retentionTimer = setInterval(() => {
  void purgeExpiredEvidence().catch((error) => app.log.error(error, "Evidence retention failed"));
}, 24 * 60 * 60 * 1000);
retentionTimer.unref();
const liveReviewTimer = setInterval(() => {
  void Promise.all([expireLiveReviews(), expireAdminUserAccesses()])
    .catch((error) => app.log.error(error, "Live-access expiration failed"));
}, 15 * 1000);
liveReviewTimer.unref();
