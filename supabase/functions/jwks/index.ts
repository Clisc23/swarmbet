import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Cache-Control': 'public, max-age=3600',
};

function base64ToUint8Array(b64: string): Uint8Array {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function encodeDerLength(l: number): Uint8Array {
  if (l < 0x80) return new Uint8Array([l]);
  const b: number[] = []; let t = l;
  while (t > 0) { b.unshift(t & 0xff); t >>= 8; }
  return new Uint8Array([0x80 | b.length, ...b]);
}

function wrapTag(tag: number, c: Uint8Array): Uint8Array {
  const len = encodeDerLength(c.length);
  const r = new Uint8Array(1 + len.length + c.length);
  r[0] = tag; r.set(len, 1); r.set(c, 1 + len.length); return r;
}

function wrapSequence(c: Uint8Array): Uint8Array { return wrapTag(0x30, c); }

function pkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  const oid = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);
  const nullParam = new Uint8Array([0x05, 0x00]);
  const algoId = wrapSequence(new Uint8Array([...oid, ...nullParam]));
  const octetString = wrapTag(0x04, pkcs1Der);
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  return wrapSequence(new Uint8Array([...version, ...algoId, ...octetString]));
}

function pemToDer(rawEnv: string): Uint8Array {
  let pem = rawEnv.replace(/\\n/g, '\n').trim();
  
  const isPkcs8 = pem.includes('BEGIN PRIVATE KEY');
  
  const b64 = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  
  const der = base64ToUint8Array(b64);
  
  // If PKCS#1, convert to PKCS#8
  return isPkcs8 ? der : pkcs1ToPkcs8(der);
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 1024;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawPem = Deno.env.get('WEB3AUTH_RSA_PRIVATE_KEY')!;
    const pkcs8Der = pemToDer(rawPem);
    
    // Import private key as extractable
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8Der,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['sign']
    );
    
    // Export private key as JWK to get n and e
    const privJwk = await crypto.subtle.exportKey('jwk', privateKey);
    
    // Re-import as public key only (n, e) then export — ensures clean public JWK
    const pubCryptoKey = await crypto.subtle.importKey(
      'jwk',
      { kty: privJwk.kty, n: privJwk.n, e: privJwk.e },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['verify']
    );
    const pubJwk = await crypto.subtle.exportKey('jwk', pubCryptoKey);

    const publicJwk = {
      kty: pubJwk.kty,
      kid: 'swarmbet-1',
      use: 'sig',
      alg: 'RS256',
      n: pubJwk.n,
      e: pubJwk.e,
      key_ops: ['verify'],
      ext: true,
    };

    return new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('JWKS error:', err);
    return new Response(JSON.stringify({ error: 'Failed to serve JWKS', detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
