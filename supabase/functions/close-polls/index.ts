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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    // Support force-closing a specific poll for demo purposes
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    const forcePollId = body?.force_poll_id;

    let query = supabase.from('polls').select('*, poll_options(*)').eq('status', 'active');
    if (forcePollId) {
      query = query.eq('id', forcePollId);
    } else {
      query = query.lte('closes_at', now);
    }

    const { data: expiredPolls, error: pollsError } = await query;

    if (pollsError) throw pollsError;
    if (!expiredPolls || expiredPolls.length === 0) {
      return new Response(JSON.stringify({ message: 'No polls to close', closed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    for (const poll of expiredPolls) {
      const options = poll.poll_options || [];

      // 2. Determine crowd consensus — option with most votes
      let consensusOption = null;
      let maxVotes = 0;
      for (const opt of options) {
        if ((opt.vote_count || 0) > maxVotes) {
          maxVotes = opt.vote_count || 0;
          consensusOption = opt;
        }
      }

      if (!consensusOption || maxVotes === 0) {
        // No votes — just close
        await supabase.from('polls').update({
          status: 'closed',
          resolved_at: now,
        }).eq('id', poll.id);
        results.push({ poll_id: poll.id, status: 'closed_no_votes' });
        continue;
      }

      // 3. Update poll with consensus + winner (crowd consensus = winner)
      await supabase.from('polls').update({
        status: 'resolved',
        crowd_consensus_option_id: consensusOption.id,
        winning_option_id: consensusOption.id,
        resolved_at: now,
      }).eq('id', poll.id);

      // 4. Mark winning option
      await supabase.from('poll_options').update({ is_winner: true }).eq('id', consensusOption.id);

      // 5. Update vote percentages for all options
      const totalVotes = poll.total_votes || 0;
      for (const opt of options) {
        const pct = totalVotes > 0 ? ((opt.vote_count || 0) / totalVotes) * 100 : 0;
        await supabase.from('poll_options').update({
          vote_percentage: Math.round(pct * 100) / 100,
        }).eq('id', opt.id);
      }

      // 6. Get all votes for this poll and score them
      const { data: votes } = await supabase
        .from('votes')
        .select('*')
        .eq('poll_id', poll.id);

      if (!votes || votes.length === 0) {
        results.push({ poll_id: poll.id, status: 'resolved_no_votes' });
        continue;
      }

      const consensusPoints = poll.points_for_consensus || 5000;
      const userPointUpdates: Record<string, number> = {};

      for (const vote of votes) {
        const isCorrect = vote.option_id === consensusOption.id;

        // Update vote record
        await supabase.from('votes').update({
          is_correct: isCorrect,
          matched_consensus: isCorrect,
          points_earned: isCorrect ? (vote.points_earned || 0) + consensusPoints : vote.points_earned || 0,
        }).eq('id', vote.id);

        if (isCorrect) {
          // Track bonus points per user
          userPointUpdates[vote.user_id] = (userPointUpdates[vote.user_id] || 0) + consensusPoints;

          // Insert points history
          await supabase.from('points_history').insert({
            user_id: vote.user_id,
            amount: consensusPoints,
            type: 'consensus_bonus',
            description: `Matched crowd consensus on: ${poll.question}`,
            poll_id: poll.id,
          });
        }
      }

      // 7. Update user stats (points + accuracy)
      for (const [userId, bonusPoints] of Object.entries(userPointUpdates)) {
        const { data: user } = await supabase
          .from('users')
          .select('swarm_points, correct_predictions, total_predictions')
          .eq('id', userId)
          .single();

        if (user) {
          const newCorrect = (user.correct_predictions || 0) + 1;
          const newTotal = user.total_predictions || 0; // already incremented on vote
          const newAccuracy = newTotal > 0 ? newCorrect / newTotal : 0;

          await supabase.from('users').update({
            swarm_points: user.swarm_points + bonusPoints,
            correct_predictions: newCorrect,
            accuracy_score: Math.round(newAccuracy * 10000) / 10000,
          }).eq('id', userId);
        }
      }

      // Update total_predictions for users who got it wrong (accuracy tracking)
      const wrongVoterIds = votes
        .filter(v => v.option_id !== consensusOption.id)
        .map(v => v.user_id);

      // No extra update needed — total_predictions was already incremented on vote submission
      // We only needed to update correct_predictions for winners

      results.push({
        poll_id: poll.id,
        status: 'resolved',
        consensus_option: consensusOption.label,
        total_votes: totalVotes,
        correct_voters: Object.keys(userPointUpdates).length,
      });
    }

    return new Response(JSON.stringify({ closed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
