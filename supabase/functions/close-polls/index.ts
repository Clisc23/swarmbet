import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VOCDONI_API = 'https://api-stg.vocdoni.net/v2';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Admin password check
    const adminPassword = Deno.env.get('ADMIN_PASSWORD');
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    if (!adminPassword || body?.password !== adminPassword) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();
    const forcePollId = body?.force_poll_id;

    // Input validation for optional force_poll_id
    if (forcePollId && !UUID_RE.test(forcePollId)) {
      return new Response(JSON.stringify({ error: 'Invalid poll ID' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
        try {
          const electionRes = await fetch(`${VOCDONI_API}/elections/${poll.vocdoni_election_id}`);
          if (electionRes.ok) {
            const electionData = await electionRes.json();
            const vocdoniResults = electionData.result;

            if (vocdoniResults && vocdoniResults.length > 0) {
              const questionResults = vocdoniResults[0];
              
              for (let i = 0; i < sortedOptions.length && i < questionResults.length; i++) {
                const voteCount = parseInt(questionResults[i] || '0', 10);
                await supabase.from('poll_options').update({ vote_count: voteCount }).eq('id', sortedOptions[i].id);
                sortedOptions[i].vote_count = voteCount;
                
                if (voteCount > maxVotes) {
                  maxVotes = voteCount;
                  consensusOption = sortedOptions[i];
                }
              }

              const totalVotes = electionData.voteCount || sortedOptions.reduce((sum: number, o: any) => sum + (o.vote_count || 0), 0);
              await supabase.from('polls').update({ total_votes: totalVotes }).eq('id', poll.id);
              poll.total_votes = totalVotes;
            }
          } else {
            console.error(`Failed to fetch Vocdoni election for poll ${poll.id}`);
          }
        } catch (err) {
          console.error(`Vocdoni fetch error for poll ${poll.id}:`, err);
        }

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
                  const votePackage = voteInfo.package;
                  if (votePackage && Array.isArray(votePackage)) {
                    const chosenIndex = votePackage[0];
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
                console.error(`Failed to verify vote for poll ${poll.id}`);
              }
            }
          }
        }
      } else {
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

      await supabase.from('polls').update({
        status: 'resolved',
        crowd_consensus_option_id: consensusOption.id,
        winning_option_id: consensusOption.id,
        resolved_at: now,
      }).eq('id', poll.id);

      await supabase.from('poll_options').update({ is_winner: true }).eq('id', consensusOption.id);

      const totalVotes = poll.total_votes || 0;
      for (const opt of (isAnonymous ? sortedOptions : options)) {
        const pct = totalVotes > 0 ? ((opt.vote_count || 0) / totalVotes) * 100 : 0;
        await supabase.from('poll_options').update({
          vote_percentage: Math.round(pct * 100) / 100,
        }).eq('id', opt.id);
      }

      const { data: votes } = await supabase
        .from('votes')
        .select('*')
        .eq('poll_id', poll.id);

      if (!votes || votes.length === 0) {
        results.push({ poll_id: poll.id, status: 'resolved_no_votes' });
        continue;
      }

      const consensusPoints = poll.points_for_consensus || 5000;

      for (const vote of votes) {
        const isCorrect = vote.option_id === consensusOption.id;

        await supabase.from('votes').update({
          is_correct: isCorrect,
          matched_consensus: isCorrect,
          points_earned: isCorrect ? (vote.points_earned || 0) + consensusPoints : vote.points_earned || 0,
        }).eq('id', vote.id);

        if (isCorrect) {
          // Atomic points award
          await supabase.rpc('award_user_points', {
            p_user_id: vote.user_id,
            p_points: consensusPoints,
            p_increment_correct: true,
          });

          await supabase.from('points_history').insert({
            user_id: vote.user_id,
            amount: consensusPoints,
            type: 'consensus_bonus',
            description: `Matched crowd consensus`,
            poll_id: poll.id,
          });
        }
      }

      results.push({
        poll_id: poll.id,
        status: 'resolved',
        anonymous: isAnonymous,
        consensus_option: consensusOption.label,
        total_votes: totalVotes,
      });
    }

    return new Response(JSON.stringify({ closed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('close-polls error:', err);
    return new Response(JSON.stringify({ error: 'Unable to process poll closure' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
