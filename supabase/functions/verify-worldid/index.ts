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

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  const oid = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);
  const nullParam = new Uint8Array([0x05, 0x00]);
  const algoId = wrapSequence(new Uint8Array([...oid, ...nullParam]));
  const octetString = wrapTag(0x04, pkcs1Der);
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  return wrapSequence(new Uint8Array([...version, ...algoId, ...octetString]));
}

function wrapSequence(c: Uint8Array): Uint8Array { return wrapTag(0x30, c); }
function wrapTag(tag: number, c: Uint8Array): Uint8Array {
  const len = encodeDerLength(c.length);
  const r = new Uint8Array(1 + len.length + c.length);
  r[0] = tag; r.set(len, 1); r.set(c, 1 + len.length); return r;
}
function encodeDerLength(l: number): Uint8Array {
  if (l < 0x80) return new Uint8Array([l]);
  const b: number[] = []; let t = l;
  while (t > 0) { b.unshift(t & 0xff); t >>= 8; }
  return new Uint8Array([0x80 | b.length, ...b]);
}

function pemToPkcs8Pem(pem: string): string {
  if (pem.includes('BEGIN PRIVATE KEY')) return pem;
  const b64 = pem.replace(/-----BEGIN RSA PRIVATE KEY-----|-----END RSA PRIVATE KEY-----|\s/g, '');
  const pkcs8Der = pkcs1ToPkcs8(base64ToUint8Array(b64));
  const pkcs8B64 = btoa(String.fromCharCode(...pkcs8Der));
  const lines = pkcs8B64.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
}

async function signWeb3AuthJwt(nullifierHash: string): Promise<string> {
  const rawPem = Deno.env.get('WEB3AUTH_RSA_PRIVATE_KEY')!.replace(/\\n/g, '\n');
  const pkcs8Pem = pemToPkcs8Pem(rawPem);
  const privateKey = await importPKCS8(pkcs8Pem, 'RS256');
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
