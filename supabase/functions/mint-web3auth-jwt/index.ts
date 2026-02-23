import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT, importJWK } from "https://deno.land/x/jose@v5.2.0/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function normalizePem(raw: string): string {
  let pem = raw.replace(/\\n/g, '\n').replace(/\\r/g, '').trim();
  if (!pem.includes('-----BEGIN')) {
    try { const decoded = atob(pem); if (decoded.includes('-----BEGIN')) pem = decoded; } catch { /* not base64 */ }
  }
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

function wrapTag(tag: number, data: Uint8Array): Uint8Array {
  const len = encodeLength(data.length);
  const result = new Uint8Array(1 + len.length + data.length);
  result[0] = tag; result.set(len, 1); result.set(data, 1 + len.length);
  return result;
}

function wrapSequence(data: Uint8Array): Uint8Array { return wrapTag(0x30, data); }

function encodeLength(len: number): Uint8Array {
  if (len < 128) return new Uint8Array([len]);
  const bytes: number[] = []; let temp = len;
  while (temp > 0) { bytes.unshift(temp & 0xff); temp >>= 8; }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----BEGIN [A-Z ]+-----/g, '').replace(/-----END [A-Z ]+-----/g, '').replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  const isPkcs1 = pem.includes('RSA PRIVATE KEY');
  if (isPkcs1) {
    const rsaOid = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
    const algorithmIdentifier = wrapSequence(rsaOid);
    const octetString = wrapTag(0x04, binaryDer);
    const versionInt = new Uint8Array([0x02, 0x01, 0x00]);
    const pkcs8Der = wrapSequence(new Uint8Array([...versionInt, ...algorithmIdentifier, ...octetString]));
    return crypto.subtle.importKey('pkcs8', pkcs8Der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']);
  }
  return crypto.subtle.importKey('pkcs8', binaryDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get the user's nullifier_hash to use as sub
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('nullifier_hash')
      .eq('auth_uid', authUser.id)
      .single();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Sign a fresh JWT
    const rawPem = Deno.env.get('WEB3AUTH_RSA_PRIVATE_KEY')!;
    const pem = normalizePem(rawPem);
    const cryptoKey = await importRsaPrivateKey(pem);
    const jwk = await crypto.subtle.exportKey('jwk', cryptoKey);
    const privateKey = await importJWK({ ...jwk, alg: 'RS256' }, 'RS256');

    const jwt = await new SignJWT({ sub: user.nullifier_hash })
      .setProtectedHeader({ alg: 'RS256', kid: 'swarmbet-1' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .setAudience('web3auth')
      .setIssuer('swarmbet')
      .sign(privateKey);

    return new Response(JSON.stringify({ jwt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('mint-web3auth-jwt error:', err);
    return new Response(JSON.stringify({ error: 'Failed to mint JWT' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
