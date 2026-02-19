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

    const { poll_id, action } = await req.json();

    if (!poll_id || !action) {
      return new Response(JSON.stringify({ error: 'poll_id and action required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();

    if (action === 'activate') {
      // Open an upcoming poll — set opens_at to now, closes_at to 24h from now
      const closesAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('polls').update({
        status: 'active',
        opens_at: now.toISOString(),
        closes_at: closesAt,
      }).eq('id', poll_id);

      return new Response(JSON.stringify({ success: true, status: 'active' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reopen') {
      // Reopen a closed/resolved poll — reset resolution fields, set new close time
      const closesAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      await supabase.from('polls').update({
        status: 'active',
        opens_at: now.toISOString(),
        closes_at: closesAt,
        resolved_at: null,
        winning_option_id: null,
        crowd_consensus_option_id: null,
      }).eq('id', poll_id);

      // Reset is_winner and vote_percentage on options
      await supabase.from('poll_options').update({
        is_winner: false,
        vote_percentage: 0,
      }).eq('poll_id', poll_id);

      return new Response(JSON.stringify({ success: true, status: 'active' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
