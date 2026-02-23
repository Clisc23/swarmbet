import { Web3Auth, WALLET_CONNECTORS, AUTH_CONNECTION } from '@web3auth/modal';
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from '@web3auth/modal';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { createWalletClient, custom } from 'viem';
import { sepolia } from 'viem/chains';

const WEB3AUTH_CLIENT_ID = 'BKqVmzi9FtXmTw3SRZwnpj4k0d9FFfl_54OPYhOGkEkJYs6FGblWZdvOHRSy5Yc1vc25EkkNEGMTyH_qTguUfEI';

const WEB3AUTH_CUSTOM_AUTH_CONNECTION_ID = 'swarmbet-auth-worldid-device';

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: '0xaa36a7',
  rpcTarget: 'https://rpc.ankr.com/eth_sepolia',
  displayName: 'Ethereum Sepolia',
  blockExplorerUrl: 'https://sepolia.etherscan.io',
  ticker: 'ETH',
  tickerName: 'Ethereum',
};

let web3authInstance: Web3Auth | null = null;
let initPromise: Promise<Web3Auth> | null = null;

export async function getWeb3Auth(): Promise<Web3Auth> {
  if (web3authInstance) return web3authInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const privateKeyProvider = new EthereumPrivateKeyProvider({
      config: { chainConfig },
    });

    const web3auth = new Web3Auth({
      clientId: WEB3AUTH_CLIENT_ID,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
      privateKeyProvider: privateKeyProvider as any,
      modalConfig: {
        connectors: {
          [WALLET_CONNECTORS.AUTH]: {
            label: 'Auth',
            loginMethods: {
              custom: {
                name: 'WorldID Login',
                authConnectionId: WEB3AUTH_CUSTOM_AUTH_CONNECTION_ID,
                showOnModal: false,
              },
            },
          },
        },
      },
    });

    await web3auth.init();
    console.log('[Web3Auth] init complete, status:', web3auth.status);
    web3authInstance = web3auth;
    initPromise = null;
    return web3auth;
  })();

  return initPromise;
}

/**
 * Silently connect Web3Auth using a custom JWT (RS256).
 * No modal is shown — the JWT proves identity.
 */
export async function connectWithJwt(idToken: string): Promise<{ provider: any; address: string } | null> {
  try {
    console.log('[Web3Auth] connectWithJwt called');
    const web3auth = await getWeb3Auth();
    console.log('[Web3Auth] init done, status:', web3auth.status, 'connected:', web3auth.connected);

    // If already connected, just return current wallet
    if (web3auth.connected && web3auth.provider) {
      console.log('[Web3Auth] Already connected, returning existing wallet');
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(web3auth.provider),
      });
      const [address] = await walletClient.getAddresses();
      if (address) return { provider: web3auth.provider, address };
    }

    // Clear any stale session before connecting
    if (web3auth.connected) {
      console.log('[Web3Auth] Clearing stale session...');
      try { await web3auth.logout(); } catch { /* ignore */ }
    }

    // Silent login with custom JWT
    console.log('[Web3Auth] Calling connectTo with custom JWT...');
    const provider = await web3auth.connectTo(WALLET_CONNECTORS.AUTH, {
      authConnection: AUTH_CONNECTION.CUSTOM,
      authConnectionId: WEB3AUTH_CUSTOM_AUTH_CONNECTION_ID,
      idToken,
      extraLoginOptions: {
        isUserIdCaseSensitive: false,
      },
    } as any);

    console.log('[Web3Auth] connectTo completed, provider:', !!provider);
    if (!provider) return null;

    const walletClient = createWalletClient({
      chain: sepolia,
      transport: custom(provider),
    });
    const [address] = await walletClient.getAddresses();
    if (!address) return null;

    return { provider, address };
  } catch (err) {
    console.error('[Web3Auth] connectWithJwt FAILED:', err);
    // If it's a session or connector issue, try clearing and retrying once
    if (String(err).includes('loginWithSessionId') || String(err).includes('not ready yet')) {
      console.log('[Web3Auth] Clearing localStorage session data and retrying...');
      try {
        // Clear Web3Auth session data from localStorage
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('web3auth') || key.includes('openlogin') || key.includes('session'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        
        // Re-init and retry
        web3authInstance = null;
        initPromise = null;
        const web3auth = await getWeb3Auth();
        
        // Wait a tick for connectors to be fully ready
        await new Promise(r => setTimeout(r, 500));
        
        console.log('[Web3Auth] Retry: status:', web3auth.status, 'connected:', web3auth.connected);
        const provider = await web3auth.connectTo(WALLET_CONNECTORS.AUTH, {
          authConnection: AUTH_CONNECTION.CUSTOM,
          authConnectionId: WEB3AUTH_CUSTOM_AUTH_CONNECTION_ID,
          idToken,
          extraLoginOptions: {
            isUserIdCaseSensitive: false,
          },
        } as any);
        
        if (!provider) return null;
        const walletClient = createWalletClient({
          chain: sepolia,
          transport: custom(provider),
        });
        const [address] = await walletClient.getAddresses();
        return address ? { provider, address } : null;
      } catch (retryErr) {
        console.error('[Web3Auth] Retry also failed:', retryErr);
        return null;
      }
    }
    return null;
  }
}

/**
 * Get the wallet address from an active Web3Auth session.
 */
export async function getWalletAddress(): Promise<string | null> {
  try {
    const web3auth = await getWeb3Auth();
    if (!web3auth.connected || !web3auth.provider) return null;

    const walletClient = createWalletClient({
      chain: sepolia,
      transport: custom(web3auth.provider),
    });

    const [address] = await walletClient.getAddresses();
    return address || null;
  } catch {
    return null;
  }
}

/**
 * Get the Web3Auth provider if already connected.
 */
export function getWeb3AuthProvider(): any | null {
  return web3authInstance?.provider ?? null;
}
