import { VocdoniSDKClient, EnvOptions, Election, Vote, PlainCensus } from '@vocdoni/sdk';

const VOCDONI_ENV = EnvOptions.STG; // Use STG for testing, PROD for production

/**
 * Initialize a Vocdoni SDK client with the user's Web3Auth provider.
 * The provider must be EIP-1193 compatible.
 */
export async function initVocdoniClient(provider: any): Promise<VocdoniSDKClient> {
  const { Wallet } = await import('@ethersproject/wallet');
  const { Web3Provider } = await import('@ethersproject/providers');

  // Wrap the Web3Auth provider into an ethers Signer
  const ethersProvider = new Web3Provider(provider);
  const signer = ethersProvider.getSigner();

  const client = new VocdoniSDKClient({
    env: VOCDONI_ENV,
    wallet: signer,
  });

  return client;
}

/**
 * Cast an anonymous vote on a Vocdoni election.
 * Returns the voteId receipt string.
 */
export async function castAnonymousVote(
  provider: any,
  electionId: string,
  optionIndex: number
): Promise<string> {
  const client = await initVocdoniClient(provider);

  // Ensure the account exists on vochain (needed for anonymous voting SIK)
  try {
    await client.createAccount();
  } catch {
    // Account may already exist, that's fine
  }

  client.setElectionId(electionId);
  const vote = new Vote([optionIndex]);
  const voteId = await client.submitVote(vote);
  return voteId;
}

/**
 * Fetch election info and results from Vocdoni.
 */
export async function fetchElectionResults(electionId: string) {
  const client = new VocdoniSDKClient({ env: VOCDONI_ENV });
  const election = await client.fetchElection(electionId);
  return {
    status: election.status,
    voteCount: election.voteCount,
    results: election.results, // Array<Array<string>> — results[questionIdx][optionIdx] = vote count
    finalResults: election.finalResults,
  };
}
