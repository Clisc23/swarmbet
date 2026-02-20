import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    if (!poll || !options || !Array.isArray(options) || options.length < 2) {
      return new Response(JSON.stringify({ error: 'Poll data and at least 2 options required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auto-assign next available day_number
    const { data: maxRow } = await supabase
      .from('polls')
      .select('day_number')
      .order('day_number', { ascending: false })
      .limit(1)
      .single();
    const nextDay = (maxRow?.day_number || 0) + 1;
    const dayNumber = poll.day_number || nextDay;

    // Create the poll
    const { data: newPoll, error: pollError } = await supabase
      .from('polls')
      .insert({
        question: poll.question,
        description: poll.description || null,
        category: poll.category,
        day_number: dayNumber,
        opens_at: poll.opens_at,
        closes_at: poll.closes_at,
        status: poll.status || 'upcoming',
        polymarket_event_id: poll.polymarket_event_id || null,
        polymarket_slug: poll.polymarket_slug || null,
        points_for_voting: poll.points_for_voting || 1000,
        points_for_consensus: poll.points_for_consensus || 5000,
      })
      .select()
      .single();

    if (pollError) throw pollError;

    // Create options
    const optionRows = options.map((opt: any, idx: number) => ({
      poll_id: newPoll.id,
      label: opt.label,
      flag_emoji: opt.flag_emoji || null,
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
