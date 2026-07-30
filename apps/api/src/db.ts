import pg from "pg";
import { config } from "./config.js";

export const pool = config.databaseUrl
  ? new pg.Pool({ connectionString: config.databaseUrl, max: 20 })
  : null;

export async function isBlocked(left: string, right: string) {
  if (!pool) return false;
  const result = await pool.query(
    `select 1 from blocks
     where (blocker_id = $1 and blocked_id = $2)
        or (blocker_id = $2 and blocked_id = $1)
     limit 1`,
    [left, right]
  );
  return result.rowCount === 1;
}

export async function isSanctioned(userId: string) {
  if (!pool) return false;
  const result = await pool.query(
    `select 1 from sanctions
     where user_id = $1 and status = 'active'
       and (expires_at is null or expires_at > now())
     limit 1`,
    [userId]
  );
  return result.rowCount === 1;
}

export async function createSession(id: string, roomName: string, left: string, right: string) {
  if (!pool) return;
  await pool.query(
    `insert into video_sessions (id, room_name, user_a_id, user_b_id, status)
     values ($1, $2, $3, $4, 'active')`,
    [id, roomName, left, right]
  );
}

export async function closeSession(id: string, reason: string) {
  if (!pool) return;
  await pool.query(
    `update video_sessions set status = 'ended', ended_at = now(), end_reason = $2 where id = $1 and status = 'active'`,
    [id, reason]
  );
}

export async function createBlock(blockerId: string, blockedId: string, sessionId: string | undefined) {
  if (!pool) return;
  await pool.query(
    `insert into blocks (blocker_id, blocked_id, session_id)
     values ($1, $2, $3) on conflict (blocker_id, blocked_id) do nothing`,
    [blockerId, blockedId, sessionId ?? null]
  );
}

export async function createReport(input: {
  reporterId: string;
  reportedId: string;
  sessionId: string;
  reason: string;
  details?: string;
}) {
  if (!pool) return crypto.randomUUID();
  const id = crypto.randomUUID();
  await pool.query(
    `insert into reports (id, reporter_id, reported_id, session_id, reason, details, status, priority)
     values ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
    [id, input.reporterId, input.reportedId, input.sessionId, input.reason, input.details ?? null, input.reason === "possible_minor" ? "urgent" : "normal"]
  );
  return id;
}
