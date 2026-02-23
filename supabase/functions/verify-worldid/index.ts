import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v5.2.0/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const APP_ID = "app_staging_9d76b538d092dff2d0252b5122a64585";
const ACTION = "swarmbet-login";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;


function normalizePem(raw: string): string {
  let pem = raw.replace(/\\n/g, '\n').replace(/\\r/g, '').trim();
  
  // If no PEM header, try base64 decode
  if (!pem.includes('-----BEGIN')) {
    try {
      const decoded = atob(pem);
      if (decoded.includes('-----BEGIN')) pem = decoded;
    } catch { /* not base64 */ }
  }
  
  // Re-chunk body into proper 64-char lines
  const headerMatch = pem.match(/-----BEGIN ([A-Z ]+)-----/);
  const footerMatch = pem.match(/-----END ([A-Z ]+)-----/);
  if (headerMatch && footerMatch) {
    const header = `-----BEGIN ${headerMatch[1]}-----`;
    const footer = `-----END ${footerMatch[1]}-----`;
    const bodyStart = pem.indexOf(header) + header.length;
    const bodyEnd = pem.indexOf(footer);
    const body = pem.substring(bodyStart, bodyEnd).replace(/[\s\n\r]/g, '');
    const chunks = body.match(/.{1,64}/g) || [];
    pem = `${header}\n${chunks.join('\n')}\n${footer}\n`;
  }
  
  return pem;
}

async function signWeb3AuthJwt(nullifierHash: string): Promise<string> {
  const rawPem = Deno.env.get('WEB3AUTH_RSA_PRIVATE_KEY')!;
  const pem = normalizePem(rawPem);
  console.log('PEM starts with:', pem.substring(0, 40));
  console.log('PEM length:', pem.length);
  console.log('PEM has PRIVATE KEY header:', pem.includes('PRIVATE KEY'));
  const privateKey = await importPKCS8(pem, 'RS256');
  return new SignJWT({ sub: nullifierHash })
    .setProtectedHeader({ alg: 'RS256', kid: 'swarmbet-1' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setAudience('web3auth')
    .setIssuer('swarmbet')
    .sign(privateKey);
}

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

    // Input validation
    if (typeof nullifier_hash !== 'string' || nullifier_hash.length < 10 || nullifier_hash.length > 200) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (typeof proof !== 'string' || proof.length > 5000) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: existingUser } = await supabase
      .from('users')
      .select('auth_uid')
      .eq('nullifier_hash', nullifier_hash)
      .maybeSingle();

    if (!existingUser && !username) {
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
        console.error('World ID verification failed');
        return new Response(JSON.stringify({ error: 'Verification failed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const email = `worldid_${nullifier_hash.slice(0, 16)}@swarmbets.local`;

    if (existingUser) {
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

      const web3auth_jwt = await signWeb3AuthJwt(nullifier_hash);

      return new Response(JSON.stringify({
        success: true,
        is_new_user: false,
        token_hash: sessionData.properties?.hashed_token,
        email,
        web3auth_jwt,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // New user — need username with validation
    if (!username || typeof username !== 'string' || !USERNAME_RE.test(username.trim())) {
      return new Response(JSON.stringify({
        success: true,
        is_new_user: true,
        needs_username: true,
        nullifier_hash,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cleanUsername = username.trim().toLowerCase();

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
    const referralCode = cleanUsername.slice(0, 4).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(nullifier_hash + authUid));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const walletAddress = '0x' + hashArray.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join('');

    const { error: profileError } = await supabase.from('users').insert({
      auth_uid: authUid,
      username: cleanUsername,
      display_name: username.trim(),
      nullifier_hash,
      referral_code: referralCode,
      wallet_address: walletAddress,
    });

    if (profileError) {
      await supabase.auth.admin.deleteUser(authUid);
      const isUsernameTaken = profileError.message?.includes('unique');
      return new Response(JSON.stringify({ error: isUsernameTaken ? 'Username already taken' : 'Failed to create profile' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: userData } = await supabase.from('users').select('id').eq('auth_uid', authUid).single();
    if (userData) {
      await supabase.from('points_history').insert({
        user_id: userData.id,
        amount: 100,
        type: 'signup',
        description: 'Welcome bonus',
      });
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (sessionError || !sessionData) {
      return new Response(JSON.stringify({ error: 'Account created but session failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const web3auth_jwt = await signWeb3AuthJwt(nullifier_hash);

    return new Response(JSON.stringify({
      success: true,
      is_new_user: true,
      token_hash: sessionData.properties?.hashed_token,
      email,
      web3auth_jwt,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('verify-worldid error:', err);
    return new Response(JSON.stringify({ error: 'Unable to process verification' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
