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

    const { poll_id } = await req.json();
    if (!poll_id) {
      return new Response(JSON.stringify({ error: 'poll_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch poll and options
    const { data: poll, error: pollError } = await supabase
      .from('polls')
      .select('*, poll_options!poll_options_poll_id_fkey(*)')
      .eq('id', poll_id)
      .single();

    if (pollError || !poll) {
      return new Response(JSON.stringify({ error: 'Poll not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (poll.vocdoni_election_id) {
      return new Response(JSON.stringify({ 
        success: true, 
        election_id: poll.vocdoni_election_id,
        message: 'Election already exists' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all user wallet addresses for the census
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('wallet_address')
      .not('wallet_address', 'is', null);

    if (usersError) throw usersError;

    const walletAddresses = (users || [])
      .map(u => u.wallet_address)
      .filter(Boolean) as string[];

    if (walletAddresses.length === 0) {
      return new Response(JSON.stringify({ error: 'No users with wallets found for census' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sort options by display_order
    const options = [...(poll.poll_options || [])].sort((a: any, b: any) => a.display_order - b.display_order);

    // Use the Vocdoni REST API to create the election
    // Step 1: Create census
    const censusCreateRes = await fetch(`${VOCDONI_API}/censuses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'weighted' }),
    });
    
    if (!censusCreateRes.ok) {
      const errText = await censusCreateRes.text();
      throw new Error(`Failed to create census: ${errText}`);
    }
    const censusData = await censusCreateRes.json();
    const censusId = censusData.censusID;

    // Step 2: Add participants to census
    for (const addr of walletAddresses) {
      await fetch(`${VOCDONI_API}/censuses/${censusId}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: [{ key: addr, weight: '1' }],
        }),
      });
    }

    // Step 3: Publish census
    const publishRes = await fetch(`${VOCDONI_API}/censuses/${censusId}/publish`, {
      method: 'POST',
    });
    if (!publishRes.ok) {
      const errText = await publishRes.text();
      throw new Error(`Failed to publish census: ${errText}`);
    }
    const publishData = await publishRes.json();
    const censusRoot = publishData.censusID;
    const censusURI = publishData.uri;

    // Note: Full election creation via REST API requires a signed transaction.
    // For the edge function, we store the census info and let the client-side SDK
    // handle the actual election creation with the organizer's wallet.
    // Instead, we'll store a placeholder and let the admin create via client SDK.

    // For now, return census info so the admin client can create the election
    return new Response(JSON.stringify({
      success: true,
      census_id: censusRoot,
      census_uri: censusURI,
      census_size: walletAddresses.length,
      poll_id,
      options: options.map((o: any, idx: number) => ({
        index: idx,
        label: o.label,
        option_id: o.id,
      })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
