import { VocdoniSDKClient, EnvOptions, Election, Vote, PlainCensus } from '@vocdoni/sdk';

const VOCDONI_ENV = EnvOptions.STG;

/**
 * Initialize a Vocdoni SDK client with the user's Web3Auth provider.
 */
export async function initVocdoniClient(provider: any): Promise<VocdoniSDKClient> {
  const { Web3Provider } = await import('@ethersproject/providers');
  const ethersProvider = new Web3Provider(provider);
  const signer = ethersProvider.getSigner();

  const client = new VocdoniSDKClient({
    env: VOCDONI_ENV,
    wallet: signer,
  });

  return client;
}

/**
 * Create a Vocdoni election on-chain using the voter's Web3Auth wallet.
 * Used when a poll has vocdoni_election_id = 'pending'.
 * Returns the real election ID.
 */
export async function createElectionForPoll(
  provider: any,
  walletAddresses: string[],
  poll: { question: string; description?: string | null; closes_at: string },
  options: { label: string }[]
): Promise<string> {
  const client = await initVocdoniClient(provider);

  try {
    await client.createAccount();
  } catch {
    // Account may already exist
  }

  const census = new PlainCensus();
  for (const addr of walletAddresses) {
    census.add(addr);
  }

  const election = Election.from({
    title: poll.question,
    description: poll.description || '',
    endDate: new Date(poll.closes_at),
    census,
  });

  election.addQuestion(
    poll.question,
    '',
    options.map((o, i) => ({ title: o.label, value: i }))
  );

  const electionId = await client.createElection(election);
  return electionId;
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

  try {
    await client.createAccount();
  } catch {
    // Account may already exist
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
    results: election.results,
    finalResults: election.finalResults,
  };
}
