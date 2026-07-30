import { config } from "./config.js";
import { pool } from "./db.js";

export const adminRoles = ["moderator", "admin", "superuser"] as const;
export const roles = ["user", ...adminRoles] as const;
export type Role = (typeof roles)[number];

const rolePermissions: Record<Role, string[]> = {
  user: [],
  moderator: ["reports:read", "reports:review", "evidence:read", "holds:create"],
  admin: [
    "reports:read",
    "reports:review",
    "evidence:read",
    "holds:create",
    "users:read",
    "sanctions:read",
    "sanctions:write"
  ],
  superuser: [
    "overview:read",
    "features:read",
    "features:write",
    "users:read",
    "users:roles",
    "reports:read",
    "reports:review",
    "evidence:read",
    "holds:create",
    "sanctions:read",
    "sanctions:write",
    "monitoring:read",
    "audit:read"
  ]
};

export const permissionsFor = (role: Role) => rolePermissions[role] ?? [];
export const isRole = (value: string): value is Role => roles.includes(value as Role);

export function roleChangeViolation(input: {
  actorId: string;
  targetId: string;
  targetEmail: string;
  targetRole: Role;
  targetIsGuest: boolean;
  requestedRole: Role;
  confirmEmail?: string;
  superuserCount: number;
}) {
  if (input.actorId === input.targetId && input.requestedRole !== "superuser") {
    return "cannot_demote_self" as const;
  }
  if (input.targetIsGuest && input.requestedRole !== "user") {
    return "guest_role_forbidden" as const;
  }
  if (input.targetRole === "superuser" && input.requestedRole !== "superuser") {
    if (input.confirmEmail?.toLowerCase() !== input.targetEmail.toLowerCase()) {
      return "confirmation_required" as const;
    }
    if (input.superuserCount <= 1) return "last_superuser" as const;
  }
  return null;
}

export function sanctionViolation(input: {
  actorId: string;
  actorRole: Role;
  targetId: string;
  targetEmail: string;
  targetRole: Role;
  confirmEmail?: string;
  superuserCount: number;
}) {
  if (input.actorId === input.targetId) return "cannot_sanction_self" as const;
  if (input.targetRole !== "superuser") return null;
  if (input.actorRole !== "superuser") return "forbidden_target" as const;
  if (input.confirmEmail?.toLowerCase() !== input.targetEmail.toLowerCase()) {
    return "confirmation_required" as const;
  }
  if (input.superuserCount <= 1) return "last_superuser" as const;
  return null;
}

async function recordAudit(input: {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!pool) return;
  await pool.query(
    `insert into audit_log (actor_id, action, target_type, target_id, reason, metadata)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.actorId ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.reason ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export async function ensureConfiguredSuperuser(user: { id: string; email?: string | null }) {
  if (!pool || !user.email || !config.superuserEmails.includes(user.email.toLowerCase())) return false;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const updated = await client.query<{ id: string }>(
      `update "user"
       set role = 'superuser', "updatedAt" = now()
       where id = $1
         and coalesce("isAnonymous", false) = false
         and coalesce(role, 'user') <> 'superuser'
       returning id`,
      [user.id]
    );
    if (!updated.rowCount) {
      await client.query("rollback");
      return false;
    }
    await client.query(`update profiles set role = 'superuser' where user_id = $1`, [user.id]);
    await client.query(
      `insert into audit_log (actor_id, action, target_type, target_id, reason)
       values (null, 'superuser.bootstrap', 'user', $1, 'Configured through SUPERUSER_EMAILS')`,
      [user.id]
    );
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function syncConfiguredSuperusers() {
  if (!pool || config.superuserEmails.length === 0) return 0;
  const result = await pool.query<{ id: string; email: string }>(
    `select id, email
     from "user"
     where coalesce("isAnonymous", false) = false
       and lower(email) = any($1::text[])`,
    [config.superuserEmails]
  );
  let promoted = 0;
  for (const user of result.rows) {
    if (await ensureConfiguredSuperuser(user)) promoted += 1;
  }
  return promoted;
}

export type UserListFilters = {
  query?: string;
  role?: Role;
  status?: "active" | "sanctioned";
  limit: number;
  offset: number;
};

export async function listAdminUsers(filters: UserListFilters) {
  if (!pool) return { items: [], total: 0 };
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.query) {
    values.push(`%${filters.query}%`);
    where.push(`(u.email ilike $${values.length} or u.name ilike $${values.length})`);
  }
  if (filters.role) {
    values.push(filters.role);
    where.push(`coalesce(u.role, 'user') = $${values.length}`);
  }
  if (filters.status === "sanctioned") {
    where.push(`exists (
      select 1 from sanctions sx
      where sx.user_id = u.id and sx.status = 'active'
        and (sx.expires_at is null or sx.expires_at > now())
    )`);
  }
  if (filters.status === "active") {
    where.push(`not exists (
      select 1 from sanctions sx
      where sx.user_id = u.id and sx.status = 'active'
        and (sx.expires_at is null or sx.expires_at > now())
    )`);
  }
  const predicate = where.length ? `where ${where.join(" and ")}` : "";
  values.push(filters.limit, filters.offset);
  const result = await pool.query(
    `select
       u.id, u.name, u.email, u."emailVerified" as email_verified,
       coalesce(u.role, 'user') as role,
       coalesce(u."isAnonymous", false) as is_guest,
       u."createdAt" as created_at,
       exists (
         select 1 from sanctions sx
         where sx.user_id = u.id and sx.status = 'active'
           and (sx.expires_at is null or sx.expires_at > now())
       ) as sanctioned,
       (select count(*)::int from reports r where r.reported_id = u.id) as report_count,
       count(*) over()::int as total_count
     from "user" u
     ${predicate}
     order by u."createdAt" desc
     limit $${values.length - 1} offset $${values.length}`,
    values
  );
  return {
    items: result.rows.map(({ total_count: _total, ...row }) => row),
    total: Number(result.rows[0]?.total_count ?? 0)
  };
}

export async function getAdminUser(userId: string) {
  if (!pool) return null;
  const result = await pool.query(
    `select
       u.id, u.name, u.email, u."emailVerified" as email_verified,
       coalesce(u.role, 'user') as role,
       coalesce(u."isAnonymous", false) as is_guest,
       u."createdAt" as created_at,
       (select count(*)::int from video_sessions vs where vs.user_a_id = u.id or vs.user_b_id = u.id) as session_count,
       (select count(*)::int from reports r where r.reported_id = u.id) as report_count,
       coalesce((
         select json_agg(json_build_object(
           'id', s.id,
           'type', s.type,
           'status', s.status,
           'reason', s.reason,
           'automatic', s.automatic,
           'createdAt', s.created_at,
           'expiresAt', s.expires_at
         ) order by s.created_at desc)
         from sanctions s where s.user_id = u.id
       ), '[]'::json) as sanctions
     from "user" u
     where u.id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function updateAdminUserRole(input: {
  actorId: string;
  targetId: string;
  role: Role;
  reason: string;
  confirmEmail?: string;
}) {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const targetResult = await client.query<{ id: string; email: string; role: Role; is_guest: boolean }>(
      `select id, email, coalesce(role, 'user') as role,
              coalesce("isAnonymous", false) as is_guest
       from "user" where id = $1 for update`,
      [input.targetId]
    );
    const target = targetResult.rows[0];
    if (!target) {
      await client.query("rollback");
      return { error: "not_found" as const };
    }
    let superuserCount = Number.POSITIVE_INFINITY;
    if (target.role === "superuser" && input.role !== "superuser") {
      const count = await client.query<{ total: number }>(
        `select count(*)::int as total from "user" where coalesce(role, 'user') = 'superuser'`
      );
      superuserCount = Number(count.rows[0]?.total ?? 0);
    }
    const violation = roleChangeViolation({
      actorId: input.actorId,
      targetId: target.id,
      targetEmail: target.email,
      targetRole: target.role,
      targetIsGuest: target.is_guest,
      requestedRole: input.role,
      confirmEmail: input.confirmEmail,
      superuserCount
    });
    if (violation) {
      await client.query("rollback");
      return { error: violation };
    }
    await client.query(
      `update "user" set role = $2, "updatedAt" = now() where id = $1`,
      [target.id, input.role]
    );
    await client.query(`update profiles set role = $2 where user_id = $1`, [target.id, input.role]);
    await client.query(
      `insert into audit_log (actor_id, action, target_type, target_id, reason, metadata)
       values ($1, 'user.role.updated', 'user', $2, $3, $4::jsonb)`,
      [input.actorId, target.id, input.reason, JSON.stringify({ from: target.role, to: input.role })]
    );
    await client.query("commit");
    return { user: { ...target, role: input.role } };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listReports(filters: {
  status?: string;
  priority?: string;
  reason?: string;
  limit: number;
  offset: number;
}) {
  if (!pool) return { items: [], total: 0 };
  const values: unknown[] = [];
  const where: string[] = [];
  for (const [column, value] of [
    ["r.status", filters.status],
    ["r.priority", filters.priority],
    ["r.reason", filters.reason]
  ] as const) {
    if (!value) continue;
    values.push(value);
    where.push(`${column} = $${values.length}`);
  }
  const predicate = where.length ? `where ${where.join(" and ")}` : "";
  values.push(filters.limit, filters.offset);
  const result = await pool.query(
    `select
       r.id, r.reason, r.details, r.priority, r.status, r.created_at,
       r.reporter_id, r.reported_id, r.session_id,
       reporter.email as reporter_email,
       reported.email as reported_email,
       count(e.id)::int as evidence_count,
       count(*) over()::int as total_count
     from reports r
     left join "user" reporter on reporter.id = r.reporter_id
     left join "user" reported on reported.id = r.reported_id
     left join evidence e on e.report_id = r.id and e.expires_at > now()
     ${predicate}
     group by r.id, reporter.email, reported.email
     order by
       case r.priority when 'urgent' then 0 when 'high' then 1 else 2 end,
       r.created_at desc
     limit $${values.length - 1} offset $${values.length}`,
    values
  );
  return {
    items: result.rows.map(({ total_count: _total, ...row }) => row),
    total: Number(result.rows[0]?.total_count ?? 0)
  };
}

export async function getReport(reportId: string) {
  if (!pool) return null;
  const report = await pool.query(
    `select
       r.*, reporter.email as reporter_email, reported.email as reported_email,
       coalesce((
         select json_agg(json_build_object(
           'id', e.id,
           'mediaType', e.media_type,
           'createdAt', e.created_at,
           'expiresAt', e.expires_at
         ) order by e.created_at asc)
         from evidence e
         where e.report_id = r.id and e.expires_at > now()
       ), '[]'::json) as evidence,
       coalesce((
         select json_agg(json_build_object(
           'id', s.id,
           'type', s.type,
           'status', s.status,
           'reason', s.reason,
           'createdAt', s.created_at,
           'expiresAt', s.expires_at
         ) order by s.created_at desc)
         from sanctions s where s.user_id = r.reported_id
       ), '[]'::json) as sanctions
     from reports r
     left join "user" reporter on reporter.id = r.reporter_id
     left join "user" reported on reported.id = r.reported_id
     where r.id = $1`,
    [reportId]
  );
  return report.rows[0] ?? null;
}

export async function applyReportAction(input: {
  actorId: string;
  reportId: string;
  action: "start_review" | "resolve" | "dismiss" | "temporary_hold";
  reason: string;
  durationHours?: number;
}) {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const reportResult = await client.query<{
      id: string;
      reported_id: string;
      status: string;
      reported_role: Role;
    }>(
      `select r.id, r.reported_id, r.status, coalesce(u.role, 'user') as reported_role
       from reports r
       left join "user" u on u.id = r.reported_id
       where r.id = $1
       for update of r`,
      [input.reportId]
    );
    const report = reportResult.rows[0];
    if (!report) {
      await client.query("rollback");
      return null;
    }
    if (input.action === "temporary_hold" && report.reported_role === "superuser") {
      await client.query("rollback");
      return { error: "forbidden_target" as const };
    }
    const status = input.action === "start_review"
      ? "reviewing"
      : input.action === "dismiss"
        ? "dismissed"
        : "resolved";
    await client.query(
      `update reports
       set status = $2,
           resolved_at = case when $2 in ('resolved', 'dismissed') then now() else null end,
           resolved_by = case when $2 in ('resolved', 'dismissed') then $3 else resolved_by end
       where id = $1`,
      [report.id, status, input.actorId]
    );
    let sanctionId: string | undefined;
    if (input.action === "temporary_hold") {
      const sanction = await client.query<{ id: string }>(
        `insert into sanctions (user_id, type, reason, automatic, created_by, expires_at)
         values ($1, 'temporary_hold', $2, false, $3, now() + make_interval(hours => $4))
         returning id`,
        [report.reported_id, input.reason, input.actorId, input.durationHours ?? 24]
      );
      sanctionId = sanction.rows[0]?.id;
    }
    await client.query(
      `insert into audit_log (actor_id, action, target_type, target_id, reason, metadata)
       values ($1, $2, 'report', $3, $4, $5::jsonb)`,
      [
        input.actorId,
        `report.${input.action}`,
        report.id,
        input.reason,
        JSON.stringify({ sanctionId, durationHours: input.durationHours })
      ]
    );
    await client.query("commit");
    return { reportId: report.id, reportedUserId: report.reported_id, status, sanctionId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listSanctions(filters: {
  status?: string;
  limit: number;
  offset: number;
}) {
  if (!pool) return { items: [], total: 0 };
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.status) {
    values.push(filters.status);
    where.push(`s.status = $${values.length}`);
  }
  const predicate = where.length ? `where ${where.join(" and ")}` : "";
  values.push(filters.limit, filters.offset);
  const result = await pool.query(
    `select
       s.*, u.email as user_email, coalesce(u.role, 'user') as user_role,
       count(*) over()::int as total_count
     from sanctions s
     left join "user" u on u.id = s.user_id
     ${predicate}
     order by s.created_at desc
     limit $${values.length - 1} offset $${values.length}`,
    values
  );
  return {
    items: result.rows.map(({ total_count: _total, ...row }) => row),
    total: Number(result.rows[0]?.total_count ?? 0)
  };
}

export async function createSanction(input: {
  actorId: string;
  actorRole: Role;
  userId: string;
  type: "temporary_hold" | "suspension";
  reason: string;
  expiresAt?: string;
  confirmEmail?: string;
}) {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const targetResult = await client.query<{ id: string; email: string; role: Role }>(
      `select id, email, coalesce(role, 'user') as role from "user" where id = $1 for update`,
      [input.userId]
    );
    const target = targetResult.rows[0];
    if (!target) {
      await client.query("rollback");
      return { error: "not_found" as const };
    }
    let superuserCount = Number.POSITIVE_INFINITY;
    if (target.role === "superuser") {
      const count = await client.query<{ total: number }>(
        `select count(*)::int as total from "user" where coalesce(role, 'user') = 'superuser'`
      );
      superuserCount = Number(count.rows[0]?.total ?? 0);
    }
    const violation = sanctionViolation({
      actorId: input.actorId,
      actorRole: input.actorRole,
      targetId: target.id,
      targetEmail: target.email,
      targetRole: target.role,
      confirmEmail: input.confirmEmail,
      superuserCount
    });
    if (violation) {
      await client.query("rollback");
      return { error: violation };
    }
    const sanction = await client.query(
      `insert into sanctions (user_id, type, reason, automatic, created_by, expires_at)
       values ($1, $2, $3, false, $4, $5)
       returning *`,
      [target.id, input.type, input.reason, input.actorId, input.expiresAt ?? null]
    );
    await client.query(
      `insert into audit_log (actor_id, action, target_type, target_id, reason, metadata)
       values ($1, 'sanction.created', 'user', $2, $3, $4::jsonb)`,
      [input.actorId, target.id, input.reason, JSON.stringify({ sanctionId: sanction.rows[0]?.id, type: input.type })]
    );
    await client.query("commit");
    return { sanction: sanction.rows[0], target };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeSanction(input: { actorId: string; sanctionId: string; reason: string }) {
  if (!pool) return null;
  const result = await pool.query(
    `update sanctions
     set status = 'revoked', revoked_at = now()
     where id = $1 and status = 'active'
     returning *`,
    [input.sanctionId]
  );
  const sanction = result.rows[0];
  if (!sanction) return null;
  await recordAudit({
    actorId: input.actorId,
    action: "sanction.revoked",
    targetType: "sanction",
    targetId: input.sanctionId,
    reason: input.reason,
    metadata: { userId: sanction.user_id }
  });
  return sanction;
}

export async function listAudit(filters: {
  action?: string;
  actorId?: string;
  limit: number;
  offset: number;
}) {
  if (!pool) return { items: [], total: 0 };
  const values: unknown[] = [];
  const where: string[] = [];
  if (filters.action) {
    values.push(filters.action);
    where.push(`a.action = $${values.length}`);
  }
  if (filters.actorId) {
    values.push(filters.actorId);
    where.push(`a.actor_id = $${values.length}`);
  }
  const predicate = where.length ? `where ${where.join(" and ")}` : "";
  values.push(filters.limit, filters.offset);
  const result = await pool.query(
    `select
       a.*, u.email as actor_email, count(*) over()::int as total_count
     from audit_log a
     left join "user" u on u.id = a.actor_id
     ${predicate}
     order by a.created_at desc
     limit $${values.length - 1} offset $${values.length}`,
    values
  );
  return {
    items: result.rows.map(({ total_count: _total, ...row }) => row),
    total: Number(result.rows[0]?.total_count ?? 0)
  };
}

export async function recordOperationalMetric(input: {
  connectedUsers: number;
  queuedUsers: number;
  activeSessions: number;
}) {
  if (!pool) return;
  const flags = await pool.query<{ enabled: boolean }>(
    `select enabled from feature_flags where key = 'monitoring'`
  );
  if (flags.rows[0]?.enabled === false) return;
  await pool.query(
    `insert into operational_metrics (
       connected_users, queued_users, active_sessions, open_reports, moderation_lag_seconds
     )
     values (
       $1, $2, $3,
       (select count(*)::int from reports where status in ('pending', 'reviewing')),
       (
         select greatest(0, extract(epoch from (now() - updated_at)))::int
         from service_heartbeats where service = 'moderation'
       )
     )`,
    [input.connectedUsers, input.queuedUsers, input.activeSessions]
  );
  await pool.query(`delete from operational_metrics where recorded_at < now() - interval '7 days'`);
}

export async function getOperationalMetrics(hours = 24) {
  if (!pool) return [];
  const result = await pool.query(
    `select * from operational_metrics
     where recorded_at >= now() - make_interval(hours => $1)
     order by recorded_at asc
     limit 2880`,
    [hours]
  );
  return result.rows;
}

export async function updateServiceHeartbeat(input: {
  service: string;
  status: "healthy" | "degraded" | "offline";
  details: Record<string, unknown>;
}) {
  if (!pool) return;
  await pool.query(
    `insert into service_heartbeats (service, status, details, updated_at)
     values ($1, $2, $3::jsonb, now())
     on conflict (service) do update
     set status = excluded.status, details = excluded.details, updated_at = excluded.updated_at`,
    [input.service, input.status, JSON.stringify(input.details)]
  );
}

export async function getServiceHeartbeats() {
  if (!pool) return [];
  const result = await pool.query(
    `select service,
       case when updated_at < now() - interval '20 seconds' then 'offline' else status end as status,
       details, updated_at
     from service_heartbeats order by service`
  );
  return result.rows;
}

export async function getOverviewDatabaseCounts() {
  if (!pool) return {
    openReports: 0,
    urgentReports: 0,
    activeSanctions: 0,
    registeredUsers: 0
  };
  const result = await pool.query<{
    open_reports: number;
    urgent_reports: number;
    active_sanctions: number;
    registered_users: number;
  }>(
    `select
       (select count(*)::int from reports where status in ('pending', 'reviewing')) as open_reports,
       (select count(*)::int from reports where status in ('pending', 'reviewing') and priority = 'urgent') as urgent_reports,
       (select count(*)::int from sanctions where status = 'active' and (expires_at is null or expires_at > now())) as active_sanctions,
       (select count(*)::int from "user" where coalesce("isAnonymous", false) = false) as registered_users`
  );
  const row = result.rows[0];
  return {
    openReports: Number(row?.open_reports ?? 0),
    urgentReports: Number(row?.urgent_reports ?? 0),
    activeSanctions: Number(row?.active_sanctions ?? 0),
    registeredUsers: Number(row?.registered_users ?? 0)
  };
}
