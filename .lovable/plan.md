

## Fix Web3Auth Wallet Connection for Vocdoni Voting

### Root Cause Analysis

Three issues are preventing Web3Auth from connecting:

1. **Chain ID mismatch** -- The Web3Auth dashboard is configured for **Sepolia** (chain ID `0xaa36a7`), but the client code initializes with **Ethereum Mainnet** (`0x1`). This causes the SDK to reject the connection.

2. **Missing `extraLoginOptions`** -- Web3Auth v10 custom JWT login requires `verifierIdField` and `isUserIdCaseSensitive` in the `connectTo` call. Without these, the SDK cannot map the JWT's `sub` claim to a user identity.

3. **Race condition** -- The `useEffect` in AuthContext fires twice (React strict mode + multiple profile updates), causing two simultaneous `mint-web3auth-jwt` calls and two `connectTo` attempts that conflict with each other.

### Changes

**1. `src/lib/web3auth.ts`**

- Change `chainId` from `'0x1'` to `'0xaa36a7'` (Sepolia)
- Change `rpcTarget` to a Sepolia RPC endpoint
- Update `displayName`, `blockExplorerUrl` to match Sepolia
- Add `extraLoginOptions` to the `connectTo` call with `verifierIdField: 'sub'` and `isUserIdCaseSensitive: false`
- Update viem chain import from `mainnet` to `sepolia` for wallet address derivation

**2. `src/contexts/AuthContext.tsx`**

- Add a `connectingRef` guard (React ref) to prevent concurrent wallet connection attempts
- Wrap `tryConnect` with this guard so only one connection attempt runs at a time

**3. Revert fallback behavior**

- `src/lib/voting.ts` -- Restore the original error throw when wallet is not connected (remove the silent fallback)
- `src/pages/HomePage.tsx` -- Restore anonymous poll logic: only send `option_id` for non-anonymous polls
- `src/pages/PollsPage.tsx` -- Same restoration as HomePage
- `supabase/functions/submit-vote/index.ts` -- Restore the `isAnonymous` check for `option_id` storage and vote count increment

### Technical Details

Chain config fix:
```text
chainId: '0xaa36a7'
rpcTarget: 'https://rpc.ankr.com/eth_sepolia'
displayName: 'Ethereum Sepolia'
blockExplorerUrl: 'https://sepolia.etherscan.io'
```

connectTo fix:
```text
await web3auth.connectTo(WALLET_CONNECTORS.AUTH, {
  authConnection: AUTH_CONNECTION.CUSTOM,
  authConnectionId: WEB3AUTH_CUSTOM_AUTH_CONNECTION_ID,
  idToken,
  extraLoginOptions: {
    verifierIdField: 'sub',
    isUserIdCaseSensitive: false,
  },
});
```

Race condition guard:
```text
const connectingRef = useRef(false);

// In tryConnect:
if (connectingRef.current) return;
connectingRef.current = true;
try { ... } finally { connectingRef.current = false; }
```

### Implementation Order

1. Fix chain config and connectTo params in `web3auth.ts`
2. Add race condition guard in `AuthContext.tsx`
3. Revert the fallback changes in `voting.ts`, `HomePage.tsx`, `PollsPage.tsx`, and `submit-vote/index.ts`
4. Deploy `submit-vote` edge function
5. Test end-to-end: sign out, sign in, vote on a poll

