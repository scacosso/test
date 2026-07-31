create table if not exists admin_user_access (
  id uuid primary key,
  actor_id text not null,
  target_user_id text not null,
  mode text not null check (mode in ('preview', 'connect')),
  session_id uuid references video_sessions(id) on delete set null,
  room_name text not null,
  participant_identity text not null,
  reason text not null,
  started_at timestamptz not null default now(),
  token_expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text
);

create index if not exists admin_user_access_active_idx
  on admin_user_access (actor_id, token_expires_at)
  where ended_at is null;

create index if not exists admin_user_access_target_idx
  on admin_user_access (target_user_id, started_at desc);
