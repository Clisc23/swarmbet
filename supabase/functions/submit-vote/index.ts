import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { poll_id, option_id, confidence } = await req.json();

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

    // Insert vote
    await supabase.from('votes').insert({
      user_id: user.id,
      poll_id,
      option_id,
      confidence,
    });

    // Increment vote count on the selected option
    const { data: currentOption } = await supabase
      .from('poll_options')
      .select('vote_count')
      .eq('id', option_id)
      .single();
    
    await supabase
      .from('poll_options')
      .update({ vote_count: (currentOption?.vote_count || 0) + 1 })
      .eq('id', option_id);

    // Increment total votes
    await supabase.from('polls').update({ total_votes: (poll.total_votes || 0) + 1 }).eq('id', poll_id);

    // Award points
    const pointsEarned = 1000;
    const newBalance = user.swarm_points + pointsEarned;
    
    // Streak logic
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

    const newTotalPredictions = (user.total_predictions || 0) + 1;

    await supabase.from('users').update({
      swarm_points: newBalance,
      current_streak: newStreak,
      max_streak: newMaxStreak,
      last_voted_date: today,
      total_predictions: newTotalPredictions,
    }).eq('id', user.id);

    await supabase.from('points_history').insert({
      user_id: user.id,
      amount: pointsEarned,
      type: 'vote',
      description: 'Voted on poll',
      poll_id,
    });

    return new Response(JSON.stringify({
      success: true,
      points_earned: pointsEarned,
      new_balance: newBalance,
      current_streak: newStreak,
      max_streak: newMaxStreak,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
