import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Poll = Tables<'polls'> & { poll_options: Tables<'poll_options'>[] };

/**
 * Handle vote submission (non-anonymous).
 */
export async function handleVote(
  poll: Poll,
  optionId: string,
  confidence: string
): Promise<void> {
  const { error } = await supabase.functions.invoke('submit-vote', {
    body: {
      poll_id: poll.id,
      option_id: optionId,
      confidence,
    },
  });
  if (error) throw error;
}
