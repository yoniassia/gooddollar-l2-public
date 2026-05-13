/**
 * @gooddollar/agent-sdk
 *
 * TypeScript SDK for AI agents to interact with all GoodDollar L2 protocols.
 * Every transaction funds UBI for humans worldwide.
 *
 * Quick start:
 *   import { GoodDollarSDK } from '@gooddollar/agent-sdk'
 *
 *   const sdk = new GoodDollarSDK({ privateKey: '0x...' })
 *
 *   // Trade perps
 *   await sdk.perps.openLong(0n, parseEther('1'))
 *
 *   // Predict markets
 *   await sdk.predict.buy(0n, true, parseEther('100'))
 *
 *   // Lend/borrow
 *   await sdk.lend.supply(ADDRESSES.MockUSDC, parseEther('1000'))
 *
 *   // Mint synthetic stocks
 *   await sdk.stocks.mint('AAPL', parseEther('500'), parseEther('1'))
 *
 *   // Check UBI impact
 *   const fees = await sdk.ubi.getTotalFees(ADDRESSES.GoodDollarToken)
 */
export { GoodDollarSDK, gooddollarL2, type GoodDollarSDKConfig } from './client'
export { ADDRESSES, CHAIN_CONFIG, type ContractName } from './addresses'
export {
  ERC20ABI,
  PerpEngineABI,
  MarketFactoryABI,
  GoodLendPoolABI,
  CollateralVaultABI,
  SyntheticAssetFactoryABI,
  MarginVaultABI,
  UBIFeeHookABI,
  UBIRevenueTrackerABI,
  VaultFactoryABI,
  GoodVaultABI,
} from './abis'
export {
  AgentSwarm,
  ManagedAgent,
  SignalBus,
  PortfolioAggregator,
  Strategies,
  type AgentRole,
  type AgentConfig,
  type Signal,
  type SignalHandler,
  type AgentState,
  type SwarmSnapshot,
  type ProtocolExposure,
} from './orchestration'
