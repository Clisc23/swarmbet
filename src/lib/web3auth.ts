import { WALLET_CONNECTORS, WEB3AUTH_NETWORK } from '@web3auth/modal';
import type { Web3AuthContextConfig } from '@web3auth/modal/react';

// Web3Auth Client ID from the Embedded Wallets dashboard (publishable key)
// Using Sapphire Devnet for development
const WEB3AUTH_CLIENT_ID = 'BKqVmzi9FtXmTw3SRZwnpj4k0d9FFfl_54OPYhOGkEkJYs6FGblWZdvOHRSy5Yc1vc25EkkNEGMTyH_qTguUfEI';
export const WEB3AUTH_AUTH_CONNECTION_ID = 'swarmbet-worldid-v2';

export const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    clientId: WEB3AUTH_CLIENT_ID,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    modalConfig: {
      connectors: {
        [WALLET_CONNECTORS.AUTH]: {
          label: 'auth',
          // Hide all default login methods — we only use custom JWT
          showOnModal: false,
        },
      },
    },
  },
};
