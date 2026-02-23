import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VOCDONI_API = 'https://api-stg.vocdoni.net/v2';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    const forcePollId = body?.force_poll_id;

    let query = supabase.from('polls').select('*, poll_options!poll_options_poll_id_fkey(*)').eq('status', 'active');
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
      const sortedOptions = [...options].sort((a: any, b: any) => a.display_order - b.display_order);
      const isAnonymous = !!poll.vocdoni_election_id;

      let consensusOption = null;
      let maxVotes = 0;

      if (isAnonymous) {
        // Fetch results from Vocdoni blockchain
        try {
          const electionRes = await fetch(`${VOCDONI_API}/elections/${poll.vocdoni_election_id}`);
          if (!electionRes.ok) {
            const errText = await electionRes.text();
            console.error(`Failed to fetch Vocdoni election: ${errText}`);
            // Fall through to close without results
          } else {
            const electionData = await electionRes.json();
            const vocdoniResults = electionData.result; // Array of arrays: result[questionIdx][optionIdx]

            if (vocdoniResults && vocdoniResults.length > 0) {
              const questionResults = vocdoniResults[0]; // First (only) question
              
              // Map Vocdoni option indices back to poll_options
              for (let i = 0; i < sortedOptions.length && i < questionResults.length; i++) {
                const voteCount = parseInt(questionResults[i] || '0', 10);
                // Update the option's vote_count from Vocdoni results
                await supabase.from('poll_options').update({ vote_count: voteCount }).eq('id', sortedOptions[i].id);
                sortedOptions[i].vote_count = voteCount;
                
                if (voteCount > maxVotes) {
                  maxVotes = voteCount;
                  consensusOption = sortedOptions[i];
                }
              }

              // Update total votes from Vocdoni
              const totalVotes = electionData.voteCount || sortedOptions.reduce((sum: number, o: any) => sum + (o.vote_count || 0), 0);
              await supabase.from('polls').update({ total_votes: totalVotes }).eq('id', poll.id);
              poll.total_votes = totalVotes;
            }
          }
        } catch (err) {
          console.error('Vocdoni fetch error:', err);
        }

        // Now resolve individual votes using vocdoni_vote_id receipts
        const { data: votes } = await supabase
          .from('votes')
          .select('*')
          .eq('poll_id', poll.id);

        if (votes && votes.length > 0) {
          for (const vote of votes) {
            if (vote.vocdoni_vote_id) {
              try {
                const voteInfoRes = await fetch(`${VOCDONI_API}/votes/verify/${poll.vocdoni_election_id}/${vote.vocdoni_vote_id}`);
                if (voteInfoRes.ok) {
                  const voteInfo = await voteInfoRes.json();
                  // voteInfo.package contains the encrypted/decrypted vote content
                  const votePackage = voteInfo.package;
                  if (votePackage && Array.isArray(votePackage)) {
                    const chosenIndex = votePackage[0]; // First question's choice
                    if (chosenIndex >= 0 && chosenIndex < sortedOptions.length) {
                      const chosenOption = sortedOptions[chosenIndex];
                      await supabase.from('votes').update({
                        option_id: chosenOption.id,
                      }).eq('id', vote.id);
                      vote.option_id = chosenOption.id;
                    }
                  }
                }
              } catch (err) {
                console.error(`Failed to verify vote ${vote.vocdoni_vote_id}:`, err);
              }
            }
          }
        }
      } else {
        // Non-anonymous: determine consensus from existing vote_counts
        for (const opt of options) {
          if ((opt.vote_count || 0) > maxVotes) {
            maxVotes = opt.vote_count || 0;
            consensusOption = opt;
          }
        }
      }

      if (!consensusOption || maxVotes === 0) {
        await supabase.from('polls').update({
          status: 'closed',
          resolved_at: now,
        }).eq('id', poll.id);
        results.push({ poll_id: poll.id, status: 'closed_no_votes' });
        continue;
      }

      // Update poll with consensus + winner
      await supabase.from('polls').update({
        status: 'resolved',
        crowd_consensus_option_id: consensusOption.id,
        winning_option_id: consensusOption.id,
        resolved_at: now,
      }).eq('id', poll.id);

      // Mark winning option
      await supabase.from('poll_options').update({ is_winner: true }).eq('id', consensusOption.id);

      // Update vote percentages for all options
      const totalVotes = poll.total_votes || 0;
      for (const opt of (isAnonymous ? sortedOptions : options)) {
        const pct = totalVotes > 0 ? ((opt.vote_count || 0) / totalVotes) * 100 : 0;
        await supabase.from('poll_options').update({
          vote_percentage: Math.round(pct * 100) / 100,
        }).eq('id', opt.id);
      }

      // Get all votes for this poll and score them
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

        await supabase.from('votes').update({
          is_correct: isCorrect,
          matched_consensus: isCorrect,
          points_earned: isCorrect ? (vote.points_earned || 0) + consensusPoints : vote.points_earned || 0,
        }).eq('id', vote.id);

        if (isCorrect) {
          userPointUpdates[vote.user_id] = (userPointUpdates[vote.user_id] || 0) + consensusPoints;

          await supabase.from('points_history').insert({
            user_id: vote.user_id,
            amount: consensusPoints,
            type: 'consensus_bonus',
            description: `Matched crowd consensus on: ${poll.question}`,
            poll_id: poll.id,
          });
        }
      }

      // Update user stats (points + accuracy)
      for (const [userId, bonusPoints] of Object.entries(userPointUpdates)) {
        const { data: user } = await supabase
          .from('users')
          .select('swarm_points, correct_predictions, total_predictions')
          .eq('id', userId)
          .single();

        if (user) {
          const newCorrect = (user.correct_predictions || 0) + 1;
          const newTotal = user.total_predictions || 1;
          const newAccuracy = newCorrect / newTotal;

          await supabase.from('users').update({
            swarm_points: user.swarm_points + bonusPoints,
            correct_predictions: newCorrect,
            accuracy_score: Math.round(newAccuracy * 10000) / 10000,
          }).eq('id', userId);
        }
      }

      results.push({
        poll_id: poll.id,
        status: 'resolved',
        anonymous: isAnonymous,
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
