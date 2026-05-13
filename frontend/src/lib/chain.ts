import { defineChain } from 'viem'
import { DEVNET_CHAIN_ID, DEVNET_RPC_URL, DEVNET_EXPLORER_URL, CONTRACTS } from './devnet'

export const gooddollarL2 = defineChain({
  id: DEVNET_CHAIN_ID,
  name: 'GoodDollar L2',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [DEVNET_RPC_URL],
    },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: DEVNET_EXPLORER_URL },
  },
  testnet: true,
})

// Re-export CONTRACTS from devnet.ts so existing imports of `{ CONTRACTS } from './chain'` continue to work.
export { CONTRACTS }
