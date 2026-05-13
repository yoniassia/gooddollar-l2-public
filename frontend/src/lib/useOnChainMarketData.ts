'use client'

/**
 * useOnChainMarketData — live token market data from on-chain contracts + CoinGecko.
 *
 * Price source priority:
 *  1. On-chain (GoodLendPriceOracle for WETH/USDC; GD/USDC pool spot price for G$)
 *  2. CoinGecko live prices (via usePriceFeeds, refreshes every 60s)
 *  3. FALLBACK_PRICES static constants
 *
 * On-chain supplemental data:
 *  - G$ circulating supply: GoodDollarToken.totalSupply()
 *  - G$ market cap: derived from supply × price
 *
 * On-chain reads refresh every 30s. Falls back gracefully on RPC errors.
 */

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { usePriceFeeds, FALLBACK_PRICES } from './usePriceFeeds'
import { TOKENS, TOKEN_COLORS } from './tokens'
import { CONTRACTS } from './chain'
import { ERC20ABI, GoodPoolABI, GoodLendPriceOracleABI } from './abi'
import type { TokenMarketData } from './marketData'

// ─── Token descriptions (static metadata) ────────────────────────────────────

const TOKEN_DESCRIPTIONS: Record<string, string> = {
  ETH:   'Ethereum — decentralized blockchain enabling smart contracts and dApps.',
  WETH:  'Wrapped Ether — ERC-20 compatible version of ETH for DeFi protocols.',
  WBTC:  'Wrapped Bitcoin — ERC-20 token backed 1:1 by Bitcoin.',
  USDC:  'USD Coin — fully-reserved stablecoin pegged to the US dollar.',
  USDT:  'Tether — largest stablecoin by market cap, pegged to USD.',
  DAI:   'Dai — decentralized overcollateralized stablecoin by MakerDAO.',
  'G$':  'GoodDollar — universal basic income token distributed to verified humans.',
  LINK:  'Chainlink — decentralized oracle network for smart contracts.',
  UNI:   'Uniswap — leading decentralized exchange protocol on Ethereum.',
  AAVE:  'Aave — decentralized lending and borrowing protocol.',
  ARB:   'Arbitrum — Ethereum Layer 2 scaling via optimistic rollups.',
  OP:    'Optimism — Layer 2 powering the OP Stack that GoodDollar L2 is built on.',
  MKR:   'Maker — governance token of MakerDAO behind DAI stablecoin.',
  COMP:  'Compound — DeFi lending protocol with algorithmic interest rates.',
  SNX:   'Synthetix — derivatives protocol for synthetic assets on-chain.',
  CRV:   'Curve — DEX optimized for stablecoin and pegged-asset swaps.',
  LDO:   'Lido — largest liquid staking protocol for ETH.',
  MATIC: 'Polygon — multi-chain scaling framework for Ethereum.',
}

const ALL_SYMBOLS = Object.keys(FALLBACK_PRICES)

// ─── On-chain contract reads ──────────────────────────────────────────────────

const ON_CHAIN_CONTRACTS = [
  // [0] G$ total supply (18 decimals) — GoodDollarToken
  {
    address: CONTRACTS.GoodDollarToken,
    abi: ERC20ABI,
    functionName: 'totalSupply' as const,
  },
  // [1] G$/USDC pool spot price — returns USDC per G$ with 18-decimal precision
  //     formatUnits(result, 18) → G$ price in USD (USDC ≈ $1)
  {
    address: CONTRACTS.SwapPoolGdUsdc,
    abi: GoodPoolABI,
    functionName: 'spotPrice' as const,
  },
  // [2] WETH USD price from GoodLend oracle (8 decimals, Aave-style)
  {
    address: CONTRACTS.GoodLendPriceOracle,
    abi: GoodLendPriceOracleABI,
    functionName: 'getAssetPrice' as const,
    args: [CONTRACTS.MockWETH] as const,
  },
  // [3] USDC USD price from GoodLend oracle (8 decimals, Aave-style)
  {
    address: CONTRACTS.GoodLendPriceOracle,
    abi: GoodLendPriceOracleABI,
    functionName: 'getAssetPrice' as const,
    args: [CONTRACTS.MockUSDC] as const,
  },
] as const

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns live token market data.
 * On-chain contract state is the source of truth; CoinGecko prices are fallback.
 */
export function useOnChainMarketData(): {
  tokens: TokenMarketData[]
  isLive: boolean
  isLoading: boolean
} {
  const { prices: cgPrices, isLive: isCgLive } = usePriceFeeds(ALL_SYMBOLS)

  const { data: onChainData, isLoading: isOnChainLoading } = useReadContracts({
    contracts: ON_CHAIN_CONTRACTS,
    query: { refetchInterval: 30_000 },
  })

  const tokens = useMemo<TokenMarketData[]>(() => {
    // ── Parse on-chain results (undefined on failure — falls back to CoinGecko) ─
    const gdTotalSupplyRaw = onChainData?.[0]?.status === 'success'
      ? (onChainData[0].result as bigint)
      : undefined

    const gdSpotPriceRaw = onChainData?.[1]?.status === 'success'
      ? (onChainData[1].result as bigint)
      : undefined

    const wethOraclePriceRaw = onChainData?.[2]?.status === 'success'
      ? (onChainData[2].result as bigint)
      : undefined

    const usdcOraclePriceRaw = onChainData?.[3]?.status === 'success'
      ? (onChainData[3].result as bigint)
      : undefined

    // ── Derive human-readable values ──────────────────────────────────────────

    // G$ price: spot price from G$/USDC pool (tokenB/tokenA, 18-decimal fixed-point)
    const gdPriceOnChain = gdSpotPriceRaw !== undefined && gdSpotPriceRaw > 0n
      ? parseFloat(formatUnits(gdSpotPriceRaw, 18))
      : null

    // WETH/USDC prices from GoodLend oracle (8 decimals, same as Chainlink)
    const wethPriceOnChain = wethOraclePriceRaw !== undefined && wethOraclePriceRaw > 0n
      ? parseFloat(formatUnits(wethOraclePriceRaw, 8))
      : null

    const usdcPriceOnChain = usdcOraclePriceRaw !== undefined && usdcOraclePriceRaw > 0n
      ? parseFloat(formatUnits(usdcOraclePriceRaw, 8))
      : null

    // G$ circulating supply (18 decimals)
    const gdCirculatingSupply = gdTotalSupplyRaw !== undefined
      ? parseFloat(formatUnits(gdTotalSupplyRaw, 18))
      : undefined

    // ── Merge prices: on-chain wins, CoinGecko is fallback ────────────────────
    const prices: Record<string, number> = { ...cgPrices }

    if (gdPriceOnChain !== null && gdPriceOnChain > 0) {
      prices['G$'] = gdPriceOnChain
    }
    if (wethPriceOnChain !== null && wethPriceOnChain > 0) {
      prices['ETH']  = wethPriceOnChain
      prices['WETH'] = wethPriceOnChain
    }
    if (usdcPriceOnChain !== null && usdcPriceOnChain > 0) {
      prices['USDC'] = usdcPriceOnChain
    }

    // ── Build token market data ───────────────────────────────────────────────
    return TOKENS
      .filter(t => prices[t.symbol] !== undefined || FALLBACK_PRICES[t.symbol] !== undefined)
      .map(t => {
        const price = prices[t.symbol] ?? FALLBACK_PRICES[t.symbol] ?? 0
        if (price === 0) return null

        const circulatingSupply = t.symbol === 'G$' ? gdCirculatingSupply : undefined
        const marketCap = circulatingSupply ? circulatingSupply * price : 0

        return {
          ...t,
          price,
          change1h:  0,
          change24h: 0,
          change7d:  0,
          volume24h: 0,
          marketCap,
          sparkline7d: [price, price, price, price, price, price, price],
          description: TOKEN_DESCRIPTIONS[t.symbol] ?? `${t.name} token`,
          circulatingSupply,
          maxSupply: t.symbol === 'G$' ? null : undefined,
        }
      })
      .filter(Boolean) as TokenMarketData[]
  }, [cgPrices, onChainData])

  const hasOnChainSuccess = onChainData?.some(d => d?.status === 'success') ?? false
  const isLive = isCgLive || hasOnChainSuccess

  return { tokens, isLive, isLoading: isOnChainLoading }
}

export { TOKEN_COLORS }
