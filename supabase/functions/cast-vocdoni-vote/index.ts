import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Derive a deterministic private key from nullifier_hash using HKDF
async function derivePrivateKey(nullifierHash: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const ikm = await crypto.subtle.importKey(
    'raw', enc.encode(nullifierHash), 'HKDF', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('swarmbet-wallet-v1'),
      info: enc.encode('ethereum-key'),
    },
    ikm,
    256
  );
  return new Uint8Array(derivedBits);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify user
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { election_id, option_index } = await req.json();

    if (!election_id || typeof election_id !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing election_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (typeof option_index !== 'number' || option_index < 0) {
      return new Response(JSON.stringify({ error: 'Invalid option_index' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get user's nullifier_hash
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('nullifier_hash')
      .eq('auth_uid', authUser.id)
      .single();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Derive the private key for signing
    const privateKeyBytes = await derivePrivateKey(user.nullifier_hash);
    const privateKeyHex = Array.from(privateKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    // For now, we log the vote intent. Full Vocdoni SDK integration requires
    // the @vocdoni/sdk package which needs ethers — to be added when Vocdoni
    // elections are actively used.
    console.log(`Cast vote: election=${election_id}, option=${option_index}, keyLen=${privateKeyHex.length}`);

    // TODO: When Vocdoni SDK is integrated:
    // 1. Create ethers.Wallet from privateKeyHex
    // 2. Initialize VocdoniSDKClient with wallet
    // 3. client.setElectionId(election_id)
    // 4. client.submitVote(new Vote([option_index]))
    // 5. Return vote confirmation hash

    // For now, return a placeholder vote ID
    const voteId = `vocdoni_${crypto.randomUUID().slice(0, 8)}`;

    return new Response(JSON.stringify({
      success: true,
      vocdoni_vote_id: voteId,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('cast-vocdoni-vote error:', err);
    return new Response(JSON.stringify({ error: 'Failed to cast vote' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
