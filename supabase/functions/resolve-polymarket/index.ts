import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GAMMA_API = 'https://gamma-api.polymarket.com';
const ACTUAL_OUTCOME_BONUS = 10000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Admin password check
    const adminPassword = Deno.env.get('ADMIN_PASSWORD');
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body */ }

    if (!adminPassword || body?.password !== adminPassword) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: polls, error: pollsError } = await supabase
      .from('polls')
      .select('*, poll_options!poll_options_poll_id_fkey(*)')
      .eq('status', 'resolved')
      .is('actual_outcome_option_id', null)
      .not('polymarket_event_id', 'is', null);

    if (pollsError) throw pollsError;
    if (!polls || polls.length === 0) {
      return new Response(JSON.stringify({ message: 'No polls pending resolution', resolved: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    for (const poll of polls) {
      try {
        const eventRes = await fetch(`${GAMMA_API}/events/${poll.polymarket_event_id}`);
        if (!eventRes.ok) {
          console.log(`Polymarket event not found for poll ${poll.id}`);
          continue;
        }

        const event = await eventRes.json();
        const markets = event.markets || [];

        let winningOutcomeLabel: string | null = null;

        for (const market of markets) {
          if (!market.closed) continue;

          const outcomes: string[] = typeof market.outcomes === 'string'
            ? JSON.parse(market.outcomes)
            : market.outcomes || [];
          const prices: number[] = typeof market.outcomePrices === 'string'
            ? JSON.parse(market.outcomePrices)
            : market.outcomePrices || [];

          for (let i = 0; i < outcomes.length; i++) {
            if (prices[i] >= 0.95) {
              if (outcomes[i] === 'Yes') {
                winningOutcomeLabel = market.question || market.groupItemTitle || outcomes[i];
              } else if (outcomes[i] !== 'No') {
                winningOutcomeLabel = outcomes[i];
              }
              break;
            }
          }
          if (winningOutcomeLabel) break;
        }

        if (!winningOutcomeLabel) {
          continue;
        }

        const options = poll.poll_options || [];
        const matchedOption = options.find((opt: any) => {
          const optLabel = opt.label.toLowerCase().trim();
          const winLabel = winningOutcomeLabel!.toLowerCase().trim();
          return optLabel === winLabel || winLabel.includes(optLabel) || optLabel.includes(winLabel);
        });

        if (!matchedOption) {
          console.log(`No matching option for poll ${poll.id}`);
          continue;
        }

        await supabase.from('polls').update({
          actual_outcome_option_id: matchedOption.id,
        }).eq('id', poll.id);

        const { data: votes } = await supabase
          .from('votes')
          .select('*')
          .eq('poll_id', poll.id);

        if (!votes || votes.length === 0) {
          results.push({ poll_id: poll.id, status: 'resolved_no_votes' });
          continue;
        }

        let correctVoters = 0;

        for (const vote of votes) {
          if (vote.option_id === matchedOption.id) {
            correctVoters++;

            await supabase.from('votes').update({
              points_earned: (vote.points_earned || 0) + ACTUAL_OUTCOME_BONUS,
            }).eq('id', vote.id);

            // Atomic points award
            await supabase.rpc('award_user_points', {
              p_user_id: vote.user_id,
              p_points: ACTUAL_OUTCOME_BONUS,
              p_increment_correct: false,
            });

            await supabase.from('points_history').insert({
              user_id: vote.user_id,
              amount: ACTUAL_OUTCOME_BONUS,
              type: 'actual_outcome_bonus',
              description: `Matched actual outcome`,
              poll_id: poll.id,
            });
          }
        }

        results.push({
          poll_id: poll.id,
          status: 'actual_resolved',
          correct_voters: correctVoters,
          total_voters: votes.length,
        });

      } catch (eventErr) {
        console.error(`Error resolving poll ${poll.id}`);
        results.push({ poll_id: poll.id, status: 'error' });
      }
    }

    return new Response(JSON.stringify({ resolved: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('resolve-polymarket error:', err);
    return new Response(JSON.stringify({ error: 'Unable to resolve polls' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
