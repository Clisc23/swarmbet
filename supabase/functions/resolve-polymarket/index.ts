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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find polls that have been crowd-resolved but not yet checked for actual Polymarket resolution
    const { data: polls, error: pollsError } = await supabase
      .from('polls')
      .select('*, poll_options!poll_options_poll_id_fkey(*)')
      .eq('status', 'resolved')
      .is('actual_outcome_option_id', null)
      .not('polymarket_event_id', 'is', null);

    if (pollsError) throw pollsError;
    if (!polls || polls.length === 0) {
      return new Response(JSON.stringify({ message: 'No polls pending Polymarket resolution', resolved: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    for (const poll of polls) {
      try {
        // Fetch event from Polymarket
        const eventRes = await fetch(`${GAMMA_API}/events/${poll.polymarket_event_id}`);
        if (!eventRes.ok) {
          console.log(`Polymarket event ${poll.polymarket_event_id} not found or error: ${eventRes.status}`);
          continue;
        }

        const event = await eventRes.json();
        const markets = event.markets || [];

        // Find the resolved winning outcome
        // Polymarket markets have outcomes like ["Yes", "No"] with outcomePrices like "[0.99, 0.01]"
        // A resolved market typically has closed=true and one outcome price near 1.0
        let winningOutcomeLabel: string | null = null;

        for (const market of markets) {
          if (!market.closed) continue;

          const outcomes: string[] = typeof market.outcomes === 'string'
            ? JSON.parse(market.outcomes)
            : market.outcomes || [];
          const prices: number[] = typeof market.outcomePrices === 'string'
            ? JSON.parse(market.outcomePrices)
            : market.outcomePrices || [];

          // Find the winning outcome (price >= 0.95 means resolved to that outcome)
          for (let i = 0; i < outcomes.length; i++) {
            if (prices[i] >= 0.95) {
              // For binary markets (Yes/No), the winning label is the market question itself if "Yes" wins
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
          // Event not yet resolved on Polymarket
          console.log(`Event ${poll.polymarket_event_id} not yet resolved on Polymarket`);
          continue;
        }

        // Match the Polymarket outcome to our poll options (case-insensitive partial match)
        const options = poll.poll_options || [];
        const matchedOption = options.find((opt: any) => {
          const optLabel = opt.label.toLowerCase().trim();
          const winLabel = winningOutcomeLabel!.toLowerCase().trim();
          return optLabel === winLabel || winLabel.includes(optLabel) || optLabel.includes(winLabel);
        });

        if (!matchedOption) {
          console.log(`No matching option found for Polymarket outcome "${winningOutcomeLabel}" in poll ${poll.id}`);
          continue;
        }

        // Update poll with actual outcome
        await supabase.from('polls').update({
          actual_outcome_option_id: matchedOption.id,
        }).eq('id', poll.id);

        // Get all votes for this poll
        const { data: votes } = await supabase
          .from('votes')
          .select('*')
          .eq('poll_id', poll.id);

        if (!votes || votes.length === 0) {
          results.push({ poll_id: poll.id, status: 'resolved_no_votes', actual_outcome: winningOutcomeLabel });
          continue;
        }

        let correctVoters = 0;

        for (const vote of votes) {
          if (vote.option_id === matchedOption.id) {
            correctVoters++;

            // Award bonus points
            await supabase.from('votes').update({
              points_earned: (vote.points_earned || 0) + ACTUAL_OUTCOME_BONUS,
            }).eq('id', vote.id);

            // Update user points
            const { data: user } = await supabase
              .from('users')
              .select('swarm_points, correct_predictions, total_predictions')
              .eq('id', vote.user_id)
              .single();

            if (user) {
              await supabase.from('users').update({
                swarm_points: user.swarm_points + ACTUAL_OUTCOME_BONUS,
              }).eq('id', vote.user_id);
            }

            // Insert points history
            await supabase.from('points_history').insert({
              user_id: vote.user_id,
              amount: ACTUAL_OUTCOME_BONUS,
              type: 'actual_outcome_bonus',
              description: `Matched actual Polymarket outcome on: ${poll.question}`,
              poll_id: poll.id,
            });
          }
        }

        results.push({
          poll_id: poll.id,
          status: 'actual_resolved',
          actual_outcome: winningOutcomeLabel,
          matched_option: matchedOption.label,
          correct_voters: correctVoters,
          total_voters: votes.length,
        });

      } catch (eventErr) {
        console.error(`Error resolving poll ${poll.id}:`, eventErr.message);
        results.push({ poll_id: poll.id, status: 'error', error: eventErr.message });
      }
    }

    return new Response(JSON.stringify({ resolved: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
