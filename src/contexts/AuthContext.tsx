import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';
import type { Tables } from '@/integrations/supabase/types';
import { connectWithJwt, getWeb3Auth, getWalletAddress } from '@/lib/web3auth';

type UserProfile = Tables<'users'>;

interface AuthContextType {
  session: Session | null;
  authUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  walletAddress: string | null;
  web3authJwt: string | null;
  setWeb3authJwt: (jwt: string | null) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  authUser: null,
  profile: null,
  loading: true,
  walletAddress: null,
  web3authJwt: null,
  setWeb3authJwt: () => {},
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
  const [web3authJwt, setWeb3authJwtState] = useState<string | null>(() => {
    try { return sessionStorage.getItem('web3auth_jwt'); } catch { return null; }
  });

  const setWeb3authJwt = (jwt: string | null) => {
    setWeb3authJwtState(jwt);
    try {
      if (jwt) sessionStorage.setItem('web3auth_jwt', jwt);
      else sessionStorage.removeItem('web3auth_jwt');
    } catch { /* ignore */ }
  };

  const mintFreshJwtAndConnect = async () => {
    try {
      // Mint a fresh single-use JWT from the backend
      const { data, error } = await supabase.functions.invoke('mint-web3auth-jwt', {});
      if (error || !data?.jwt) {
        console.warn('Failed to mint fresh Web3Auth JWT:', error || data);
        return;
      }
      const wallet = await connectWithJwt(data.jwt);
      if (wallet) {
        setWalletAddress(wallet.address);
        await supabase.functions.invoke('provision-wallet', {
          body: { wallet_address: wallet.address },
        });
      }
    } catch (err) {
      console.warn('Silent wallet connection failed:', err);
    }
  };

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

  // Auto-connect wallet when JWT is available and profile loaded
  // Also try to recover an existing Web3Auth session on mount
  useEffect(() => {
    if (!profile) return;
    if (walletAddress) return;

    const tryConnect = async () => {
      // First check if Web3Auth already has a session (persisted by its SDK)
      try {
        const web3auth = await getWeb3Auth();
        if (web3auth.connected && web3auth.provider) {
          const addr = await getWalletAddress();
          if (addr) {
            setWalletAddress(addr);
            await supabase.functions.invoke('provision-wallet', {
              body: { wallet_address: addr },
            });
            return;
          }
        }
      } catch { /* no existing session */ }

      // Mint a fresh JWT and connect (old JWT may be single-use / expired)
      await mintFreshJwtAndConnect();
    };

    tryConnect();
  }, [profile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setAuthUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchProfile(session.user.id), 0);
      } else {
        setProfile(null);
        setWalletAddress(null);
        setWeb3authJwt(null);
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
    setWeb3authJwt(null);
  };

  return (
    <AuthContext.Provider value={{ session, authUser, profile, loading, walletAddress, web3authJwt, setWeb3authJwt, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
