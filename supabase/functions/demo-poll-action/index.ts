import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ACTIONS = ['activate', 'reopen'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Admin password check
    const adminPassword = Deno.env.get('ADMIN_PASSWORD');
    const { poll_id, action, password } = await req.json();

    if (!adminPassword || password !== adminPassword) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Input validation
    if (!poll_id || !UUID_RE.test(poll_id)) {
      return new Response(JSON.stringify({ error: 'Invalid poll ID' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!action || !VALID_ACTIONS.includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();

    if (action === 'activate') {
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
      const closesAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      await supabase.from('polls').update({
        status: 'active',
        opens_at: now.toISOString(),
        closes_at: closesAt,
        resolved_at: null,
        winning_option_id: null,
        crowd_consensus_option_id: null,
      }).eq('id', poll_id);

      await supabase.from('poll_options').update({
        is_winner: false,
        vote_percentage: 0,
      }).eq('poll_id', poll_id);

      return new Response(JSON.stringify({ success: true, status: 'active' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('demo-poll-action error:', err);
    return new Response(JSON.stringify({ error: 'Unable to process action' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
