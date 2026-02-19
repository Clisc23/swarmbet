
-- Fix function search paths
create or replace function public.get_leaderboard(page_limit int default 50, page_offset int default 0)
returns table (
  rank bigint,
  player_id uuid,
  username text,
  avatar_seed text,
  swarm_points integer,
  accuracy_score decimal,
  current_streak integer,
  max_streak integer,
  total_predictions integer
) as $$
  select
    row_number() over (order by u.swarm_points desc, u.accuracy_score desc, u.created_at asc) as rank,
    u.id as player_id,
    u.username,
    u.avatar_seed,
    u.swarm_points,
    u.accuracy_score,
    u.current_streak,
    u.max_streak,
    u.total_predictions
  from public.users u
  where u.username is not null
  order by u.swarm_points desc, u.accuracy_score desc, u.created_at asc
  limit page_limit
  offset page_offset;
$$ language sql stable
set search_path = public;

create or replace function public.get_user_rank(target_user_id uuid)
returns bigint as $$
  select rank from (
    select
      id,
      row_number() over (order by swarm_points desc, accuracy_score desc, created_at asc) as rank
    from public.users
    where username is not null
  ) ranked
  where ranked.id = target_user_id;
$$ language sql stable
set search_path = public;

create or replace function public.get_total_users()
returns bigint as $$
  select count(*) from public.users where username is not null;
$$ language sql stable
set search_path = public;
