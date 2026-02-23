
-- Add column to track actual Polymarket event resolution (separate from crowd consensus)
ALTER TABLE public.polls ADD COLUMN actual_outcome_option_id uuid REFERENCES public.poll_options(id);
