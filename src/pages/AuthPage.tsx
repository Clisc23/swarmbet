import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Zap, Shield, Users, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { generateReferralCode } from '@/lib/helpers';

type Step = 'landing' | 'verify' | 'username';

export default function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('landing');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [tempAuthData, setTempAuthData] = useState<{ email: string; password: string } | null>(null);

  const handleWorldIdVerify = async () => {
    setStep('verify');
    // Mock World ID verification - simulate biometric scan
    await new Promise((r) => setTimeout(r, 2000));
    
    // Generate mock credentials
    const mockId = crypto.randomUUID().slice(0, 8);
    const email = `worldid_${mockId}@swarmbets.local`;
    const password = crypto.randomUUID();
    
    setTempAuthData({ email, password });
    setStep('username');
  };

  const handleCreateAccount = async () => {
    if (!tempAuthData || !username.trim()) return;
    if (username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      // Sign up
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: tempAuthData.email,
        password: tempAuthData.password,
      });

      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error('No user returned');

      // Create user profile
      const nullifierHash = `mock_${crypto.randomUUID()}`;
      const referralCode = generateReferralCode();

      const { error: profileError } = await supabase.from('users').insert({
        auth_uid: signUpData.user.id,
        username: username.trim().toLowerCase(),
        display_name: username.trim(),
        nullifier_hash: nullifierHash,
        referral_code: referralCode,
      });

      if (profileError) {
        if (profileError.message.includes('unique')) {
          toast.error('Username already taken');
          setLoading(false);
          return;
        }
        throw profileError;
      }

      // Award signup bonus
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('auth_uid', signUpData.user.id)
        .single();

      if (userData) {
        await supabase.from('points_history').insert({
          user_id: userData.id,
          amount: 100,
          type: 'signup',
          description: 'Welcome bonus',
        });
      }

      toast.success('Welcome to SwarmBet! 🎉');
      navigate('/');
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
            <h2 className="text-xl font-bold">Verifying Humanity</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Scanning World ID biometric proof...
            </p>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-2 w-2 rounded-full bg-primary animate-pulse"
                style={{ animationDelay: `${i * 0.3}s` }}
              />
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
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Username
              </label>
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

  // Landing
  return (
    <div className="flex min-h-screen flex-col items-center justify-between px-6 py-12">
      <div />
      
      <div className="flex flex-col items-center gap-8 text-center">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl gradient-primary glow-lg">
            <Zap className="h-10 w-10 text-primary-foreground" />
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
            { icon: Zap, label: '3 ETH', desc: 'Prize pool' },
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
        <Button
          onClick={handleWorldIdVerify}
          className="w-full rounded-xl py-6 text-base font-bold gradient-primary text-primary-foreground hover:opacity-90 glow-md"
        >
          <Globe className="mr-2 h-5 w-5" />
          Verify with World ID
        </Button>
        <p className="text-center text-[10px] text-muted-foreground">
          One person = one account. Powered by proof of personhood.
        </p>
      </div>
    </div>
  );
}
