

## Fix Web3Auth Wallet Connection for Vocdoni Voting

### Problem

The persistent `Cannot read properties of null (reading 'loginWithSessionId')` error occurs because we're manually instantiating Web3Auth with `new Web3Auth()` and calling `init()` ourselves. The Modal SDK's internal session management tries to resume stale sessions before the Auth connector is fully initialized, causing a null reference.

### Root Cause

The official Web3Auth v10 custom JWT example (updated Jan 2026) uses the **React Provider pattern** (`Web3AuthProvider` from `@web3auth/modal/react`), NOT direct SDK instantiation. The provider handles initialization lifecycle, session recovery, and connector readiness internally -- avoiding the `loginWithSessionId` bug entirely.

Our current approach of `new Web3Auth()` + manual `init()` + `connectTo()` is fighting the SDK's internal state machine.

### Solution: Adopt the Official React Provider Pattern

Switch from manual SDK management to the official `Web3AuthProvider` + `useWeb3AuthConnect` hook pattern, matching Web3Auth's own custom JWT example exactly.

### Changes

**1. `src/lib/web3auth.ts` -- Simplify to config-only module**

Replace the entire manual init/connect/retry logic with:
- Export a `web3AuthConfig` object (just `clientId` + `web3AuthNetwork`) for the provider
- Export constants (`WEB3AUTH_CUSTOM_AUTH_CONNECTION_ID`)
- Remove `getWeb3Auth()`, `connectWithJwt()`, `getWalletAddress()`, `getWeb3AuthProvider()`
- These functions will be replaced by React hooks from `@web3auth/modal/react`

**2. `src/main.tsx` -- Wrap app in Web3AuthProvider**

```text
import { Web3AuthProvider } from "@web3auth/modal/react";
import { web3AuthConfig } from "./lib/web3auth";

createRoot(...).render(
  <Web3AuthProvider config={web3AuthConfig}>
    <App />
  </Web3AuthProvider>
);
```

**3. `src/contexts/AuthContext.tsx` -- Use hooks instead of manual SDK calls**

- Import `useWeb3AuthConnect`, `useWeb3AuthDisconnect` from `@web3auth/modal/react`
- Replace `connectWithJwt()` calls with `connectTo(WALLET_CONNECTORS.AUTH, { ... })`
- Replace `getWalletAddress()` with reading from the provider via viem
- Replace `getWeb3AuthProvider()` with accessing `web3auth.provider` from context
- Remove the localStorage cleanup / retry logic (provider handles sessions)
- Keep the `mintFreshJwtAndConnect` flow but use the hook's `connectTo` instead

**4. `src/lib/voting.ts` -- Get provider from context instead of global**

- Accept `provider` and `walletAddress` as parameters instead of calling `getWeb3AuthProvider()` / `getWalletAddress()` directly
- The calling components (HomePage, PollsPage) will pass these from AuthContext

**5. `src/pages/HomePage.tsx` and `src/pages/PollsPage.tsx` -- Pass wallet context to voting**

- Get `walletAddress` and provider from `useAuth()` 
- Pass them to `handleAnonymousVote(poll, optionIndex, provider, address)`

### Implementation Order

1. Update `src/lib/web3auth.ts` to export config object only
2. Wrap app in `Web3AuthProvider` in `src/main.tsx`
3. Rewrite wallet connection logic in `AuthContext.tsx` using hooks
4. Update `voting.ts` to accept provider/address as params
5. Update `HomePage.tsx` and `PollsPage.tsx` to pass wallet context
6. Test end-to-end: sign out, sign in, verify wallet connects, cast a vote

### Technical Details

Web3Auth config (matches official example exactly):

```text
// src/lib/web3auth.ts
import { WEB3AUTH_NETWORK, type Web3AuthOptions } from "@web3auth/modal";

export const WEB3AUTH_CLIENT_ID = "BKqVmzi9FtXmTw3SRZwnpj4k0d9FFfl_...";
export const WEB3AUTH_CUSTOM_AUTH_CONNECTION_ID = "swarmbet-auth-worldid-device";

export const web3AuthConfig = {
  web3AuthOptions: {
    clientId: WEB3AUTH_CLIENT_ID,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  } as Web3AuthOptions,
};
```

Provider setup in main.tsx:

```text
<Web3AuthProvider config={web3AuthConfig}>
  <QueryClientProvider client={queryClient}>
    ...
  </QueryClientProvider>
</Web3AuthProvider>
```

AuthContext wallet connection using hooks:

```text
const { connectTo, isConnected } = useWeb3AuthConnect();

const mintAndConnect = async () => {
  const { data } = await supabase.functions.invoke("mint-web3auth-jwt", {});
  await connectTo(WALLET_CONNECTORS.AUTH, {
    authConnection: AUTH_CONNECTION.CUSTOM,
    authConnectionId: WEB3AUTH_CUSTOM_AUTH_CONNECTION_ID,
    idToken: data.jwt,
    extraLoginOptions: { isUserIdCaseSensitive: false },
  });
};
```

### Why This Fixes the Problem

- The `Web3AuthProvider` manages the SDK lifecycle (init, session recovery, connector readiness) internally
- No more manual `init()` calls that race with session restoration
- No more `loginWithSessionId` null errors -- the provider resolves sessions before exposing `connectTo`
- The `useWeb3AuthConnect` hook only allows `connectTo` when the SDK is in a READY state
- Matches the official Web3Auth custom JWT example pattern exactly (verified Jan 2026 example)

