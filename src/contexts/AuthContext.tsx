import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';
import type { Tables } from '@/integrations/supabase/types';
import { useWeb3Auth } from '@web3auth/modal/react';
import { useWeb3AuthConnect } from '@web3auth/modal/react';
import { WALLET_CONNECTORS, AUTH_CONNECTION } from '@web3auth/modal';
import { WEB3AUTH_CUSTOM_AUTH_CONNECTION_ID } from '@/lib/web3auth';
import { createWalletClient, custom } from 'viem';
import { sepolia } from 'viem/chains';

type UserProfile = Tables<'users'>;

interface AuthContextType {
  session: Session | null;
  authUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  walletAddress: string | null;
  web3authProvider: any;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  authUser: null,
  profile: null,
  loading: true,
  walletAddress: null,
  web3authProvider: null,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const connectingRef = useRef(false);

  const { provider: web3authProvider, isConnected: web3authConnected, status: web3authStatus, web3Auth } = useWeb3Auth() as any;
  const { connectTo } = useWeb3AuthConnect();

  // Derive wallet address from Web3Auth provider when connected
  useEffect(() => {
    if (!web3authConnected || !web3authProvider) {
      setWalletAddress(null);
      return;
    }

    const deriveAddress = async () => {
      try {
        const walletClient = createWalletClient({
          chain: sepolia,
          transport: custom(web3authProvider),
        });
        const [address] = await walletClient.getAddresses();
        if (address) {
          setWalletAddress(address);
          await supabase.functions.invoke('provision-wallet', {
            body: { wallet_address: address },
          });
        }
      } catch (err) {
        console.error('[Web3Auth] Failed to derive address:', err);
      }
    };

    deriveAddress();
  }, [web3authConnected, web3authProvider]);

  // Wait for the AUTH connector to be ready
  const waitForAuthConnector = async (maxWaitMs = 30000): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        const connectors = web3Auth?.connectors as any[];
        const authConnector = connectors?.find((c: any) => c.name === 'auth');
        if (authConnector?.status === 'ready' || authConnector?.status === 'connected') {
          return true;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  };

  // Auto-connect wallet when profile loaded and Web3Auth is READY but not connected
  useEffect(() => {
    if (!profile) return;
    if (web3authConnected) return;
    if (web3authStatus !== 'ready') return;
    if (!web3Auth) return;

    let cancelled = false;

    const tryConnect = async () => {
      if (connectingRef.current) return;
      connectingRef.current = true;
      try {
        console.log('[Web3Auth] Waiting for AUTH connector to be ready...');
        const ready = await waitForAuthConnector();
        if (!ready || cancelled) {
          console.warn('[Web3Auth] AUTH connector did not become ready in time');
          return;
        }

        console.log('[Web3Auth] Minting fresh JWT...');
        const { data, error } = await supabase.functions.invoke('mint-web3auth-jwt', {});
        if (error || !data?.jwt) {
          console.error('[Web3Auth] Failed to mint JWT:', error || data);
          return;
        }
        console.log('[Web3Auth] JWT minted, connecting wallet...');
        await connectTo(WALLET_CONNECTORS.AUTH, {
          authConnection: AUTH_CONNECTION.CUSTOM,
          authConnectionId: WEB3AUTH_CUSTOM_AUTH_CONNECTION_ID,
          idToken: data.jwt,
        } as any);
        console.log('[Web3Auth] connectTo completed');
      } catch (err: any) {
        console.error('[Web3Auth] Wallet connection failed:', err);
      } finally {
        connectingRef.current = false;
      }
    };

    tryConnect();
    return () => { cancelled = true; };
  }, [profile, web3authConnected, web3authStatus, web3Auth, connectTo]);

  const fetchProfile = async (uid: string) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('auth_uid', uid)
      .maybeSingle();
    setProfile(data);
    return data;
  };

  const refreshProfile = async () => {
    if (authUser) {
      await fetchProfile(authUser.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setAuthUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchProfile(session.user.id), 0);
      } else {
        setProfile(null);
        setWalletAddress(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setWalletAddress(null);
  };

  return (
    <AuthContext.Provider value={{ session, authUser, profile, loading, walletAddress, web3authProvider, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
