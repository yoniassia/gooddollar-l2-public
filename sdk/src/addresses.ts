/**
 * Deployed contract addresses on GoodDollar L2 devnet (chain ID 42069)
 */
export const ADDRESSES = {
  // Core tokens
  GoodDollarToken: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  MockUSDC: '0x0B306BF915C4d645ff596e518fAf3F9669b97016',
  MockWETH: '0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1',

  // Core infrastructure
  UBIFeeSplitter: '0xC0BF43A4Ca27e0976195E6661b099742f10507e5',
  ValidatorStaking: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  UBIFeeHook: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',

  // Perpetuals
  FundingRate: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
  MarginVault: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
  PriceOracle: '0x0165878A594ca255338adfa4d48449f69242Eb8F',
  PerpEngine: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',

  // Prediction Markets — redeployed 2026-04-05 (GOO-403 fix: wrong constructor args)
  ConditionalTokens: '0x332De1995E0d7e340255833B95AE33F2fe844287',
  MarketFactory: '0xD28F3246f047Efd4059B24FA1fa587eD9fa3e77F',

  // Stocks / Synthetics — redeployed 2026-04-05 (GOO-414)
  StocksPriceOracle: '0x20d7B364E8Ed1F4260b5B90C41c2deC3C1F6D367',
  CollateralVault: '0xCa57C1d3c2c35E667745448Fef8407dd25487ff8',
  SyntheticAssetFactory: '0x2d13826359803522cCe7a4Cfa2c1b582303DD0B4',

  // Lending
  GoodLendPool: '0x322813Fd9A801c5507C9de605D63ceA4f2Ce6C44',

  // UBI Analytics
  UBIRevenueTracker: '0x1D3EDBa836caB11C26A186873abf0fFeB8bbaE63',

  // Yield Vaults
  VaultFactory: '0x0b27a79cb9C0B38eE06Ca3d94DAA68e0Ed17F953',

  // GoodYield Initial Vaults (GOO-242)
  ETHLendingVault: '0xa6AB86f760ae5D6fbF06056a7887b816610A4668',
  GUSDStabilityVault: '0x6BdBEc8Be23eB0F4A1aeF4B4dDf85bdfF0BdbF97',
  GDLendingVault: '0xAD438cEf9a586FcCF01a521bce9465e500a4259E',

  // Agent Registry (GOO-243)
  AgentRegistry: '0xA9d0Fb5837f9c42c874e16da96094b14Af0e2784',
} as const

export type ContractName = keyof typeof ADDRESSES

/** Chain configuration */
export const CHAIN_CONFIG = {
  id: 42069,
  name: 'GoodDollar L2',
  rpcUrl: 'http://localhost:8545',
  explorerUrl: 'https://explorer.goodclaw.org',
} as const
