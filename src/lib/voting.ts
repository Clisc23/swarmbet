import { supabase } from '@/integrations/supabase/client';
import { castAnonymousVote, createElectionForPoll } from '@/lib/vocdoni';
import { getWeb3AuthProvider, getWalletAddress } from '@/lib/web3auth';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Poll = Tables<'polls'> & { poll_options: Tables<'poll_options'>[] };

/**
 * Provisions the user's Web3Auth wallet address in the backend if not already set.
 */
async function ensureWalletProvisioned(address: string): Promise<void> {
  const { error } = await supabase.functions.invoke('provision-wallet', {
    body: { wallet_address: address },
  });
  if (error) {
    console.warn('Wallet provision call failed (may already be set):', error);
  }
}

/**
 * Ensures the Vocdoni election exists on-chain. If the election is 'pending',
 * creates it using the user's Web3Auth wallet and finalizes the poll record.
 * Returns the real election ID.
 */
export async function ensureVocdoniElection(
  poll: Poll,
  web3authProvider: any
): Promise<string> {
  const electionId = (poll as any).vocdoni_election_id as string;

  if (electionId && electionId !== 'pending') {
    return electionId;
  }

  toast.info('Setting up anonymous election on-chain...', { duration: 8000 });

  const { data: walletData, error: walletError } = await supabase.functions.invoke('get-voter-wallets', {});
  if (walletError) throw new Error('Failed to fetch voter wallets');
  if (walletData?.error) throw new Error(walletData.error);

  const wallets: string[] = walletData?.wallets || [];
  if (wallets.length === 0) throw new Error('No voters with wallets found');

  const sortedOptions = [...(poll.poll_options || [])].sort((a, b) => a.display_order - b.display_order);

  const realElectionId = await createElectionForPoll(
    web3authProvider,
    wallets,
    {
      question: poll.question,
      description: poll.description,
      closes_at: poll.closes_at,
    },
    sortedOptions.map(o => ({ label: o.label }))
  );

  const { data: finalizeData, error: finalizeError } = await supabase.functions.invoke('finalize-election', {
    body: { poll_id: poll.id, election_id: realElectionId },
  });

  if (finalizeError) throw new Error('Failed to finalize election');

  if (finalizeData?.already_finalized) {
    return finalizeData.election_id;
  }

  return realElectionId;
}

/**
 * Handle the full anonymous vote flow using the already-connected Web3Auth wallet.
 * The wallet is silently connected during login via custom JWT.
 */
export async function handleAnonymousVote(
  poll: Poll,
  optionIndex: number
): Promise<string | undefined> {
  const provider = getWeb3AuthProvider();
  const address = await getWalletAddress();
  
  if (!provider || !address) {
    // Web3Auth wallet not available — skip Vocdoni ZK proof,
    // vote will be recorded as non-anonymous in the backend
    console.warn('Web3Auth wallet not connected, falling back to non-anonymous vote');
    return undefined;
  }

  await ensureWalletProvisioned(address);

  const electionId = await ensureVocdoniElection(poll, provider);

  toast.info('Generating ZK proof...', { duration: 5000 });
  const voteId = await castAnonymousVote(provider, electionId, optionIndex);
  return voteId;
}
