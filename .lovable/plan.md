

## Updated Plan: Web3Auth Custom JWT with RS256 + JWKS Endpoint

### What changed from the previous plan
The previous plan used HS256 (shared secret), but Web3Auth only supports asymmetric algorithms (RS256, ECDSA) verified via a JWKS endpoint. This updated plan uses **RS256** with a self-hosted JWKS endpoint.

### How it works

```text
1. User verifies with World ID
2. verify-worldid edge function validates proof, creates/finds user
3. verify-worldid signs a JWT (RS256) using a stored RSA private key
4. Frontend receives the JWT alongside the Supabase session
5. Frontend calls web3auth.connectTo() with the JWT -- no modal shown
6. Web3Auth fetches the JWKS endpoint to verify the JWT signature
7. Web3Auth silently provisions/recovers the user's embedded wallet
8. Wallet is available for Vocdoni vote signing (existing client-side flow)
```

### New edge function: `jwks`

A simple endpoint that serves the RSA public key in JWKS format. Web3Auth calls this to verify JWTs.

- URL: `https://lchhalwiijvgaffgfmjx.supabase.co/functions/v1/jwks`
- Returns a JSON object like:
```text
{
  "keys": [{
    "kty": "RSA",
    "kid": "swarmbet-1",
    "use": "sig",
    "alg": "RS256",
    "n": "<base64url-encoded modulus>",
    "e": "AQAB"
  }]
}
```
- The public key components are derived from the `WEB3AUTH_RSA_PRIVATE_KEY` secret at runtime (or a separate `WEB3AUTH_RSA_PUBLIC_KEY` secret for simplicity)
- No authentication required (public endpoint)

### New secret: `WEB3AUTH_RSA_PRIVATE_KEY`

An RSA private key in PEM format used to sign JWTs in the verify-worldid function. You can generate one with:

```text
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

The private key PEM content is stored as a backend secret. The public key is either derived from it at runtime or stored as a second secret.

### Web3Auth Dashboard Setup

After the JWKS endpoint is deployed:

1. Go to Web3Auth dashboard > your project > Authentication
2. Add a new **Custom JWT** connection
3. Set the **JWKS Endpoint** to: `https://lchhalwiijvgaffgfmjx.supabase.co/functions/v1/jwks`
4. Set **JWT User Identifier** field to: `sub`
5. Note the generated **authConnectionId** -- this goes into the frontend code

### Changes summary

**Files to create:**
- `supabase/functions/jwks/index.ts` -- Serves RSA public key in JWKS format

**Files to modify:**
- `supabase/functions/verify-worldid/index.ts` -- Sign and return an RS256 JWT after successful verification
- `src/lib/web3auth.ts` -- Replace `web3auth.connect()` with `web3auth.connectTo(WALLET_CONNECTORS.AUTH, { authConnection: AUTH_CONNECTION.CUSTOM, idToken: jwt })`
- `src/contexts/AuthContext.tsx` -- Silently connect Web3Auth using JWT after login; remove manual `connectWallet` logic; derive `walletAddress` from Web3Auth session
- `src/pages/AuthPage.tsx` -- Store the JWT from verify-worldid response and pass it to the Web3Auth connection flow
- `src/pages/ProfilePage.tsx` -- Remove "Set Up Wallet" button (wallets are auto-provisioned on login)
- `src/lib/voting.ts` -- Get the already-connected provider from AuthContext instead of calling `ensureWalletConnected()`
- `supabase/config.toml` -- Add `[functions.jwks]` with `verify_jwt = false`

**Files unchanged:**
- `src/lib/vocdoni.ts` -- Vocdoni SDK usage stays client-side with the Web3Auth provider
- `src/components/VoteSheet.tsx` -- No changes needed
- `supabase/functions/provision-wallet/index.ts` -- Still needed to store the real Web3Auth wallet address
- `supabase/functions/get-voter-wallets/index.ts` -- Still needed for census
- `supabase/functions/finalize-election/index.ts` -- Still needed

**No dependencies to add or remove** -- the existing `@web3auth/modal` package supports `connectTo()` with custom JWT.

### Technical details

**JWT structure (signed by verify-worldid):**
```text
Header: { "alg": "RS256", "typ": "JWT", "kid": "swarmbet-1" }
Payload: {
  "sub": "<nullifier_hash>",
  "iat": <unix_timestamp>,
  "exp": <unix_timestamp + 1 hour>,
  "aud": "web3auth",
  "iss": "swarmbet"
}
```

**JWT signing in edge function (using jose library):**
```text
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v5.2.0/index.ts";

const privateKey = await importPKCS8(rsaPem, "RS256");
const jwt = await new SignJWT({ sub: nullifier_hash })
  .setProtectedHeader({ alg: "RS256", kid: "swarmbet-1" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .setAudience("web3auth")
  .setIssuer("swarmbet")
  .sign(privateKey);
```

**JWKS endpoint (extracting public key from private key):**
```text
import { importPKCS8, exportJWK } from "https://deno.land/x/jose@v5.2.0/index.ts";

const privateKey = await importPKCS8(rsaPem, "RS256");
const jwk = await exportJWK(privateKey);
// Return only the public components (n, e) -- omit d, p, q, etc.
const publicJwk = { kty: jwk.kty, n: jwk.n, e: jwk.e, kid: "swarmbet-1", use: "sig", alg: "RS256" };
return { keys: [publicJwk] };
```

**Frontend silent connection:**
```text
import { WALLET_CONNECTORS, AUTH_CONNECTION } from '@web3auth/modal';

await web3auth.connectTo(WALLET_CONNECTORS.AUTH, {
  authConnection: AUTH_CONNECTION.CUSTOM,
  authConnectionId: "<from-dashboard>",
  idToken: jwt,
});
```

### Implementation order

1. Generate RSA keypair and add `WEB3AUTH_RSA_PRIVATE_KEY` as a secret
2. Create and deploy the `jwks` edge function
3. Configure the custom JWT connection in Web3Auth dashboard using the JWKS URL
4. Update `verify-worldid` to sign and return a JWT
5. Update `web3auth.ts` to use `connectTo` with the JWT
6. Update `AuthContext.tsx` to silently connect after login
7. Update `AuthPage.tsx` to pass the JWT through
8. Simplify `voting.ts` and `ProfilePage.tsx`

