import { useAuth } from '@/contexts/AuthContext';
import { usePolls, useUserVotes } from '@/hooks/usePolls';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { PollCard } from '@/components/PollCard';
import { VoteSheet } from '@/components/VoteSheet';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatPoints } from '@/lib/helpers';
import { handleAnonymousVote } from '@/lib/voting';
import type { Tables } from '@/integrations/supabase/types';

type Poll = Tables<'polls'> & { poll_options: Tables<'poll_options'>[] };

export default function PollsPage() {
  const { profile } = useAuth();
  const { data: polls, isLoading } = usePolls();
  const { data: userVotes } = useUserVotes(profile?.id);
  const [votingPoll, setVotingPoll] = useState<Poll | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const votedPollMap = new Map(
    (userVotes || []).map((v) => [v.poll_id, v.option_id])
  );

  const activePolls = polls?.filter(p => p.status === 'active') || [];
  const closedPolls = polls?.filter(p => p.status === 'closed' || p.status === 'resolved') || [];
  const upcomingPolls = polls?.filter(p => p.status === 'upcoming') || [];

  const handleSubmitVote = useCallback(async (optionId: string, confidence: string, optionIndex?: number) => {
    if (!votingPoll) return;
    setSubmitting(true);
    try {
      const isAnonymous = !!(votingPoll as any).vocdoni_election_id;
      let vocdoniVoteId: string | undefined;

      if (isAnonymous && optionIndex !== undefined) {
        vocdoniVoteId = await handleAnonymousVote(votingPoll, optionIndex);
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
      if (data?.error) throw new Error(data.error);

      toast.success(`+${formatPoints(data.points_earned)} points! 🎯`);
      setVotingPoll(null);
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      queryClient.invalidateQueries({ queryKey: ['user-votes'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit vote');
    } finally {
      setSubmitting(false);
    }
  }, [votingPoll, queryClient]);

  const handleForceClose = useCallback(async (pollId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('close-polls', { body: { force_poll_id: pollId } }); // Note: close-polls now requires admin password; this call will fail for non-admin users
      if (error) throw error;
      toast.success('Poll closed & resolved! 🎉');
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      queryClient.invalidateQueries({ queryKey: ['user-votes'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to close poll');
    }
  }, [queryClient]);

  const handleDemoAction = useCallback(async (pollId: string, action: 'reopen' | 'activate') => {
    try {
      const { error } = await supabase.functions.invoke('demo-poll-action', { body: { poll_id: pollId, action } });
      if (error) throw error;
      toast.success(action === 'reopen' ? 'Poll reopened! 🔄' : 'Poll activated! ▶️');
      queryClient.invalidateQueries({ queryKey: ['polls'] });
      queryClient.invalidateQueries({ queryKey: ['user-votes'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to update poll');
    }
  }, [queryClient]);

  return (
    <div className="min-h-screen pb-20">
      <Header />
      <main className="mx-auto max-w-md px-4 py-4 space-y-6">
        <h1 className="text-xl font-bold">All Polls</h1>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="glass rounded-2xl p-4 animate-pulse">
                <div className="h-4 w-32 rounded bg-muted mb-3" />
                <div className="h-10 w-full rounded-xl bg-muted" />
              </div>
            ))}
          </div>
        )}

        {activePolls.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Active</h2>
            <div className="space-y-3">
              {activePolls.map(p => (
                <PollCard key={p.id} poll={p} userVotedOptionId={votedPollMap.get(p.id)} onVote={setVotingPoll} onForceClose={handleForceClose} onReopen={(id) => handleDemoAction(id, 'reopen')} onActivate={(id) => handleDemoAction(id, 'activate')} />
              ))}
            </div>
          </section>
        )}

        {upcomingPolls.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</h2>
            <div className="space-y-3">
              {upcomingPolls.map(p => (
                <PollCard key={p.id} poll={p} userVotedOptionId={votedPollMap.get(p.id)} onActivate={(id) => handleDemoAction(id, 'activate')} />
              ))}
            </div>
          </section>
        )}

        {closedPolls.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completed</h2>
            <div className="space-y-3">
              {closedPolls.map(p => (
                <PollCard key={p.id} poll={p} userVotedOptionId={votedPollMap.get(p.id)} onReopen={(id) => handleDemoAction(id, 'reopen')} />
              ))}
            </div>
          </section>
        )}

        {!isLoading && !polls?.length && (
          <div className="py-16 text-center text-muted-foreground text-sm">
            No polls available yet
          </div>
        )}
      </main>
      <BottomNav />

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
