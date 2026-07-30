create extension if not exists pgcrypto;

create table if not exists profiles (
  user_id text primary key,
  display_name text not null,
  date_of_birth date not null,
  country char(2),
  language char(2) not null default 'es',
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at timestamptz not null default now(),
  check (date_of_birth <= current_date - interval '18 years')
);

create table if not exists video_sessions (
  id uuid primary key,
  room_name text not null unique,
  user_a_id text not null,
  user_b_id text not null,
  status text not null check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text
);
create index if not exists video_sessions_users_idx on video_sessions (user_a_id, user_b_id, started_at desc);

create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id text not null,
  blocked_id text not null,
  session_id uuid references video_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_reverse_idx on blocks (blocked_id, blocker_id);

create table if not exists reports (
  id uuid primary key,
  reporter_id text not null,
  reported_id text not null,
  session_id uuid not null references video_sessions(id),
  reason text not null check (reason in ('nudity', 'harassment', 'violence', 'spam', 'possible_minor')),
  details text,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
create index if not exists reports_queue_idx on reports (status, priority desc, created_at);

create table if not exists moderation_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references video_sessions(id),
  user_id text not null,
  source text not null check (source in ('classifier', 'report', 'moderator')),
  label text not null,
  confidence numeric(5,4),
  created_at timestamptz not null default now()
);

create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  moderation_event_id uuid references moderation_events(id) on delete cascade,
  object_key text not null unique,
  media_type text not null check (media_type in ('image', 'chat')),
  sha256 text not null,
  encrypted_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  check (report_id is not null or moderation_event_id is not null)
);
create index if not exists evidence_expiry_idx on evidence (expires_at);

create table if not exists sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null check (type in ('temporary_hold', 'suspension')),
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  reason text not null,
  automatic boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  check (not (type = 'suspension' and automatic))
);
create index if not exists sanctions_active_idx on sanctions (user_id, status, expires_at);

create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  ip_hash text,
  unique (user_id, kind, version)
);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  actor_id text,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_target_idx on audit_log (target_type, target_id, created_at desc);
