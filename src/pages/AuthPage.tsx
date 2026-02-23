import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IDKitWidget, ISuccessResult, VerificationLevel } from '@worldcoin/idkit';
import { supabase } from '@/integrations/supabase/client';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Users, Globe, Trophy } from 'lucide-react';
import { BeeIcon } from '@/components/BeeIcon';
import { toast } from 'sonner';

const WORLD_ID_APP_ID = 'app_staging_9d76b538d092dff2d0252b5122a64585';
const WORLD_ID_ACTION = 'swarmbet-login';

type Step = 'landing' | 'verify' | 'username';

export default function AuthPage() {
  const navigate = useNavigate();
  const { session, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>('landing');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [worldIdProof, setWorldIdProof] = useState<ISuccessResult | null>(null);

  useEffect(() => {
    if (session && profile) {
      navigate('/', { replace: true });
    }
  }, [session, profile, navigate]);

  const handleVerify = async (result: ISuccessResult) => {
    // This is called by IDKit before onSuccess to let you verify on backend
    // We do the actual verification in onSuccess
    console.log('IDKit verify callback:', result);
  };

  const handleWorldIdSuccess = async (result: ISuccessResult) => {
    setWorldIdProof(result);
    setStep('verify');

    try {
      const res = await supabase.functions.invoke('verify-worldid', {
        body: {
          proof: result.proof,
          nullifier_hash: result.nullifier_hash,
          merkle_root: result.merkle_root,
          verification_level: result.verification_level,
        },
      });

      if (res.error) {
        console.error('Verification error:', res.error);
        toast.error('Verification failed. Please try again.');
        setStep('landing');
        return;
      }

      const data = res.data;

      if (data.error) {
        toast.error(data.error);
        setStep('landing');
        return;
      }

      if (data.needs_username) {
        // New user — ask for username
        setStep('username');
        return;
      }

      // Returning user — sign in
      if (data.token_hash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: 'email',
          token_hash: data.token_hash,
        });

        if (otpError) {
          console.error('OTP error:', otpError);
          toast.error('Failed to sign in. Please try again.');
          setStep('landing');
          return;
        }

        await refreshProfile();
        toast.success('Welcome back! 🎉');
        navigate('/');
      }
    } catch (err: any) {
      console.error('Error:', err);
      toast.error('Something went wrong. Please try again.');
      setStep('landing');
    }
  };

  const handleCreateAccount = async () => {
    if (!username.trim() || username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }
    if (!worldIdProof) {
      toast.error('World ID verification required');
      setStep('landing');
      return;
    }

    setLoading(true);
    try {
      const res = await supabase.functions.invoke('verify-worldid', {
        body: {
          proof: worldIdProof.proof,
          nullifier_hash: worldIdProof.nullifier_hash,
          merkle_root: worldIdProof.merkle_root,
          verification_level: worldIdProof.verification_level,
          username: username.trim(),
        },
      });

      if (res.error) {
        toast.error('Failed to create account');
        setLoading(false);
        return;
      }

      const data = res.data;

      if (data.error) {
        toast.error(data.error);
        setLoading(false);
        return;
      }

      if (data.token_hash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: 'email',
          token_hash: data.token_hash,
        });

        if (otpError) {
          console.error('OTP error:', otpError);
          toast.error('Account created but sign-in failed. Try again.');
          setStep('landing');
          setLoading(false);
          return;
        }

        await refreshProfile();
        toast.success('Welcome to SwarmBet! 🎉');
        navigate('/');
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'verify') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative">
            <div className="h-24 w-24 rounded-full border-2 border-primary/30 animate-pulse-glow flex items-center justify-center">
              <Globe className="h-10 w-10 text-primary animate-spin" style={{ animationDuration: '3s' }} />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold">Verifying with World ID</h2>
            <p className="mt-2 text-sm text-muted-foreground">Checking your proof of personhood...</p>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'username') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary">
              <Shield className="h-8 w-8 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold">Verified Human ✓</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose your SwarmBet identity</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Username</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="satoshi_nakamoto"
                className="rounded-xl border-border bg-surface py-6 text-base"
                maxLength={20}
              />
              <p className="mt-1 text-xs text-muted-foreground">3-20 characters, letters, numbers, underscores</p>
            </div>
            <Button
              onClick={handleCreateAccount}
              disabled={loading || username.length < 3}
              className="w-full rounded-xl py-6 text-base font-bold gradient-primary text-primary-foreground hover:opacity-90"
            >
              {loading ? 'Creating...' : 'Enter the Swarm'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-between px-6 py-12">
      <div />
      <div className="flex flex-col items-center gap-8 text-center">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl gradient-primary glow-lg">
            <BeeIcon className="h-10 w-10 text-primary-foreground" />
          </div>
        </div>
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            Swarm<span className="text-primary">Bet</span>
          </h1>
          <p className="mt-3 text-base text-muted-foreground leading-relaxed max-w-xs">
            Predict sports outcomes with verified humans. Earn points. Share the prize pool.
          </p>
        </div>
        <div className="flex gap-6 text-center">
          {[
            { icon: Shield, label: 'Verified', desc: 'Sybil-proof' },
            { icon: Users, label: 'Swarm', desc: 'Crowd wisdom' },
            { icon: Trophy, label: '3 ETH', desc: 'Prize pool' },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-1.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs font-semibold">{item.label}</p>
              <p className="text-[10px] text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <IDKitWidget
          app_id={WORLD_ID_APP_ID as `app_${string}`}
          action={WORLD_ID_ACTION}
          verification_level={VerificationLevel.Device}
          handleVerify={handleVerify}
          onSuccess={handleWorldIdSuccess}
        >
          {({ open }) => (
            <Button
              onClick={open}
              className="w-full rounded-xl py-6 text-base font-bold gradient-primary text-primary-foreground hover:opacity-90 glow-md"
            >
              <Globe className="mr-2 h-5 w-5" />
              Verify with World ID
            </Button>
          )}
        </IDKitWidget>
        <p className="text-center text-[10px] text-muted-foreground">
          One person = one account. Powered by proof of personhood.
        </p>
      </div>
    </div>
  );
}
