alter table audit_log add column if not exists reason text;

create table if not exists operational_metrics (
  id bigint generated always as identity primary key,
  connected_users integer not null default 0 check (connected_users >= 0),
  queued_users integer not null default 0 check (queued_users >= 0),
  active_sessions integer not null default 0 check (active_sessions >= 0),
  open_reports integer not null default 0 check (open_reports >= 0),
  moderation_lag_seconds integer check (moderation_lag_seconds is null or moderation_lag_seconds >= 0),
  recorded_at timestamptz not null default now()
);
create index if not exists operational_metrics_recorded_idx
  on operational_metrics (recorded_at desc);

create table if not exists service_heartbeats (
  service text primary key check (service ~ '^[a-z][a-z0-9_-]{1,63}$'),
  status text not null default 'healthy' check (status in ('healthy', 'degraded', 'offline')),
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists reports_reported_user_idx
  on reports (reported_id, created_at desc);
create index if not exists sanctions_created_idx
  on sanctions (created_at desc);
create index if not exists audit_log_created_idx
  on audit_log (created_at desc);
