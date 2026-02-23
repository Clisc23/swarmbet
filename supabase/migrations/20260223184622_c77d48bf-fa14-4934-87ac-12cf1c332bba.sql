
-- ==========================================
-- 1. DROP PERMISSIVE INSERT/UPDATE POLICIES
-- ==========================================

-- Users table: remove permissive INSERT (only service role should insert via verify-worldid)
DROP POLICY IF EXISTS "Anyone can insert users" ON public.users;

-- Points history: remove permissive INSERT (only edge functions should insert)
DROP POLICY IF EXISTS "Anyone can insert points" ON public.points_history;

-- Referrals: remove permissive INSERT (only claim-referral edge function should insert)
DROP POLICY IF EXISTS "Anyone can insert referrals" ON public.referrals;

-- Accuracy by sport: remove permissive INSERT and UPDATE
DROP POLICY IF EXISTS "Anyone can insert accuracy" ON public.accuracy_by_sport;
DROP POLICY IF EXISTS "Anyone can update accuracy" ON public.accuracy_by_sport;

-- ==========================================
-- 2. ATOMIC INCREMENT RPCs (fix race conditions)
-- ==========================================

-- Atomic increment for poll_options vote_count
CREATE OR REPLACE FUNCTION public.increment_option_vote_count(p_option_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE poll_options SET vote_count = COALESCE(vote_count, 0) + 1 WHERE id = p_option_id;
$$;

-- Atomic increment for polls total_votes
CREATE OR REPLACE FUNCTION public.increment_poll_total_votes(p_poll_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE polls SET total_votes = COALESCE(total_votes, 0) + 1 WHERE id = p_poll_id;
$$;

-- Atomic update user stats after voting
CREATE OR REPLACE FUNCTION public.update_user_after_vote(
  p_user_id uuid,
  p_points integer,
  p_new_streak integer,
  p_new_max_streak integer,
  p_last_voted_date date
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE users SET
    swarm_points = swarm_points + p_points,
    current_streak = p_new_streak,
    max_streak = p_new_max_streak,
    last_voted_date = p_last_voted_date,
    total_predictions = COALESCE(total_predictions, 0) + 1
  WHERE id = p_user_id;
$$;

-- Atomic award consensus points
CREATE OR REPLACE FUNCTION public.award_user_points(
  p_user_id uuid,
  p_points integer,
  p_increment_correct boolean DEFAULT false
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE users SET
    swarm_points = swarm_points + p_points,
    correct_predictions = CASE WHEN p_increment_correct THEN COALESCE(correct_predictions, 0) + 1 ELSE correct_predictions END,
    accuracy_score = CASE 
      WHEN p_increment_correct AND COALESCE(total_predictions, 0) > 0 
      THEN ROUND((COALESCE(correct_predictions, 0) + 1)::numeric / total_predictions, 4)
      ELSE accuracy_score 
    END
  WHERE id = p_user_id;
$$;

-- Atomic award referral points
CREATE OR REPLACE FUNCTION public.award_referral_points(
  p_referrer_id uuid,
  p_referred_id uuid,
  p_points integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE users SET swarm_points = swarm_points + p_points, referral_count = COALESCE(referral_count, 0) + 1 WHERE id = p_referrer_id;
  UPDATE users SET swarm_points = swarm_points + p_points, referred_by = p_referrer_id WHERE id = p_referred_id;
$$;
