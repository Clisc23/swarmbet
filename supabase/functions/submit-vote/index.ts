import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_CONFIDENCE = ['low', 'medium', 'high'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { poll_id, option_id, confidence, vocdoni_vote_id } = await req.json();

    // Input validation
    if (!poll_id || !UUID_RE.test(poll_id)) {
      return new Response(JSON.stringify({ error: 'Invalid poll ID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (option_id && !UUID_RE.test(option_id)) {
      return new Response(JSON.stringify({ error: 'Invalid option ID' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!confidence || !VALID_CONFIDENCE.includes(confidence)) {
      return new Response(JSON.stringify({ error: 'Invalid confidence value' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (vocdoni_vote_id && (typeof vocdoni_vote_id !== 'string' || vocdoni_vote_id.length > 200)) {
      return new Response(JSON.stringify({ error: 'Invalid vote reference' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get user record
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_uid', authUser.id)
      .single();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify poll is active
    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .select('*')
      .eq('id', poll_id)
      .single();

    if (pollError || !poll) {
      return new Response(JSON.stringify({ error: 'Poll not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const now = new Date();
    if (poll.status !== 'active' || now < new Date(poll.opens_at) || now > new Date(poll.closes_at)) {
      return new Response(JSON.stringify({ error: 'Poll is not active' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check for existing vote
    const { data: existingVote } = await supabase
      .from('votes')
      .select('id')
      .eq('user_id', user.id)
      .eq('poll_id', poll_id)
      .maybeSingle();

    if (existingVote) {
      return new Response(JSON.stringify({ error: 'Already voted on this poll' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Determine if this is an anonymous poll (has Vocdoni election)
    const isAnonymous = !!poll.vocdoni_election_id;
    let vocdoniVoteId = vocdoni_vote_id || null;

    // For Vocdoni-enabled polls, cast the vote on-chain server-side
    if (isAnonymous && !vocdoniVoteId && option_id) {
      try {
        // Find the option index for Vocdoni
        const { data: options } = await supabase
          .from('poll_options')
          .select('id, display_order')
          .eq('poll_id', poll_id)
          .order('display_order');

        const optionIndex = options?.findIndex(o => o.id === option_id) ?? -1;

        if (optionIndex >= 0) {
          // Call cast-vocdoni-vote internally
          const castRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/cast-vocdoni-vote`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': req.headers.get('Authorization')!,
              'apikey': Deno.env.get('SUPABASE_ANON_KEY')!,
            },
            body: JSON.stringify({
              election_id: poll.vocdoni_election_id,
              option_index: optionIndex,
            }),
          });

          const castData = await castRes.json();
          if (castData.vocdoni_vote_id) {
            vocdoniVoteId = castData.vocdoni_vote_id;
          }
        }
      } catch (err) {
        console.error('Vocdoni vote casting failed (non-blocking):', err);
      }
    }

    // Insert vote — for anonymous polls, don't store option_id to preserve privacy
    await supabase.from('votes').insert({
      user_id: user.id,
      poll_id,
      option_id: isAnonymous ? null : (option_id || null),
      confidence,
      vocdoni_vote_id: vocdoniVoteId,
    });

    // Atomic increment vote count on selected option (only for non-anonymous polls)
    if (!isAnonymous && option_id) {
      await supabase.rpc('increment_option_vote_count', { p_option_id: option_id });
    }

    // Atomic increment total votes
    await supabase.rpc('increment_poll_total_votes', { p_poll_id: poll_id });

    // Streak logic
    const pointsEarned = 1000;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let newStreak = user.current_streak || 0;
    let newMaxStreak = user.max_streak || 0;

    if (user.last_voted_date === yesterday) {
      newStreak += 1;
    } else if (user.last_voted_date !== today) {
      newStreak = 1;
    }
    if (newStreak > newMaxStreak) newMaxStreak = newStreak;

    // Atomic user stats update
    await supabase.rpc('update_user_after_vote', {
      p_user_id: user.id,
      p_points: pointsEarned,
      p_new_streak: newStreak,
      p_new_max_streak: newMaxStreak,
      p_last_voted_date: today,
    });

    await supabase.from('points_history').insert({
      user_id: user.id,
      amount: pointsEarned,
      type: 'vote',
      description: 'Voted on poll',
      poll_id,
    });

    const newBalance = user.swarm_points + pointsEarned;

    return new Response(JSON.stringify({
      success: true,
      points_earned: pointsEarned,
      new_balance: newBalance,
      current_streak: newStreak,
      max_streak: newMaxStreak,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('submit-vote error:', err);
    return new Response(JSON.stringify({ error: 'Unable to process vote' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
