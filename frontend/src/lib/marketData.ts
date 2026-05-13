/**
 * marketData.ts — Types and formatting utilities for token market data (Explore page).
 *
 * MOCK DATA REMOVED — all data now comes from:
 *   - useOnChainMarketData() for live token prices (via CoinGecko + on-chain)
 *   - usePriceFeeds() for raw price data
 *
 * This file retains types and formatting functions used by components.
 */

import { TOKENS, TOKEN_COLORS, type Token } from './tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenMarketData extends Token {
  price: number
  change1h: number
  change24h: number
  change7d: number
  volume24h: number
  marketCap: number
  sparkline7d: number[]
  description: string
  circulatingSupply?: number
  maxSupply?: number | null
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (price >= 1) return `$${price.toFixed(2)}`
  if (price >= 0.01) return `$${price.toFixed(4)}`
  return `$${price.toFixed(6)}`
}

export function formatVolume(vol: number): string {
  if (vol >= 1e12) return `$${(vol / 1e12).toFixed(2)}T`
  if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`
  if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`
  if (vol >= 1e3) return `$${(vol / 1e3).toFixed(0)}K`
  return `$${vol.toFixed(0)}`
}

export function formatMarketCap(cap: number): string {
  return formatVolume(cap)
}

export { TOKEN_COLORS }

// ─── Deprecated mock getters — return empty; use hooks instead ───────────────

/** @deprecated Use useOnChainMarketData() hook instead */
export function getTokenMarketData(): TokenMarketData[] { return [] }

/** @deprecated Use useOnChainMarketData() hook instead */
export function getTokenBySymbol(_symbol: string): TokenMarketData | undefined { return undefined }
