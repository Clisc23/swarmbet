
-- Users table
create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_uid uuid unique not null,
  wallet_address text,
  username text unique not null,
  display_name text,
  avatar_seed text default gen_random_uuid()::text,
  auth_provider text not null default 'worldid',
  nullifier_hash text unique not null,
  swarm_points integer default 100 not null,
  accuracy_score decimal(5,4) default 0,
  correct_predictions integer default 0,
  total_predictions integer default 0,
  current_streak integer default 0,
  max_streak integer default 0,
  last_voted_date date,
  referral_code text unique not null,
  referred_by uuid references public.users(id),
  referral_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_users_auth_uid on public.users(auth_uid);
create index idx_users_referral_code on public.users(referral_code);
create index idx_users_swarm_points on public.users(swarm_points desc);
create index idx_users_nullifier on public.users(nullifier_hash);

-- Polls table
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  day_number integer unique not null check (day_number between 0 and 30),
  question text not null,
  description text,
  category text not null check (category in ('soccer', 'tennis', 'golf', 'f1', 'cricket', 'cycling', 'basketball', 'esports', 'other')),
  polymarket_event_id text,
  polymarket_slug text,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'closed', 'resolved')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  resolves_at timestamptz,
  resolved_at timestamptz,
  winning_option_id uuid,
  crowd_consensus_option_id uuid,
  total_votes integer default 0,
  points_for_voting integer default 1000,
  points_for_consensus integer default 5000,
  created_at timestamptz default now()
);

create index idx_polls_status on public.polls(status);
create index idx_polls_day on public.polls(day_number);

-- Poll options table
create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls(id) on delete cascade not null,
  label text not null,
  flag_emoji text,
  polymarket_price decimal(5,4),
  vote_count integer default 0,
  vote_percentage decimal(5,4) default 0,
  is_winner boolean default false,
  display_order integer not null,
  created_at timestamptz default now()
);

create index idx_poll_options_poll on public.poll_options(poll_id);

-- Votes table
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  poll_id uuid references public.polls(id) on delete cascade not null,
  option_id uuid references public.poll_options(id) not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  matched_consensus boolean,
  is_correct boolean,
  points_earned integer default 0,
  voted_at timestamptz default now(),
  unique(user_id, poll_id)
);

create index idx_votes_user on public.votes(user_id);
create index idx_votes_poll on public.votes(poll_id);

-- Points history table
create table public.points_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  amount integer not null,
  type text not null check (type in ('signup', 'referral_given', 'referral_received', 'vote', 'consensus_bonus', 'correct_prediction', 'streak_multiplier')),
  description text,
  poll_id uuid references public.polls(id),
  created_at timestamptz default now()
);

create index idx_points_user on public.points_history(user_id);

-- Referrals table
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references public.users(id) on delete cascade not null,
  referred_id uuid references public.users(id) on delete cascade not null,
  points_awarded integer default 100,
  created_at timestamptz default now(),
  unique(referred_id)
);

create index idx_referrals_referrer on public.referrals(referrer_id);

-- Accuracy by sport table
create table public.accuracy_by_sport (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  sport text not null,
  correct integer default 0,
  total integer default 0,
  accuracy decimal(5,4) default 0,
  updated_at timestamptz default now(),
  unique(user_id, sport)
);

create index idx_accuracy_sport_user on public.accuracy_by_sport(user_id);

-- RLS policies
alter table public.users enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.votes enable row level security;
alter table public.points_history enable row level security;
alter table public.referrals enable row level security;
alter table public.accuracy_by_sport enable row level security;

-- Users: public read, self update
create policy "Anyone can read user profiles" on public.users for select using (true);
create policy "Users update own profile" on public.users for update using (auth.uid()::text = auth_uid::text);
create policy "Anyone can insert users" on public.users for insert with check (true);

-- Polls: public read
create policy "Anyone can read polls" on public.polls for select using (true);

-- Poll options: public read
create policy "Anyone can read poll options" on public.poll_options for select using (true);

-- Votes: PRIVATE
create policy "Users see own votes only" on public.votes for select using (
  auth.uid()::text = (select auth_uid::text from public.users where id = user_id)
);
create policy "Users insert own votes" on public.votes for insert with check (
  auth.uid()::text = (select auth_uid::text from public.users where id = user_id)
);

-- Points history: private to user
create policy "Users see own points" on public.points_history for select using (
  auth.uid()::text = (select auth_uid::text from public.users where id = user_id)
);
create policy "Anyone can insert points" on public.points_history for insert with check (true);

-- Referrals
create policy "Referrers see own referrals" on public.referrals for select using (
  auth.uid()::text = (select auth_uid::text from public.users where id = referrer_id)
);
create policy "Anyone can insert referrals" on public.referrals for insert with check (true);

-- Accuracy by sport: public
create policy "Anyone can read accuracy" on public.accuracy_by_sport for select using (true);
create policy "Anyone can insert accuracy" on public.accuracy_by_sport for insert with check (true);
create policy "Anyone can update accuracy" on public.accuracy_by_sport for update using (true);

-- Leaderboard functions
create or replace function get_leaderboard(page_limit int default 50, page_offset int default 0)
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
$$ language sql stable;

create or replace function get_user_rank(target_user_id uuid)
returns bigint as $$
  select rank from (
    select
      id,
      row_number() over (order by swarm_points desc, accuracy_score desc, created_at asc) as rank
    from public.users
    where username is not null
  ) ranked
  where ranked.id = target_user_id;
$$ language sql stable;

create or replace function get_total_users()
returns bigint as $$
  select count(*) from public.users where username is not null;
$$ language sql stable;

-- Enable realtime for polls
ALTER PUBLICATION supabase_realtime ADD TABLE public.polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_options;
