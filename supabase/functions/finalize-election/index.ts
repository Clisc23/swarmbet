import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { poll_id, election_id } = body;

    if (!poll_id || !UUID_RE.test(poll_id)) {
      return new Response(JSON.stringify({ error: 'Invalid poll_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!election_id || typeof election_id !== 'string' || election_id.length < 10 || election_id.length > 200) {
      return new Response(JSON.stringify({ error: 'Invalid election_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Atomically update only if still 'pending'
    const { data, error } = await supabase
      .from('polls')
      .update({ vocdoni_election_id: election_id })
      .eq('id', poll_id)
      .eq('vocdoni_election_id', 'pending')
      .select('id, vocdoni_election_id')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      // Already finalized by another voter — fetch current election_id
      const { data: existing } = await supabase
        .from('polls')
        .select('vocdoni_election_id')
        .eq('id', poll_id)
        .single();

      return new Response(JSON.stringify({
        success: true,
        election_id: existing?.vocdoni_election_id,
        already_finalized: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      election_id,
      already_finalized: false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('finalize-election error:', err);
    return new Response(JSON.stringify({ error: 'Unable to finalize election' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
