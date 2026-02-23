import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const VALID_CATEGORIES = ['sports', 'politics', 'entertainment', 'crypto', 'science', 'finance', 'culture', 'technology', 'other', 'soccer', 'tennis', 'golf', 'f1', 'cricket', 'cycling', 'basketball', 'esports'];
const VALID_STATUSES = ['upcoming', 'active'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminPassword = Deno.env.get('ADMIN_PASSWORD');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { password, poll, options } = await req.json();

    if (!adminPassword || password !== adminPassword) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!poll || !options || !Array.isArray(options) || options.length < 2 || options.length > 20) {
      return new Response(JSON.stringify({ error: 'Poll data and 2-20 options required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!poll.question || typeof poll.question !== 'string' || poll.question.trim().length < 5 || poll.question.length > 500) {
      return new Response(JSON.stringify({ error: 'Question must be 5-500 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!poll.category || !VALID_CATEGORIES.includes(poll.category)) {
      return new Response(JSON.stringify({ error: 'Invalid category' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (poll.status && !VALID_STATUSES.includes(poll.status)) {
      return new Response(JSON.stringify({ error: 'Invalid status' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!poll.opens_at || !poll.closes_at || isNaN(Date.parse(poll.opens_at)) || isNaN(Date.parse(poll.closes_at))) {
      return new Response(JSON.stringify({ error: 'Invalid date format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (new Date(poll.closes_at) <= new Date(poll.opens_at)) {
      return new Response(JSON.stringify({ error: 'Close date must be after open date' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const pointsVoting = poll.points_for_voting ?? 1000;
    const pointsConsensus = poll.points_for_consensus ?? 5000;
    if (typeof pointsVoting !== 'number' || pointsVoting < 0 || pointsVoting > 100000) {
      return new Response(JSON.stringify({ error: 'Invalid points for voting' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (typeof pointsConsensus !== 'number' || pointsConsensus < 0 || pointsConsensus > 100000) {
      return new Response(JSON.stringify({ error: 'Invalid points for consensus' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const opt of options) {
      if (!opt.label || typeof opt.label !== 'string' || opt.label.trim().length === 0 || opt.label.length > 200) {
        return new Response(JSON.stringify({ error: 'Option labels must be 1-200 characters' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: maxRow } = await supabase
      .from('polls')
      .select('day_number')
      .order('day_number', { ascending: false })
      .limit(1)
      .single();
    const nextDay = (maxRow?.day_number || 0) + 1;
    const dayNumber = poll.day_number && typeof poll.day_number === 'number' && poll.day_number > 0 ? poll.day_number : nextDay;

    const { data: newPoll, error: pollError } = await supabase
      .from('polls')
      .insert({
        question: poll.question.trim(),
        description: poll.description?.slice(0, 2000) || null,
        category: poll.category,
        day_number: dayNumber,
        opens_at: poll.opens_at,
        closes_at: poll.closes_at,
        status: poll.status || 'upcoming',
        polymarket_event_id: poll.polymarket_event_id || null,
        polymarket_slug: poll.polymarket_slug || null,
        points_for_voting: pointsVoting,
        points_for_consensus: pointsConsensus,
        // All polls are Vocdoni elections by default — 'pending' means
        // the on-chain election will be created client-side on first vote
        vocdoni_election_id: poll.vocdoni_election_id || 'pending',
      })
      .select()
      .single();

    if (pollError) throw pollError;

    const optionRows = options.map((opt: any, idx: number) => ({
      poll_id: newPoll.id,
      label: opt.label.trim().slice(0, 200),
      flag_emoji: opt.flag_emoji?.slice(0, 10) || null,
      display_order: idx + 1,
      polymarket_price: opt.polymarket_price || null,
    }));

    const { error: optError } = await supabase
      .from('poll_options')
      .insert(optionRows);

    if (optError) throw optError;

    return new Response(JSON.stringify({ success: true, poll: newPoll }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('admin-create-poll error:', err);
    return new Response(JSON.stringify({ error: 'Unable to create poll' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
