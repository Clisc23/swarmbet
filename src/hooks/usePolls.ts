import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export function usePolls(status?: string) {
  return useQuery({
    queryKey: ['polls', status],
    queryFn: async () => {
      let query = supabase.from('polls').select('*, poll_options(*)').order('day_number', { ascending: true });
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as (Tables<'polls'> & { poll_options: Tables<'poll_options'>[] })[];
    },
  });
}

export function usePoll(pollId: string | undefined) {
  return useQuery({
    queryKey: ['poll', pollId],
    queryFn: async () => {
      if (!pollId) return null;
      const { data, error } = await supabase
        .from('polls')
        .select('*, poll_options(*)')
        .eq('id', pollId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!pollId,
  });
}

export function useUserVote(userId: string | undefined, pollId: string | undefined) {
  return useQuery({
    queryKey: ['vote', userId, pollId],
    queryFn: async () => {
      if (!userId || !pollId) return null;
      const { data } = await supabase
        .from('votes')
        .select('*')
        .eq('user_id', userId)
        .eq('poll_id', pollId)
        .maybeSingle();
      return data;
    },
    enabled: !!userId && !!pollId,
  });
}

export function useUserVotes(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-votes', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('user_id', userId)
        .order('voted_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}
