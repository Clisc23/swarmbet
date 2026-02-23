import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePointsHistory } from '@/hooks/usePoints';
import { useUserRank } from '@/hooks/useLeaderboard';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateAvatar, formatPoints } from '@/lib/helpers';

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  LogOut, Copy, Flame, Target, Trophy, Award, Gift, Check, Wallet
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ProfilePage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { data: pointsHistory } = usePointsHistory(profile?.id);
  const { data: userRank } = useUserRank(profile?.id);
  const [referralInput, setReferralInput] = useState('');
  const [claimingReferral, setClaimingReferral] = useState(false);
  const [copied, setCopied] = useState(false);
  const [walletCopied, setWalletCopied] = useState(false);
  const [provisioningWallet] = useState(false);
  const queryClient = useQueryClient();

  if (!profile) return null;

  const copyReferralCode = async () => {
    await navigator.clipboard.writeText(profile.referral_code);
    setCopied(true);
    toast.success('Referral code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const claimReferral = async () => {
    if (!referralInput.trim()) return;
    setClaimingReferral(true);
    try {
      const { data, error } = await supabase.functions.invoke('claim-referral', {
        body: { referral_code: referralInput.trim().toUpperCase() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Referral claimed! +100 pts 🎁`);
      setReferralInput('');
      refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['points-history'] });
    } catch (err: any) {
      toast.error(err.message || 'Invalid referral code');
    } finally {
      setClaimingReferral(false);
    }
  };

  const copyWalletAddress = async () => {
    if (!profile.wallet_address) return;
    await navigator.clipboard.writeText(profile.wallet_address);
    setWalletCopied(true);
    toast.success('Wallet address copied!');
    setTimeout(() => setWalletCopied(false), 2000);
  };

  // Wallet is now auto-provisioned on login via Web3Auth silent connection

  const pointTypeIcons: Record<string, string> = {
    signup: '🎉',
    vote: '🗳️',
    consensus_bonus: '👥',
    correct_prediction: '🎯',
    streak_multiplier: '🔥',
    referral_given: '📤',
    referral_received: '📥',
  };

  return (
    <div className="min-h-screen pb-20">
      <Header />
      <main className="mx-auto max-w-md px-4 py-4 space-y-5">
        {/* Profile card */}
        <div className="glass rounded-2xl p-5 text-center">
          <img
            src={generateAvatar(profile.avatar_seed || profile.id, 80)}
            alt=""
            className="mx-auto h-16 w-16 rounded-full bg-muted mb-3"
          />
          <h2 className="text-lg font-bold">{profile.display_name || profile.username}</h2>
          <p className="text-xs text-muted-foreground">@{profile.username}</p>
          
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-surface p-2.5">
              <Trophy className="mx-auto h-4 w-4 text-primary mb-1" />
              <p className="font-mono text-sm font-bold">#{userRank || '—'}</p>
              <p className="text-[9px] text-muted-foreground">RANK</p>
            </div>
            <div className="rounded-xl bg-surface p-2.5">
              <Flame className="mx-auto h-4 w-4 text-primary mb-1" />
              <p className="font-mono text-sm font-bold">{profile.max_streak || 0}</p>
              <p className="text-[9px] text-muted-foreground">BEST STREAK</p>
            </div>
            <div className="rounded-xl bg-surface p-2.5">
              <Target className="mx-auto h-4 w-4 text-primary mb-1" />
              <p className="font-mono text-sm font-bold">{((profile.accuracy_score || 0) * 100).toFixed(0)}%</p>
              <p className="text-[9px] text-muted-foreground">ACCURACY</p>
            </div>
          </div>
        </div>

        {/* Wallet */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Ethereum Wallet</h3>
          </div>
          {profile.wallet_address ? (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Your wallet address</p>
              <button
                onClick={copyWalletAddress}
                className="flex w-full items-center justify-between rounded-xl bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
              >
                <span className="font-mono text-xs text-primary truncate mr-2">
                  {profile.wallet_address.slice(0, 6)}...{profile.wallet_address.slice(-4)}
                </span>
                {walletCopied ? <Check className="h-4 w-4 text-primary shrink-0" /> : <Copy className="h-4 w-4 text-muted-foreground shrink-0" />}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground">Wallet will be set up automatically on your next login.</p>
            </div>
          )}
        </div>

        {/* Referral */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Referral Program</h3>
          </div>
          
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-2">Your code — share to earn 100 pts each</p>
            <button
              onClick={copyReferralCode}
              className="flex w-full items-center justify-between rounded-xl bg-surface px-4 py-3 transition-colors hover:bg-surface-hover"
            >
              <span className="font-mono font-bold tracking-wider text-primary">{profile.referral_code}</span>
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
            </button>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {profile.referral_count || 0} referrals
            </p>
          </div>

          {!profile.referred_by && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Have a referral code?</p>
              <div className="flex gap-2">
                <Input
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                  placeholder="SB-XXXXXX"
                  className="rounded-xl bg-surface border-border font-mono"
                />
                <Button
                  onClick={claimReferral}
                  disabled={claimingReferral || !referralInput}
                  size="sm"
                  className="rounded-xl gradient-primary text-primary-foreground px-4"
                >
                  Claim
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Points History */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Award className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Points History</h3>
          </div>
          
          {pointsHistory && pointsHistory.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pointsHistory.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{pointTypeIcons[entry.type] || '💰'}</span>
                    <div>
                      <p className="text-xs font-medium">{entry.description}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(entry.created_at!).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    'font-mono text-xs font-bold',
                    entry.amount > 0 ? 'text-primary' : 'text-destructive'
                  )}>
                    +{formatPoints(entry.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No points earned yet</p>
          )}
        </div>

        {/* Sign out */}
        <Button
          onClick={signOut}
          variant="outline"
          className="w-full rounded-xl border-border text-muted-foreground hover:text-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </main>
      <BottomNav />
    </div>
  );
}
