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

  const handleSubmitVote = useCallback(async (optionId: string, confidence: string) => {
    if (!votingPoll) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-vote', {
        body: { poll_id: votingPoll.id, option_id: optionId, confidence },
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
                <PollCard key={p.id} poll={p} userVotedOptionId={votedPollMap.get(p.id)} onVote={setVotingPoll} />
              ))}
            </div>
          </section>
        )}

        {upcomingPolls.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</h2>
            <div className="space-y-3">
              {upcomingPolls.map(p => (
                <PollCard key={p.id} poll={p} userVotedOptionId={votedPollMap.get(p.id)} />
              ))}
            </div>
          </section>
        )}

        {closedPolls.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completed</h2>
            <div className="space-y-3">
              {closedPolls.map(p => (
                <PollCard key={p.id} poll={p} userVotedOptionId={votedPollMap.get(p.id)} />
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
