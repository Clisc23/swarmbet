
-- Add Vocdoni election ID to polls
ALTER TABLE public.polls ADD COLUMN vocdoni_election_id TEXT NULL;

-- Add Vocdoni vote receipt ID to votes
ALTER TABLE public.votes ADD COLUMN vocdoni_vote_id TEXT NULL;

-- Make option_id nullable (anonymous votes won't have a known option_id until after resolution)
ALTER TABLE public.votes ALTER COLUMN option_id DROP NOT NULL;
