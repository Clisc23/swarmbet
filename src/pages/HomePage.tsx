import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePolls, useUserVotes } from '@/hooks/usePolls';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { PollCard } from '@/components/PollCard';
import { VoteSheet } from '@/components/VoteSheet';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Flame, Target, TrendingUp, Calendar } from 'lucide-react';
import { formatPoints } from '@/lib/helpers';
import { castAnonymousVote } from '@/lib/vocdoni';
import { getWeb3Auth } from '@/lib/web3auth';
import type { Tables } from '@/integrations/supabase/types';

type Poll = Tables<'polls'> & { poll_options: Tables<'poll_options'>[] };

export default function HomePage() {
  const { profile, refreshProfile } = useAuth();
  const { data: polls, isLoading } = usePolls();
  const { data: userVotes } = useUserVotes(profile?.id);
  const [votingPoll, setVotingPoll] = useState<Poll | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const votedPollMap = new Map(
    (userVotes || []).map((v) => [v.poll_id, v.option_id])
  );

  const activePoll = polls?.find((p) => p.status === 'active');
  const recentPolls = polls?.filter((p) => p.status !== 'upcoming').slice(0, 5) || [];

  const handleSubmitVote = useCallback(async (optionId: string, confidence: string, optionIndex?: number) => {
    if (!votingPoll) return;
    setSubmitting(true);
    try {
      const isAnonymous = !!(votingPoll as any).vocdoni_election_id;
      let vocdoniVoteId: string | undefined;

      if (isAnonymous && optionIndex !== undefined) {
        // Cast anonymous vote via Vocdoni SDK
        const web3auth = await getWeb3Auth();
        if (!web3auth.provider) {
          // Need to connect wallet first
          await web3auth.connect();
        }
        if (!web3auth.provider) throw new Error('Wallet not connected');

        toast.info('Generating ZK proof...', { duration: 5000 });
        vocdoniVoteId = await castAnonymousVote(
          web3auth.provider,
          (votingPoll as any).vocdoni_election_id,
          optionIndex
        );
        // Store choice locally for immediate UI feedback
        localStorage.setItem(`vote_${votingPoll.id}`, optionId);
      }

      const { data, error } = await supabase.functions.invoke('submit-vote', {
        body: {
          poll_id: votingPoll.id,
          option_id: isAnonymous ? undefined : optionId,
          confidence,
          vocdoni_vote_id: vocdoniVoteId,
        },
      });

      if (error) throw error;
      if (data?.error) {
        if (data.error === 'Already voted on this poll') {
          toast.info('You already voted on this poll! 🗳️');
          setVotingPoll(null);
          queryClient.invalidateQueries({ queryKey: ['user-votes'] });
          return;
        }
        throw new Error(data.error);
      }

      toast.success(`+${formatPoints(data.points_earned)} points! 🎯`, {
        description: isAnonymous
          ? `Anonymous vote recorded 🛡️ Streak: ${data.current_streak} day${data.current_streak > 1 ? 's' : ''}`
          : `Streak: ${data.current_streak} day${data.current_streak > 1 ? 's' : ''} 🔥`,
      });

      setVotingPoll(null);
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      queryClient.invalidateQueries({ queryKey: ['user-votes'] });
      queryClient.invalidateQueries({ queryKey: ['points-history'] });
      refreshProfile();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit vote');
    } finally {
      setSubmitting(false);
    }
  }, [votingPoll, queryClient, refreshProfile]);

  const handleForceClose = useCallback(async (pollId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('close-polls', { body: { force_poll_id: pollId } }); // Note: close-polls now requires admin password; this call will fail for non-admin users
      if (error) throw error;
      toast.success('Poll closed & resolved! 🎉');
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      queryClient.invalidateQueries({ queryKey: ['user-votes'] });
      queryClient.invalidateQueries({ queryKey: ['points-history'] });
      refreshProfile();
    } catch (err: any) {
      toast.error(err.message || 'Failed to close poll');
    }
  }, [queryClient, refreshProfile]);

  const handleDemoAction = useCallback(async (pollId: string, action: 'reopen' | 'activate') => {
    try {
      const { error } = await supabase.functions.invoke('demo-poll-action', { body: { poll_id: pollId, action } });
      if (error) throw error;
      toast.success(action === 'reopen' ? 'Poll reopened! 🔄' : 'Poll activated! ▶️');
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      queryClient.invalidateQueries({ queryKey: ['user-votes'] });
      queryClient.invalidateQueries({ queryKey: ['points-history'] });
      refreshProfile();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update poll');
    }
  }, [queryClient, refreshProfile]);

  const campaignDay = polls?.find(p => p.status === 'active')?.day_number || 0;

  return (
    <div className="min-h-screen pb-20">
      <Header />

      <main className="mx-auto max-w-md px-4 py-4 space-y-6">
        {/* Stats strip */}
        {profile && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Flame, label: 'Streak', value: `${profile.current_streak || 0}d`, color: 'text-primary' },
              { icon: Target, label: 'Accuracy', value: `${((profile.accuracy_score || 0) * 100).toFixed(0)}%`, color: 'text-primary' },
              { icon: TrendingUp, label: 'Votes', value: String(profile.total_predictions || 0), color: 'text-foreground' },
              { icon: Calendar, label: 'Day', value: `${campaignDay}/30`, color: 'text-foreground' },
            ].map((stat) => (
              <div key={stat.label} className="glass rounded-xl p-2.5 text-center">
                <stat.icon className={`mx-auto h-4 w-4 mb-1 ${stat.color}`} />
                <p className="font-mono text-sm font-bold">{stat.value}</p>
                <p className="text-[9px] text-muted-foreground uppercase">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Active Poll */}
        {activePoll && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Today's Prediction
            </h2>
            <PollCard
              poll={activePoll}
              userVotedOptionId={votedPollMap.get(activePoll.id)}
              onVote={setVotingPoll}
              onForceClose={handleForceClose}
              onReopen={(id) => handleDemoAction(id, 'reopen')}
              onActivate={(id) => handleDemoAction(id, 'activate')}
            />
          </section>
        )}

        {/* Prize pool banner */}
        <div className="glass rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Campaign Prize Pool</p>
          <p className="text-3xl font-bold text-primary text-glow">3 ETH</p>
          <p className="text-xs text-muted-foreground mt-1">Top 10% of leaderboard shares the pool</p>
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full gradient-primary transition-all duration-500"
              style={{ width: `${Math.min((campaignDay / 30) * 100, 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">{30 - campaignDay} days remaining</p>
        </div>

        {/* Recent Polls */}
        {recentPolls.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Polls
            </h2>
            <div className="space-y-3">
              {recentPolls.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  userVotedOptionId={votedPollMap.get(poll.id)}
                  onVote={setVotingPoll}
                  onForceClose={handleForceClose}
                  onReopen={(id) => handleDemoAction(id, 'reopen')}
                  onActivate={(id) => handleDemoAction(id, 'activate')}
                />
              ))}
            </div>
          </section>
        )}

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-2xl p-4 animate-pulse">
                <div className="h-4 w-32 rounded bg-muted mb-3" />
                <div className="h-3 w-full rounded bg-muted mb-2" />
                <div className="h-10 w-full rounded-xl bg-muted mb-2" />
                <div className="h-10 w-full rounded-xl bg-muted" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !activePoll && recentPolls.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No polls yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Check back soon — daily predictions are coming!
            </p>
          </div>
        )}
      </main>

      <BottomNav />

      {/* Vote Sheet */}
      {votingPoll && (
        <VoteSheet
          poll={votingPoll}
          onSubmit={handleSubmitVote}
          onClose={() => setVotingPoll(null)}
          loading={submitting}
        />
      )}
    </div>
  );
}
