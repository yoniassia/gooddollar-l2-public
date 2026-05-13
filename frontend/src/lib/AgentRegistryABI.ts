export const AgentRegistryABI = [
  {
    type: 'function',
    name: 'getDashboardStats',
    inputs: [],
    outputs: [
      { name: '_totalAgents', type: 'uint256' },
      { name: '_totalTrades', type: 'uint256' },
      { name: '_totalVolume', type: 'uint256' },
      { name: '_totalUBI', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTopAgents',
    inputs: [{ name: 'count', type: 'uint256' }],
    outputs: [
      { name: 'topAddrs', type: 'address[]' },
      { name: 'topNames', type: 'string[]' },
      { name: 'topUBI', type: 'uint256[]' },
      { name: 'topVolume', type: 'uint256[]' },
      { name: 'topTrades', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentInfo',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [
      {
        name: 'profile',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'avatarURI', type: 'string' },
          { name: 'strategy', type: 'string' },
          { name: 'owner', type: 'address' },
          { name: 'registeredAt', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
      {
        name: 'agentStats',
        type: 'tuple',
        components: [
          { name: 'totalTrades', type: 'uint256' },
          { name: 'totalVolume', type: 'uint256' },
          { name: 'totalFeesGenerated', type: 'uint256' },
          { name: 'ubiContribution', type: 'uint256' },
          { name: 'totalPnL', type: 'uint256' },
          { name: 'pnlPositive', type: 'bool' },
          { name: 'lastActiveAt', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentProtocolStats',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'protocol', type: 'string' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'trades', type: 'uint256' },
          { name: 'volume', type: 'uint256' },
          { name: 'fees', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgentCount',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getAgent',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const
