alter table live_reviews
  add column if not exists mode text not null default 'observe',
  add column if not exists target_user_id text;

alter table live_reviews
  drop constraint if exists live_reviews_mode_check;

alter table live_reviews
  add constraint live_reviews_mode_check
  check (mode in ('observe', 'connect'));
