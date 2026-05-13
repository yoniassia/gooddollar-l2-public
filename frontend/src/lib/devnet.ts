/**
 * Devnet configuration — single source of truth for contract addresses, RPC
 * URL, chain ID, and ABIs.
 *
 * Base addresses are sourced from op-stack/addresses.json (initial deployment).
 * Extended contracts (GoodLend, GoodSwap, GoodStocks redeployment, GoodStable,
 * GoodPerps) are declared here with their live devnet addresses.
 *
 * All frontend data modules should import addresses and ABIs from this module
 * instead of hardcoding values or importing from chain.ts directly.
 */

import rawAddresses from '../../../op-stack/addresses.json'

// ─── Network constants ────────────────────────────────────────────────────────

export const DEVNET_CHAIN_ID: number = rawAddresses.chain_id
export const DEVNET_RPC_URL: string = rawAddresses.rpc_url
export const DEVNET_EXPLORER_URL: string = rawAddresses.explorer_url

// ─── Contract addresses ───────────────────────────────────────────────────────

/**
 * All live devnet contract addresses.
 *
 * Base contracts come from op-stack/addresses.json.
 * Extended contracts (GoodLend, GoodSwap, GoodPerps, GoodStocks, GoodStable)
 * were deployed on 2026-04-03 and are listed here directly.
 *
 * GoodStocks contracts (CollateralVault, SyntheticAssetFactory,
 * StocksPriceOracle) were redeployed on 2026-04-05 (GOO-414) with 12 synthetic
 * equities — those addresses below take precedence over the original addresses.json values.
 */
export const CONTRACTS = {
  // ── Core (from op-stack/addresses.json) ──────────────────────────────────
  GoodDollarToken:       rawAddresses.contracts.GoodDollarToken as `0x${string}`,
  UBIClaimV2:            rawAddresses.contracts.UBIClaimV2 as `0x${string}`,
  UBIFeeSplitter:        rawAddresses.contracts.UBIFeeSplitter as `0x${string}`,
  LiFiBridgeAggregator:  rawAddresses.contracts.LiFiBridgeAggregator as `0x${string}`,
  ValidatorStaking:      rawAddresses.contracts.ValidatorStaking as `0x${string}`,
  UBIFeeHook:            rawAddresses.contracts.UBIFeeHook as `0x${string}`,
  MarketFactory:         rawAddresses.contracts.MarketFactory as `0x${string}`,
  ConditionalTokens:     rawAddresses.contracts.ConditionalTokens as `0x${string}`,
  OptimisticResolver:    '0x30426D33a78afdb8788597D5BFaBdADc3Be95698' as `0x${string}`,

  // ── GoodLend — devnet (chain 42069), redeployed 2026-04-05 (GOO-388) ──────
  GoodLendPool:                '0x49fd2be640db2910c2fab69bb8531ab6e76127ff' as `0x${string}`,
  GoodLendPriceOracle:         '0x46b142dd1e924fab83ecc3c08e4d46e82f005e0e' as `0x${string}`,
  GoodLendInterestRateModel:   '0x367761085bf3c12e5da2df99ac6e1a824612b8fb' as `0x${string}`,
  // GoodLend reserve tokens
  MockUSDC:              '0x2b0d36facd61b71cc05ab8f3d2355ec3631c0dd5' as `0x${string}`,
  MockWETH:              '0xfbc22278a96299d91d41c453234d97b4f5eb9b2d' as `0x${string}`,
  // gTokens (interest-bearing)
  gUSDC:                 '0x4631bcabd6df18d94796344963cb60d44a4136b6' as `0x${string}`,
  gWETH:                 '0xa4899d35897033b927acfcf422bc745916139776' as `0x${string}`,
  // Debt tokens
  debtUSDC:              '0x86a2ee8faf9a840f7a2c64ca3d51209f9a02081d' as `0x${string}`,
  debtWETH:              '0xf953b3a269d80e3eb0f2947630da976b896a8c5b' as `0x${string}`,

  // ── GoodSwap — redeployed to devnet (chain 42069), 2026-04-05 (GOO-395) ──
  PoolManager:           '0xC9a43158891282A2B1475592D5719c001986Aaec' as `0x${string}`,
  GoodSwapRouter:        '0x975Ab64F4901Af5f0C96636deA0b9de3419D0c2F' as `0x${string}`,
  // GoodSwap Liquidity Pools
  SwapPoolGdWeth:        '0xeAd789bd8Ce8b9E94F5D0FCa99F8787c7e758817' as `0x${string}`,
  SwapPoolGdUsdc:        '0x95775fD3Afb1F4072794CA4ddA27F2444BCf8Ac3' as `0x${string}`,
  SwapPoolWethUsdc:      '0xd9fEc8238711935D6c8d79Bef2B9546ef23FC046' as `0x${string}`,
  // GoodSwap pool tokens (devnet mocks)
  SwapGD:                '0x547382C0D1b23f707918D3c83A77317B71Aa8470' as `0x${string}`,
  SwapWETH:              '0x7C8BaafA542c57fF9B2B90612bf8aB9E86e22C09' as `0x${string}`,
  SwapUSDC:              '0x0a17FabeA4633ce714F1Fa4a2dcA62C3bAc4758d' as `0x${string}`,

  // ── GoodPerps — redeployed to devnet (chain 42069), 2026-04-05 (GOO-450 fix) ──
  PerpEngine:            '0x021DBfF4A864Aa25c51F0ad2Cd73266Fde66199d' as `0x${string}`,
  MarginVault:           '0xb22c255250d74b0add1bfb936676d2a299bf48bd' as `0x${string}`,
  FundingRate:           '0xfd2cf3b56a73c75a7535ffe44ebabe7723c64719' as `0x${string}`,
  PerpPriceOracle:       '0xf5c4a909455c00b99a90d93b48736f3196db5621' as `0x${string}`,

  // ── GoodStocks — vault re-fixed 2026-04-05 (GOO-473): CollateralVault redeployed with
  //    correct GDT (0x36C02dA8…); sTokens redeployed via delist+relist pattern.
  //    PriceOracle (0x20d7B364…) and SyntheticAssetFactory (0x2d13826…) reused.
  StocksPriceOracle:     '0x20d7B364E8Ed1F4260b5B90C41c2deC3C1F6D367' as `0x${string}`,
  CollateralVault:       '0xbFD3c8A956AFB7a9754C951D03C9aDdA7EC5d638' as `0x${string}`,
  SyntheticAssetFactory: '0x2d13826359803522cCe7a4Cfa2c1b582303DD0B4' as `0x${string}`,
  // Synthetic stock tokens (sToken ERC-20s)
  sAAPL:                 '0xfD195EeC3ADB4D9484065dcde04D9F657a5F8c45' as `0x${string}`,
  sTSLA:                 '0xAB8C68E77d2584437b8F2ceD454D33e6B7d1eF48' as `0x${string}`,
  sNVDA:                 '0x60f83010b4a0509ea8c7a7993471e9a4B3C82dBc' as `0x${string}`,
  sMSFT:                 '0xC15476cFC8559FD9528141aBea459A709d86b586' as `0x${string}`,
  sAMZN:                 '0xB701cDEA95F11bad434eb5F4fAd1320ED3544394' as `0x${string}`,
  sGOOGL:                '0xfC97F96F115d4411821BD64Be4C6Ad670F7c0818' as `0x${string}`,
  sMETA:                 '0xa9859e16D4DE5e71649F5D28cd47Dddce2af40CB' as `0x${string}`,
  sJPM:                  '0x9511722bF565DF7420AB739B8e49894c5471Fb28' as `0x${string}`,
  sV:                    '0x6efeD18c2878F48179F9B52b251c7d4C834BBC0A' as `0x${string}`,
  sDIS:                  '0x3FDc5a01c707Ef3B708Dcdab36014aF3e229E473' as `0x${string}`,
  sNFLX:                 '0x3B156D26a707de6E792Af47D5890E11D124F8D6C' as `0x${string}`,
  sAMD:                  '0x85eD4d86A147a281569Dac55DA64D74d9fF53409' as `0x${string}`,

  // ── Governance — redeployed 2026-04-05 (GOO-475): fixed ubiFeeSplitter 0x3abBB0D6 ──
  VoteEscrowedGD:        rawAddresses.contracts.VoteEscrowedGD as `0x${string}`,
  GoodDAO:               rawAddresses.contracts.GoodDAO as `0x${string}`,
  GoodTimelock:          '0xF66CfDf074D2FFD6A4037be3A669Ed04380Aef2B' as `0x${string}`,

  // ── GoodStable — CDP vault system (chain 42069), redeployed 2026-04-05 (GOO-485) ─
  //    Previous run (run-1775321025499) addresses were stale (0 bytes on chain).
  //    Updated to run-latest (run-1775384905265) which is the live deployment.
  gUSD:                  '0x5D42EbDbba61412295d7b0302D6F50ac449Ddb4f' as `0x${string}`,
  VaultManager:          '0xAb7b4C595D3CE8c85E16Da86630F2FC223b05057' as `0x${string}`,
  CollateralRegistry:    '0xB06C856C8eabD1D8321B687e188204C1018bC4E5' as `0x${string}`,
  StabilityPool:         '0xAd523115Cd35a8d4E60B3c0953e0e0ac10418309' as `0x${string}`,
  PegStabilityModule:    '0x821f3361D454Cc98b7555221A06bE563a7e2e0A6' as `0x${string}`,
  StablePriceOracle:     '0xACA81583840B1bF2dDF6cdE824ADa250C1936b4D' as `0x${string}`,
  StableFeeSplitter:     '0xDdE78e6202518ff4936b5302Cc2891Ec180e8bFF' as `0x${string}`,
  // GoodStable collateral tokens (separate from GoodLend mocks)
  StableMockWETH:        '0x8bCE54fF8aB45CB075b044AE117b8fD91F9351AB' as `0x${string}`,
  StableMockUSDC:        '0x74Cf9087aD26D541930bAc724B7ab21BA8F00A27' as `0x${string}`,
  StableMockGD:          '0xeFab0bEB0a557e452b398035Ea964948C750B2FD' as `0x${string}`,

  // ── UBI Analytics — deployed (chain 42069), 2026-04-03 (GOO-226) ──────────
  UBIRevenueTracker:     '0x021DBfF4A864Aa25c51F0ad2Cd73266Fde66199d' as `0x${string}`,

  // ── GoodYield — VaultFactory (chain 42069), deployed 2026-04-04 (GOO-240) ──
  VaultFactory:          '0x77AD263Cd578045105FBFC88A477CAd808d39Cf6' as `0x${string}`,

  // ── GoodYield Initial Vaults — deployed 2026-04-04 (GOO-242) ──
  ETHLendingVault:       '0xa6AB86f760ae5D6fbF06056a7887b816610A4668' as `0x${string}`,
  GUSDStabilityVault:    '0x6BdBEc8Be23eB0F4A1aeF4B4dDf85bdfF0BdbF97' as `0x${string}`,
  GDLendingVault:        '0xAD438cEf9a586FcCF01a521bce9465e500a4259E' as `0x${string}`,

  // ── Agent Registry — deployed (chain 42069), 2026-04-04 (GOO-243) ────────
  AgentRegistry:         '0xA9d0Fb5837f9c42c874e16da96094b14Af0e2784' as `0x${string}`,

  // ── QA TestRegistry — deployed (chain 42069), 2026-04-03 ─────────────────
  TestRegistry:          '0x12bcb546bc60ff39f1adfc7ce4605d5bd6a6a876' as `0x${string}`,
} as const

/**
 * @deprecated Use CONTRACTS instead. Kept for backward compatibility.
 */
export const DEVNET_CONTRACTS = CONTRACTS

// ─── ABIs ─────────────────────────────────────────────────────────────────────
// Re-exported from abi.ts so all consumers can import both addresses and ABIs
// from a single module.

export {
  GoodDollarTokenABI,
  MarketFactoryABI,
  ConditionalTokensABI,
  UBIFeeHookABI,
  GoodLendPoolABI,
  PerpEngineABI,
  CollateralVaultABI,
  SyntheticAssetFactoryABI,
  MarginVaultABI,
  FundingRateABI,
  ERC20ABI,
  GoodLendPriceOracleABI,
  PriceOracleABI,
  VaultManagerABI,
  CollateralRegistryABI,
  GoodPoolABI,
  GoodSwapRouterABI,
  VoteEscrowedGDABI,
  GoodDAOABI,
  TestRegistryABI,
  UBIRevenueTrackerABI,
  VaultFactoryABI,
  GoodVaultABI,
} from './abi'
