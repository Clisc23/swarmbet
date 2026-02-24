import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';
import type { Tables } from '@/integrations/supabase/types';
import { useWeb3Auth, useWeb3AuthConnect, useWeb3AuthDisconnect } from '@web3auth/modal/react';
import { WALLET_CONNECTORS, AUTH_CONNECTION } from '@web3auth/modal';
import { WEB3AUTH_AUTH_CONNECTION_ID } from '@/lib/web3auth';

type UserProfile = Tables<'users'>;

interface AuthContextType {
  session: Session | null;
  authUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  walletAddress: string | null;
  walletProvider: any | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  connectWallet: (jwt: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  authUser: null,
  profile: null,
  loading: true,
  walletAddress: null,
  walletProvider: null,
  signOut: async () => {},
  refreshProfile: async () => {},
  connectWallet: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const { provider, isConnected } = useWeb3Auth();
  const { connectTo } = useWeb3AuthConnect();
  const { disconnect: web3AuthDisconnect } = useWeb3AuthDisconnect();
  const walletConnectingRef = useRef(false);

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

  // Extract wallet address from Web3Auth provider
  useEffect(() => {
    if (isConnected && provider) {
      (async () => {
        try {
          const accounts = await provider.request<never, string[]>({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            setWalletAddress(accounts[0]);
            // Update wallet in DB if needed
            if (profile && (!profile.wallet_address || profile.wallet_address !== accounts[0])) {
              await supabase
                .from('users')
                .update({ wallet_address: accounts[0] })
                .eq('id', profile.id);
              await refreshProfile();
            }
          }
        } catch (err) {
          console.error('Failed to get wallet address:', err);
        }
      })();
    }
  }, [isConnected, provider, profile?.id]);

  // Silent wallet connection using custom JWT
  const connectWallet = useCallback(async (jwt: string) => {
    if (walletConnectingRef.current || isConnected) return;
    walletConnectingRef.current = true;
    try {
      await connectTo(WALLET_CONNECTORS.AUTH, {
        authConnection: AUTH_CONNECTION.CUSTOM,
        authConnectionId: WEB3AUTH_AUTH_CONNECTION_ID,
        idToken: jwt,
        extraLoginOptions: {
          isUserIdCaseSensitive: false,
        },
      });
    } catch (err) {
      console.error('Silent wallet connection failed:', err);
    } finally {
      walletConnectingRef.current = false;
    }
  }, [connectTo, isConnected]);

  // On session restore, try to connect wallet if not already connected
  useEffect(() => {
    if (session && profile && !isConnected && !walletConnectingRef.current) {
      (async () => {
        try {
          const res = await supabase.functions.invoke('mint-web3auth-jwt');
          if (res.data?.jwt) {
            await connectWallet(res.data.jwt);
          }
        } catch (err) {
          console.error('Failed to mint JWT for wallet reconnect:', err);
        }
      })();
    }
  }, [session, profile, isConnected, connectWallet]);

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
    try {
      if (isConnected) {
        await web3AuthDisconnect();
      }
    } catch (err) {
      console.error('Web3Auth disconnect error:', err);
    }
    await supabase.auth.signOut();
    setProfile(null);
    setWalletAddress(null);
  };

  return (
    <AuthContext.Provider value={{
      session, authUser, profile, loading,
      walletAddress, walletProvider: provider,
      signOut, refreshProfile, connectWallet,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
