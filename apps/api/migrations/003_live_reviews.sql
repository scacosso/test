create table if not exists live_reviews (
  id uuid primary key,
  actor_id text not null,
  session_id uuid not null references video_sessions(id) on delete cascade,
  room_name text not null,
  participant_identity text not null unique,
  reason text not null check (char_length(reason) between 3 and 500),
  started_at timestamptz not null default now(),
  token_expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text
);

create index if not exists live_reviews_active_idx
  on live_reviews (session_id, started_at desc)
  where ended_at is null;

create index if not exists live_reviews_actor_idx
  on live_reviews (actor_id, started_at desc);
