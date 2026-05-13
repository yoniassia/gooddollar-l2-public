/**
 * Contract ABIs for all GoodDollar L2 protocols
 * Extracted from frontend/src/lib/abi.ts — canonical source
 */

export const ERC20ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'transfer', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalSupply', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

export const PerpEngineABI = [
  { inputs: [{ name: 'marketId', type: 'uint256' }, { name: 'size', type: 'uint256' }, { name: 'isLong', type: 'bool' }, { name: 'minPrice', type: 'uint256' }], name: 'openPosition', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'marketId', type: 'uint256' }], name: 'closePosition', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'marketId', type: 'uint256' }], name: 'markets', outputs: [{ name: 'key', type: 'bytes32' }, { name: 'maxLeverage', type: 'uint256' }, { name: 'isActive', type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'marketCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'marketId', type: 'uint256' }], name: 'positions', outputs: [{ name: 'size', type: 'uint256' }, { name: 'entryPrice', type: 'uint256' }, { name: 'isLong', type: 'bool' }, { name: 'collateral', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'marketId', type: 'uint256' }], name: 'unrealizedPnL', outputs: [{ name: '', type: 'int256' }], stateMutability: 'view', type: 'function' },
] as const

export const MarketFactoryABI = [
  { inputs: [{ name: 'question', type: 'string' }, { name: 'endTime', type: 'uint256' }, { name: 'resolver', type: 'address' }], name: 'createMarket', outputs: [{ name: 'marketId', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'marketId', type: 'uint256' }, { name: 'isYES', type: 'bool' }, { name: 'amount', type: 'uint256' }], name: 'buy', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'marketId', type: 'uint256' }, { name: 'amount', type: 'uint256' }], name: 'redeem', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'marketId', type: 'uint256' }], name: 'getMarket', outputs: [{ name: 'question', type: 'string' }, { name: 'endTime', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'totalYES', type: 'uint256' }, { name: 'totalNO', type: 'uint256' }, { name: 'collateral', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'marketCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'marketId', type: 'uint256' }], name: 'impliedProbabilityYES', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

export const GoodLendPoolABI = [
  { inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'supply', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'withdraw', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'borrow', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'repay', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }], name: 'getUserAccountData', outputs: [{ name: 'healthFactor', type: 'uint256' }, { name: 'totalCollateralUSD', type: 'uint256' }, { name: 'totalDebtUSD', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'asset', type: 'address' }], name: 'getReserveData', outputs: [{ name: 'totalDeposits', type: 'uint256' }, { name: 'totalBorrows', type: 'uint256' }, { name: 'liquidityIndex', type: 'uint256' }, { name: 'borrowIndex', type: 'uint256' }, { name: 'supplyRate', type: 'uint256' }, { name: 'borrowRate', type: 'uint256' }, { name: 'accruedToTreasury', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

export const CollateralVaultABI = [
  { inputs: [{ name: 'ticker', type: 'string' }, { name: 'collateralAmount', type: 'uint256' }, { name: 'syntheticAmount', type: 'uint256' }], name: 'depositAndMint', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'ticker', type: 'string' }, { name: 'amount', type: 'uint256' }], name: 'burn', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'ticker', type: 'string' }, { name: 'amount', type: 'uint256' }], name: 'withdrawCollateral', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'ticker', type: 'string' }], name: 'getPosition', outputs: [{ name: 'userCollateral', type: 'uint256' }, { name: 'userDebt', type: 'uint256' }, { name: 'ratio', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'ticker', type: 'string' }], name: 'getCollateralRatio', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

export const SyntheticAssetFactoryABI = [
  { inputs: [{ name: 'ticker', type: 'string' }], name: 'getAsset', outputs: [{ name: 'tokenAddress', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'allTickers', outputs: [{ name: '', type: 'string[]' }], stateMutability: 'view', type: 'function' },
] as const

export const MarginVaultABI = [
  { inputs: [{ name: 'amount', type: 'uint256' }], name: 'deposit', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'amount', type: 'uint256' }], name: 'withdraw', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }], name: 'balances', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

export const UBIRevenueTrackerABI = [
  { inputs: [], name: 'getDashboardData', outputs: [
    { name: '_totalFees', type: 'uint256' }, { name: '_totalUBI', type: 'uint256' },
    { name: '_totalTx', type: 'uint256' }, { name: '_protocolCount', type: 'uint256' },
    { name: '_activeProtocols', type: 'uint256' }, { name: '_splitterFees', type: 'uint256' },
    { name: '_splitterUBI', type: 'uint256' }, { name: '_snapshotCount', type: 'uint256' },
  ], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getAllProtocols', outputs: [{ name: 'result', type: 'tuple[]', components: [
    { name: 'name', type: 'string' }, { name: 'category', type: 'string' },
    { name: 'feeSource', type: 'address' }, { name: 'totalFees', type: 'uint256' },
    { name: 'ubiContribution', type: 'uint256' }, { name: 'txCount', type: 'uint256' },
    { name: 'lastUpdateBlock', type: 'uint256' }, { name: 'active', type: 'bool' },
  ] }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'count', type: 'uint256' }], name: 'getSnapshots', outputs: [{ name: 'result', type: 'tuple[]', components: [
    { name: 'timestamp', type: 'uint256' }, { name: 'totalUBI', type: 'uint256' },
    { name: 'totalFees', type: 'uint256' }, { name: 'protocolCount', type: 'uint256' },
  ] }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'getProtocol', outputs: [{ name: '', type: 'tuple', components: [
    { name: 'name', type: 'string' }, { name: 'category', type: 'string' },
    { name: 'feeSource', type: 'address' }, { name: 'totalFees', type: 'uint256' },
    { name: 'ubiContribution', type: 'uint256' }, { name: 'txCount', type: 'uint256' },
    { name: 'lastUpdateBlock', type: 'uint256' }, { name: 'active', type: 'bool' },
  ] }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalUBITracked', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalFeesTracked', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalTxTracked', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'protocolCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

export const UBIFeeHookABI = [
  { inputs: [{ name: 'amount', type: 'uint256' }], name: 'calculateUBIFee', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalSwapsProcessed', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'token', type: 'address' }], name: 'totalUBIFees', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

export const VaultFactoryABI = [
  { type: 'function', name: 'allVaults', inputs: [{ name: '', type: 'uint256' }], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'vaultCount', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalTVL', inputs: [], outputs: [{ name: 'tvl', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalUBIFunded', inputs: [], outputs: [{ name: 'total', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'isVault', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'getVaultsByAsset', inputs: [{ name: '_asset', type: 'address' }], outputs: [{ name: '', type: 'address[]' }], stateMutability: 'view' },
] as const

export const GoodVaultABI = [
  { type: 'function', name: 'name', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'asset', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'totalAssets', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'convertToShares', inputs: [{ name: 'assets', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'convertToAssets', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'deposit', inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }], outputs: [{ name: 'shares', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdraw', inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }], outputs: [{ name: 'shares', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'redeem', inputs: [{ name: 'shares', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }], outputs: [{ name: 'assets', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'harvest', inputs: [], outputs: [{ name: 'profit', type: 'uint256' }, { name: 'loss', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'depositCap', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalDebt', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalGainSinceInception', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalUBIFunded', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'paused', inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'strategy', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'performanceFeeBPS', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'managementFeeBPS', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
] as const


// ─── Agent Registry ABI ──────────────────────────────────────────────────────

export const AgentRegistryABI = [
  { type: 'function', name: 'getDashboardStats', inputs: [], outputs: [{ name: '_totalAgents', type: 'uint256' }, { name: '_totalTrades', type: 'uint256' }, { name: '_totalVolume', type: 'uint256' }, { name: '_totalUBI', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getTopAgents', inputs: [{ name: 'count', type: 'uint256' }], outputs: [{ name: 'topAddrs', type: 'address[]' }, { name: 'topNames', type: 'string[]' }, { name: 'topUBI', type: 'uint256[]' }, { name: 'topVolume', type: 'uint256[]' }, { name: 'topTrades', type: 'uint256[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getAgentInfo', inputs: [{ name: 'agent', type: 'address' }], outputs: [{ name: 'profile', type: 'tuple', components: [{ name: 'name', type: 'string' }, { name: 'avatarURI', type: 'string' }, { name: 'strategy', type: 'string' }, { name: 'owner', type: 'address' }, { name: 'registeredAt', type: 'uint256' }, { name: 'active', type: 'bool' }] }, { name: 'agentStats', type: 'tuple', components: [{ name: 'totalTrades', type: 'uint256' }, { name: 'totalVolume', type: 'uint256' }, { name: 'totalFeesGenerated', type: 'uint256' }, { name: 'ubiContribution', type: 'uint256' }, { name: 'totalPnL', type: 'uint256' }, { name: 'pnlPositive', type: 'bool' }, { name: 'lastActiveAt', type: 'uint256' }] }], stateMutability: 'view' },
  { type: 'function', name: 'getAgentProtocolStats', inputs: [{ name: 'agent', type: 'address' }, { name: 'protocol', type: 'string' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'trades', type: 'uint256' }, { name: 'volume', type: 'uint256' }, { name: 'fees', type: 'uint256' }] }], stateMutability: 'view' },
  { type: 'function', name: 'getAgentCount', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'registerAgent', inputs: [{ name: 'agent', type: 'address' }, { name: 'name', type: 'string' }, { name: 'avatarURI', type: 'string' }, { name: 'strategy', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'recordActivity', inputs: [{ name: 'agent', type: 'address' }, { name: 'protocol', type: 'string' }, { name: 'volume', type: 'uint256' }, { name: 'fees', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
] as const
