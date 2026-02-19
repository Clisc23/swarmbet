import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useLeaderboard(limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['leaderboard', limit, offset],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_leaderboard', {
        page_limit: limit,
        page_offset: offset,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useUserRank(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-rank', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.rpc('get_user_rank', { target_user_id: userId });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

export function useTotalUsers() {
  return useQuery({
    queryKey: ['total-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_total_users');
      if (error) throw error;
      return data;
    },
  });
}
