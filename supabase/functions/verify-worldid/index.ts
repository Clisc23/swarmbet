import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const APP_ID = "app_staging_9d76b538d092dff2d0252b5122a64585";
const ACTION = "swarmbet-login";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { proof, merkle_root, nullifier_hash, verification_level, username } = await req.json();

    if (!proof || !nullifier_hash || !merkle_root || !verification_level) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client first to check for existing users
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check if this nullifier_hash already has an account BEFORE calling World ID API
    const { data: existingUser } = await supabase
      .from('users')
      .select('auth_uid')
      .eq('nullifier_hash', nullifier_hash)
      .maybeSingle();

    // Only verify with World ID API for NEW users (to avoid max_verifications_reached error)
    if (!existingUser) {
      const verifyRes = await fetch(`https://developer.worldcoin.org/api/v2/verify/${APP_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: ACTION,
          proof,
          nullifier_hash,
          merkle_root,
          verification_level,
        }),
      });

      if (!verifyRes.ok) {
        const errBody = await verifyRes.json().catch(() => ({}));
        console.error('World ID verification failed:', errBody);
        return new Response(JSON.stringify({ error: 'World ID verification failed', detail: errBody }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const email = `worldid_${nullifier_hash.slice(0, 16)}@swarmbets.local`;

    if (existingUser) {
      // Returning user — generate magic link token
      const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });

      if (sessionError || !sessionData) {
        console.error('Failed to generate session:', sessionError);
        return new Response(JSON.stringify({ error: 'Failed to create session' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        is_new_user: false,
        token_hash: sessionData.properties?.hashed_token,
        email,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // New user — need username
    if (!username || username.trim().length < 3) {
      return new Response(JSON.stringify({
        success: true,
        is_new_user: true,
        needs_username: true,
        nullifier_hash,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create auth user
    const password = crypto.randomUUID();
    const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (signUpError || !signUpData.user) {
      console.error('Failed to create auth user:', signUpError);
      return new Response(JSON.stringify({ error: 'Failed to create account' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authUid = signUpData.user.id;
    const referralCode = username.trim().slice(0, 4).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

    const { error: profileError } = await supabase.from('users').insert({
      auth_uid: authUid,
      username: username.trim().toLowerCase(),
      display_name: username.trim(),
      nullifier_hash,
      referral_code: referralCode,
    });

    if (profileError) {
      await supabase.auth.admin.deleteUser(authUid);
      const msg = profileError.message.includes('unique') ? 'Username already taken' : profileError.message;
      return new Response(JSON.stringify({ error: msg }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Award signup bonus
    const { data: userData } = await supabase.from('users').select('id').eq('auth_uid', authUid).single();
    if (userData) {
      await supabase.from('points_history').insert({
        user_id: userData.id,
        amount: 100,
        type: 'signup',
        description: 'Welcome bonus',
      });
    }

    // Generate session for the new user
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (sessionError || !sessionData) {
      return new Response(JSON.stringify({ error: 'Account created but session failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      is_new_user: true,
      token_hash: sessionData.properties?.hashed_token,
      email,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
