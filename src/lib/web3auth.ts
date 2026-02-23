import { Web3Auth } from '@web3auth/modal';
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from '@web3auth/modal';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import { createWalletClient, custom } from 'viem';
import { mainnet } from 'viem/chains';

const WEB3AUTH_CLIENT_ID = 'BKqVmzi9FtXmTw3SRZwnpj4k0d9FFfl_54OPYhOGkEkJYs6FGblWZdvOHRSy5Yc1vc25EkkNEGMTyH_qTguUfEI';

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: '0x1',
  rpcTarget: 'https://rpc.ankr.com/eth',
  displayName: 'Ethereum Mainnet',
  blockExplorerUrl: 'https://etherscan.io',
  ticker: 'ETH',
  tickerName: 'Ethereum',
};

let web3authInstance: Web3Auth | null = null;

export async function getWeb3Auth(): Promise<Web3Auth> {
  if (web3authInstance) return web3authInstance;

  const privateKeyProvider = new EthereumPrivateKeyProvider({
    config: { chainConfig },
  });

  const web3auth = new Web3Auth({
    clientId: WEB3AUTH_CLIENT_ID,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    privateKeyProvider: privateKeyProvider as any,
  });

  await web3auth.init();
  web3authInstance = web3auth;
  return web3auth;
}

/**
 * Provision a wallet by connecting through Web3Auth modal.
 * Returns the Ethereum address or null if user cancels.
 */
export async function provisionWallet(): Promise<string | null> {
  try {
    const web3auth = await getWeb3Auth();
    const provider = await web3auth.connect();

    if (!provider) return null;

    const walletClient = createWalletClient({
      chain: mainnet,
      transport: custom(provider),
    });

    const [address] = await walletClient.getAddresses();

    // Disconnect after getting the address — wallet is provisioned
    await web3auth.logout();

    return address || null;
  } catch (err) {
    console.error('Web3Auth wallet provisioning failed:', err);
    return null;
  }
}

/**
 * Get the wallet address from an active Web3Auth session.
 */
export async function getWalletAddress(): Promise<string | null> {
  try {
    const web3auth = await getWeb3Auth();
    if (!web3auth.connected || !web3auth.provider) return null;

    const walletClient = createWalletClient({
      chain: mainnet,
      transport: custom(web3auth.provider),
    });

    const [address] = await walletClient.getAddresses();
    return address || null;
  } catch {
    return null;
  }
}
