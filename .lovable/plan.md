

## Rearchitect Wallet System: Server-Managed Wallets with Headless Vocdoni Voting

### Problem
Currently, Web3Auth's modal SDK (`@web3auth/modal`) requires users to authenticate separately (email/socials), presents a visible modal, and requires client-side transaction signing. This creates friction and a confusing UX.

### Solution
Replace the client-side Web3Auth modal approach with **server-managed wallets** where:
- A private key is deterministically derived from the user's World ID `nullifier_hash` during signup
- The private key is stored encrypted in the database (accessible only by edge functions via service role)
- All Vocdoni interactions (election creation, vote casting) happen entirely in edge functions using the server-held private key
- The user never sees a wallet modal or signs anything manually

### Architecture

```text
User Flow (Before):
  World ID --> Supabase Auth --> Web3Auth Modal (email/social) --> Wallet --> Client-side Vocdoni SDK

User Flow (After):
  World ID --> Supabase Auth --> Server derives wallet from nullifier_hash
                              --> Edge functions use private key for Vocdoni operations
                              --> User sees nothing wallet-related
```

### Changes

**1. Database: Add `wallet_private_key` column to `users` table**
- Add an encrypted private key column (only accessible via service role, never exposed to client)
- The existing `wallet_address` column continues to store the public address

**2. Edge Function: `verify-worldid` (modify)**
- During new user signup, generate a real Ethereum keypair deterministically from `nullifier_hash + server secret`
- Store both `wallet_address` (public) and `wallet_private_key` (encrypted) in the users table
- Remove the fake SHA-256 derived address

**3. Edge Function: `cast-vocdoni-vote` (new)**
- Accepts `poll_id`, `option_index` from the authenticated user
- Retrieves the user's private key from the database
- Uses the Vocdoni SDK with an ethers `Wallet` signer to:
  - If election is `pending`: create the election on-chain, finalize it
  - Cast the vote using `client.submitVote()`
- Returns the `vocdoni_vote_id` receipt
- This replaces all client-side Vocdoni logic

**4. Edge Function: `create-vocdoni-election` (modify)**
- Use a dedicated "organizer" wallet (server-side private key from env secret) to create elections
- No longer depends on a user's wallet for election creation

**5. Frontend: Remove Web3Auth entirely**
- Delete `src/lib/web3auth.ts`
- Delete `src/lib/vocdoni.ts` (all logic moves to edge functions)
- Simplify `src/lib/voting.ts` to just call the `cast-vocdoni-vote` edge function
- Remove Web3Auth from `AuthContext.tsx` (no more `connectWallet`, `walletAddress` state from Web3Auth)
- The `walletAddress` in context can come from the user's profile (`profile.wallet_address`) instead
- Remove `@web3auth/modal` and `@web3auth/ethereum-provider` dependencies
- Update `ProfilePage.tsx` to remove the "Set Up Wallet" button (wallets are auto-provisioned)

**6. Edge Function: `provision-wallet` (remove or repurpose)**
- No longer needed since wallets are created at signup time
- Can be removed entirely

**7. Edge Function: `get-voter-wallets` (keep)**
- Still needed for census building, no changes required

**8. Edge Function: `finalize-election` (keep)**
- Still needed for atomic election ID updates, no changes required

### Technical Details

**Wallet Derivation:**
```text
// In verify-worldid edge function
const seed = await crypto.subtle.digest('SHA-256',
  encoder.encode(nullifier_hash + WALLET_DERIVATION_SECRET));
// Use seed as private key for ethers.Wallet
const wallet = new ethers.Wallet(privateKeyHex);
// Store wallet.address and privateKeyHex in users table
```

The `WALLET_DERIVATION_SECRET` is an environment secret that ensures private keys can't be reconstructed without server access.

**Vocdoni Vote Casting (edge function):**
```text
// In cast-vocdoni-vote edge function
import { Wallet } from 'ethers';
import { VocdoniSDKClient, Vote } from '@vocdoni/sdk';

const wallet = new Wallet(user.wallet_private_key);
const client = new VocdoniSDKClient({ env: 'stg', wallet });
await client.createAccount();
client.setElectionId(electionId);
const voteId = await client.submitVote(new Vote([optionIndex]));
```

**New Secret Required:**
- `WALLET_DERIVATION_SECRET` - a random string used to derive wallet private keys deterministically

**Migration for Existing Users:**
- A one-time migration edge function can regenerate wallet keypairs for existing users using their `nullifier_hash` + the new secret

### Files to Create
- `supabase/functions/cast-vocdoni-vote/index.ts` - New edge function for server-side voting

### Files to Modify
- `supabase/functions/verify-worldid/index.ts` - Generate real keypair at signup
- `supabase/functions/create-vocdoni-election/index.ts` - Use organizer wallet from env
- `src/lib/voting.ts` - Simplify to call edge function only
- `src/contexts/AuthContext.tsx` - Remove Web3Auth, use profile.wallet_address
- `src/pages/ProfilePage.tsx` - Remove manual wallet provisioning UI
- `src/components/VoteSheet.tsx` - Minor cleanup (no wallet connection needed)

### Files to Delete
- `src/lib/web3auth.ts` - No longer needed
- `src/lib/vocdoni.ts` - Logic moves to edge functions
- `supabase/functions/provision-wallet/index.ts` - No longer needed

### Dependencies to Remove
- `@web3auth/modal`
- `@web3auth/ethereum-provider`
- `viem` (only used for Web3Auth wallet client)

