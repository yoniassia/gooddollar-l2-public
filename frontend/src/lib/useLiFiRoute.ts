'use client'

/**
 * useLiFiRoute — Li.Fi cross-chain swap route hook
 *
 * Fetches the best available route from Li.Fi's aggregation API,
 * which searches DEXes, bridges, and aggregators across 25+ chains.
 *
 * Li.Fi REST API: https://li.quest/v1/
 * No SDK installation required — uses native fetch.
 *
 * Supported chains (Li.Fi chain IDs):
 *   Ethereum: 1, Arbitrum: 42161, Optimism: 10, Polygon: 137,
 *   Base: 8453, BSC: 56, Avalanche: 43114
 *
 * GoodDollar L2 (42069) is not yet indexed by Li.Fi.
 * Cross-chain flows supported: ETH/ARB/OP → G$ via bridge + swap.
 */

import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiFiGasCost {
  type: string
  price: string
  estimate: string
  limit: string
  amount: string
  amountUSD: string
  token: { symbol: string; decimals: number; address: string }
}

export interface LiFiStep {
  type: 'swap' | 'cross' | 'lifi'
  tool: string          // e.g. "uniswap", "stargate", "hop"
  toolDetails: { name: string; logoURI: string }
  action: {
    fromToken: { symbol: string; address: string; decimals: number; chainId: number }
    toToken: { symbol: string; address: string; decimals: number; chainId: number }
    fromAmount: string
    slippage: number
    fromChainId: number
    toChainId: number
  }
  estimate: {
    fromAmount: string
    toAmount: string
    toAmountMin: string
    executionDuration: number  // seconds
    gasCosts: LiFiGasCost[]
  }
}

export interface LiFiRoute {
  id: string
  fromChainId: number
  toChainId: number
  fromToken: { symbol: string; address: string; decimals: number }
  toToken: { symbol: string; address: string; decimals: number }
  fromAmount: string
  toAmount: string
  toAmountMin: string
  gasCostUSD: string
  priceImpact: number      // 0-1 (e.g. 0.003 = 0.3%)
  steps: LiFiStep[]
  tags: string[]           // e.g. ['RECOMMENDED', 'CHEAPEST', 'FASTEST']
  transactionRequest?: {
    to: string
    data: string
    value: string
    gasLimit: string
    gasPrice: string
    from: string
    chainId: number
  }
}

export interface LiFiQuoteRequest {
  fromChain: number          // Chain ID (e.g. 1 for Ethereum)
  toChain: number
  fromToken: string          // Token symbol or address
  toToken: string
  fromAmount: string         // Amount in wei (base units)
  fromAddress: string        // Sender address
  slippage?: number          // 0.005 = 0.5% (default)
  integrator?: string
}

export interface UseLiFiRouteResult {
  route: LiFiRoute | null
  loading: boolean
  error: string | null
  /** Formatted output amount with decimals applied */
  toAmountFormatted: string | null
  /** Total gas cost in USD */
  gasCostUSD: string | null
  /** Price impact as percentage string e.g. "0.30%" */
  priceImpactPct: string | null
  /** Estimated execution time in seconds */
  executionTimeSec: number | null
  /** Protocol/bridge used (e.g. "Uniswap + Stargate") */
  routeSummary: string | null
  /** Refetch the route */
  refresh: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LIFI_API = 'https://li.quest/v1'
const DEBOUNCE_MS = 600
const STALE_AFTER_MS = 30_000

// Common token addresses on major chains (for API calls)
export const LIFI_TOKEN_ADDRESSES: Record<string, Record<number, string>> = {
  ETH:  { 1: '0x0000000000000000000000000000000000000000', 42161: '0x0000000000000000000000000000000000000000', 10: '0x0000000000000000000000000000000000000000' },
  USDC: { 1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
  USDT: { 1: '0xdAC17F958D2ee523a2206206994597C13D831ec7', 42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 10: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' },
  DAI:  { 1: '0x6B175474E89094C44Da98b954EedeAC495271d0F', 42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', 10: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1' },
  WBTC: { 1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', 42161: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', 10: '0x68f180fcCe6836688e9084f035309E29Bf0A2095' },
  WETH: { 1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 10: '0x4200000000000000000000000000000000000006' },
  LINK: { 1: '0x514910771AF9Ca656af840dff83E8264EcF986CA', 42161: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4' },
  ARB:  { 42161: '0x912CE59144191C1204E64559FE8253a0e49E6548' },
  OP:   { 10: '0x4200000000000000000000000000000000000042' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveTokenAddress(symbol: string, chainId: number): string {
  return LIFI_TOKEN_ADDRESSES[symbol]?.[chainId] ?? symbol
}

function formatTokenAmount(amount: string, decimals: number): string {
  const n = parseFloat(amount) / Math.pow(10, decimals)
  if (n === 0) return '0'
  if (n < 0.0001) return n.toExponential(2)
  if (n < 1) return n.toFixed(4)
  if (n < 1000) return n.toFixed(2)
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function buildRouteSummary(steps: LiFiStep[]): string {
  return steps.map(s => s.toolDetails?.name || s.tool).join(' → ')
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchLiFiQuote(req: LiFiQuoteRequest): Promise<LiFiRoute> {
  const tokenIn = resolveTokenAddress(req.fromToken, req.fromChain)
  const tokenOut = resolveTokenAddress(req.toToken, req.toChain)

  const params = new URLSearchParams({
    fromChain: String(req.fromChain),
    toChain: String(req.toChain),
    fromToken: tokenIn,
    toToken: tokenOut,
    fromAmount: req.fromAmount,
    fromAddress: req.fromAddress,
    slippage: String(req.slippage ?? 0.005),
    integrator: req.integrator ?? 'gooddollar-l2',
  })

  const res = await fetch(`${LIFI_API}/quote?${params}`, {
    headers: { 'Accept': 'application/json' },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err?.message ?? `Li.Fi API error ${res.status}`)
  }

  const data = await res.json() as any

  // Normalize Li.Fi quote response → LiFiRoute
  const estimate = data.estimate ?? {}
  const action = data.action ?? {}
  const gasCosts: LiFiGasCost[] = estimate.gasCosts ?? []
  const totalGasUSD = gasCosts.reduce(
    (sum: number, g: LiFiGasCost) => sum + parseFloat(g.amountUSD || '0'), 0
  ).toFixed(4)

  const route: LiFiRoute = {
    id: data.id ?? crypto.randomUUID(),
    fromChainId: action.fromChainId ?? req.fromChain,
    toChainId: action.toChainId ?? req.toChain,
    fromToken: action.fromToken ?? { symbol: req.fromToken, address: tokenIn, decimals: 18 },
    toToken: action.toToken ?? { symbol: req.toToken, address: tokenOut, decimals: 18 },
    fromAmount: action.fromAmount ?? req.fromAmount,
    toAmount: estimate.toAmount ?? '0',
    toAmountMin: estimate.toAmountMin ?? '0',
    gasCostUSD: totalGasUSD,
    priceImpact: parseFloat(estimate.priceImpact ?? '0'),
    steps: data.includedSteps ?? [data],
    tags: data.tags ?? [],
    transactionRequest: data.transactionRequest,
  }

  return route
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useLiFiRoute
 *
 * @param params - Quote request params (or null to disable)
 *
 * Usage:
 * ```tsx
 * const { route, loading, toAmountFormatted, gasCostUSD } = useLiFiRoute({
 *   fromChain: 1,
 *   toChain: 42161,
 *   fromToken: 'ETH',
 *   toToken: 'USDC',
 *   fromAmount: '1000000000000000000', // 1 ETH in wei
 *   fromAddress: '0x...',
 * })
 * ```
 */
export function useLiFiRoute(params: LiFiQuoteRequest | null): UseLiFiRouteResult {
  const [route, setRoute] = useState<LiFiRoute | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const fetchedAt = useRef<number>(0)

  useEffect(() => {
    if (!params) {
      setRoute(null)
      setError(null)
      return
    }

    // Skip if amount is zero or missing
    if (!params.fromAmount || params.fromAmount === '0') {
      setRoute(null)
      return
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError(null)

      try {
        const result = await fetchLiFiQuote(params)
        if (!controller.signal.aborted) {
          setRoute(result)
          fetchedAt.current = Date.now()
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setError(err.message ?? 'Failed to fetch route')
          setRoute(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [params, refreshKey])

  const toAmountFormatted = route
    ? formatTokenAmount(route.toAmount, route.toToken.decimals)
    : null

  const gasCostUSD = route ? `$${route.gasCostUSD}` : null

  const priceImpactPct = route
    ? `${(route.priceImpact * 100).toFixed(2)}%`
    : null

  const executionTimeSec = route?.steps?.[0]?.estimate?.executionDuration ?? null

  const routeSummary = route ? buildRouteSummary(route.steps) : null

  return {
    route,
    loading,
    error,
    toAmountFormatted,
    gasCostUSD,
    priceImpactPct,
    executionTimeSec,
    routeSummary,
    refresh: () => setRefreshKey(k => k + 1),
  }
}

// ─── Chain selector helper ────────────────────────────────────────────────────

export const LIFI_SUPPORTED_CHAINS = [
  { id: 1,      name: 'Ethereum',   shortName: 'ETH' },
  { id: 42161,  name: 'Arbitrum',   shortName: 'ARB' },
  { id: 10,     name: 'Optimism',   shortName: 'OP' },
  { id: 137,    name: 'Polygon',    shortName: 'MATIC' },
  { id: 8453,   name: 'Base',       shortName: 'BASE' },
  { id: 56,     name: 'BNB Chain',  shortName: 'BNB' },
  { id: 43114,  name: 'Avalanche',  shortName: 'AVAX' },
] as const

export type LiFiChainId = typeof LIFI_SUPPORTED_CHAINS[number]['id']
