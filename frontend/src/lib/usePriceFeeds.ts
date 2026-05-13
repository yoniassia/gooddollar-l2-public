'use client'

/**
 * usePriceFeeds — live USD price data via CoinGecko public API.
 *
 * Falls back to static mock prices when:
 *  - the fetch fails (network error, rate limit)
 *  - running in a test environment (no window)
 *  - the symbol is not in the CoinGecko mapping
 *
 * Prices refresh every 60 seconds.
 */

import { useState, useEffect, useCallback } from 'react'

// ─── CoinGecko ID mapping ─────────────────────────────────────────────────────

const COINGECKO_IDS: Record<string, string> = {
  ETH:   'ethereum',
  WETH:  'ethereum',
  WBTC:  'wrapped-bitcoin',
  USDC:  'usd-coin',
  USDT:  'tether',
  DAI:   'dai',
  'G$':  'good-dollar',
  LINK:  'chainlink',
  UNI:   'uniswap',
  AAVE:  'aave',
  ARB:   'arbitrum',
  OP:    'optimism',
  MKR:   'maker',
  COMP:  'compound-governance-token',
  SNX:   'havven',
  CRV:   'curve-dao-token',
  LDO:   'lido-dao',
  MATIC: 'matic-network',
}

// ─── Fallback (static) prices ─────────────────────────────────────────────────

export const FALLBACK_PRICES: Record<string, number> = {
  ETH:   3012.45,
  WETH:  3012.45,
  WBTC:  60125.80,
  USDC:  1.00,
  USDT:  1.00,
  DAI:   1.00,
  'G$':  0.0102,
  LINK:  14.85,
  UNI:   7.92,
  AAVE:  89.50,
  ARB:   1.18,
  OP:    2.45,
  MKR:   2814.00,
  COMP:  49.80,
  SNX:   2.95,
  CRV:   0.58,
  LDO:   2.18,
  MATIC: 0.71,
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const REFRESH_MS = 60_000

async function fetchCoinGeckoPrices(symbols: string[]): Promise<Record<string, number>> {
  const ids = Array.from(new Set(symbols.map(s => COINGECKO_IDS[s]).filter(Boolean)))
  if (ids.length === 0) return {}

  const url = `${COINGECKO_BASE}/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
  const res = await fetch(url, { next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)

  const data: Record<string, { usd: number }> = await res.json()

  const out: Record<string, number> = {}
  for (const sym of symbols) {
    const id = COINGECKO_IDS[sym]
    if (id && data[id]?.usd) {
      out[sym] = data[id].usd
    }
  }
  return out
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface PriceFeedState {
  prices: Record<string, number>
  isLive: boolean
  lastUpdated: Date | null
  error: string | null
}

/**
 * Returns live USD prices for the given token symbols.
 * On error, falls back to FALLBACK_PRICES.
 *
 * @param symbols - list of token symbols to watch (e.g. ['ETH', 'USDC'])
 */
export function usePriceFeeds(symbols: string[]): PriceFeedState {
  const [state, setState] = useState<PriceFeedState>({
    prices: FALLBACK_PRICES,
    isLive: false,
    lastUpdated: null,
    error: null,
  })

  const fetch_ = useCallback(async () => {
    try {
      const live = await fetchCoinGeckoPrices(symbols)
      setState(prev => ({
        prices: { ...prev.prices, ...live },
        isLive: Object.keys(live).length > 0,
        lastUpdated: new Date(),
        error: null,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLive: false,
        error: err instanceof Error ? err.message : 'Price feed unavailable',
      }))
    }
  }, [symbols.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch_()
    const id = setInterval(fetch_, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetch_])

  return state
}

/**
 * Get a single price (synchronous, from preloaded state or fallback).
 */
export function getPrice(prices: Record<string, number>, symbol: string): number {
  return prices[symbol] ?? FALLBACK_PRICES[symbol] ?? 0
}
