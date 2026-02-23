import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { importPKCS8, exportJWK, importJWK } from "https://deno.land/x/jose@v5.2.0/index.ts";

// Decode base64 to Uint8Array
function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Convert PKCS#1 DER to PKCS#8 DER by wrapping with the AlgorithmIdentifier
function pkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  // RSA OID: 1.2.840.113549.1.1.1
  const oid = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);
  const nullParam = new Uint8Array([0x05, 0x00]);
  
  // AlgorithmIdentifier SEQUENCE
  const algoIdContent = new Uint8Array([...oid, ...nullParam]);
  const algoId = wrapSequence(algoIdContent);
  
  // Wrap PKCS#1 key in OCTET STRING
  const octetString = wrapTag(0x04, pkcs1Der);
  
  // Version INTEGER 0
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  
  // PKCS#8 SEQUENCE
  return wrapSequence(new Uint8Array([...version, ...algoId, ...octetString]));
}

function wrapSequence(content: Uint8Array): Uint8Array {
  return wrapTag(0x30, content);
}

function wrapTag(tag: number, content: Uint8Array): Uint8Array {
  const len = encodeDerLength(content.length);
  const result = new Uint8Array(1 + len.length + content.length);
  result[0] = tag;
  result.set(len, 1);
  result.set(content, 1 + len.length);
  return result;
}

function encodeDerLength(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length]);
  const bytes: number[] = [];
  let tmp = length;
  while (tmp > 0) { bytes.unshift(tmp & 0xff); tmp >>= 8; }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function pemToPkcs8Pem(pem: string): string {
  // If already PKCS#8, return as-is
  if (pem.includes('BEGIN PRIVATE KEY')) return pem;
  
  // Extract base64 from PKCS#1 PEM
  const b64 = pem.replace(/-----BEGIN RSA PRIVATE KEY-----|-----END RSA PRIVATE KEY-----|\s/g, '');
  const pkcs1Der = base64ToUint8Array(b64);
  const pkcs8Der = pkcs1ToPkcs8(pkcs1Der);
  
  // Encode back to PEM
  const pkcs8B64 = btoa(String.fromCharCode(...pkcs8Der));
  const lines = pkcs8B64.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'public, max-age=3600',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawPem = Deno.env.get('WEB3AUTH_RSA_PRIVATE_KEY')!.replace(/\\n/g, '\n');
    console.log('PEM starts with:', rawPem.substring(0, 40));
    console.log('PEM contains BEGIN PRIVATE KEY:', rawPem.includes('BEGIN PRIVATE KEY'));
    console.log('PEM contains BEGIN RSA PRIVATE KEY:', rawPem.includes('BEGIN RSA PRIVATE KEY'));
    const pkcs8Pem = pemToPkcs8Pem(rawPem);
    const privateKey = await importPKCS8(pkcs8Pem, 'RS256');
    const jwk = await exportJWK(privateKey);

    // Only expose public components
    const publicJwk = {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      kid: 'swarmbet-1',
      use: 'sig',
      alg: 'RS256',
    };

    return new Response(JSON.stringify({ keys: [publicJwk] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('JWKS error:', err);
    return new Response(JSON.stringify({ error: 'Failed to serve JWKS' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
