import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT, importPKCS8, importJWK } from "https://deno.land/x/jose@v5.2.0/index.ts";

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

async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  // Extract base64 body from PEM
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(body), c => c.charCodeAt(0));

  const isPkcs1 = pem.includes('RSA PRIVATE KEY');

  if (isPkcs1) {
    // PKCS#1 format — use WebCrypto importKey with 'pkcs1' isn't supported,
    // so we wrap PKCS#1 DER into PKCS#8 DER
    // PKCS#8 wrapping: SEQUENCE { SEQUENCE { OID rsaEncryption, NULL }, OCTET STRING { pkcs1Der } }
    const rsaOid = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
    const algorithmIdentifier = wrapSequence(rsaOid);
    const octetString = wrapTag(0x04, binaryDer);
    const versionInt = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0
    const pkcs8Der = wrapSequence(new Uint8Array([...versionInt, ...algorithmIdentifier, ...octetString]));

    return crypto.subtle.importKey(
      'pkcs8', pkcs8Der,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true, ['sign']
    );
  }

  // Already PKCS#8
  return crypto.subtle.importKey(
    'pkcs8', binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true, ['sign']
  );
}

function wrapTag(tag: number, data: Uint8Array): Uint8Array {
  const len = encodeLength(data.length);
  const result = new Uint8Array(1 + len.length + data.length);
  result[0] = tag;
  result.set(len, 1);
  result.set(data, 1 + len.length);
  return result;
}

function wrapSequence(data: Uint8Array): Uint8Array {
  return wrapTag(0x30, data);
}

function encodeLength(len: number): Uint8Array {
  if (len < 128) return new Uint8Array([len]);
  const bytes: number[] = [];
  let temp = len;
  while (temp > 0) { bytes.unshift(temp & 0xff); temp >>= 8; }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

async function signWeb3AuthJwt(nullifierHash: string): Promise<string> {
  const rawPem = Deno.env.get('WEB3AUTH_RSA_PRIVATE_KEY')!;
  const pem = normalizePem(rawPem);
  const cryptoKey = await importRsaPrivateKey(pem);
  // Export as JWK and re-import via jose for signing
  const jwk = await crypto.subtle.exportKey('jwk', cryptoKey);
  const privateKey = await importJWK({ ...jwk, alg: 'RS256' }, 'RS256');
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
