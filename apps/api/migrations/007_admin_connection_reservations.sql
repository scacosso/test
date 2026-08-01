create table if not exists admin_connection_reservations (
  id uuid primary key,
  actor_id text not null,
  target_user_id text not null,
  reason text not null,
  status text not null check (status in ('waiting', 'connecting', 'connected', 'cancelled', 'expired', 'failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  session_id uuid references video_sessions(id) on delete set null,
  access_id uuid references admin_user_access(id) on delete set null,
  failure_reason text
);

create unique index if not exists admin_connection_reservations_target_active_idx
  on admin_connection_reservations (target_user_id)
  where status in ('waiting', 'connecting');

create unique index if not exists admin_connection_reservations_actor_active_idx
  on admin_connection_reservations (actor_id)
  where status in ('waiting', 'connecting');

create index if not exists admin_connection_reservations_created_idx
  on admin_connection_reservations (created_at desc);
