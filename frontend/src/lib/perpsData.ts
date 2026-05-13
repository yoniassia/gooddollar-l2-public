/**
 * perpsData.ts — Types and formatting utilities for GoodPerps.
 *
 * MOCK DATA REMOVED — all data now comes from on-chain hooks:
 *   - useOnChainPairs() for perpetual market listings
 *   - useOnChainPositions() for open positions
 *   - useOnChainAccountSummary() for account balance/margin
 *   - usePerps hooks for trade execution
 *
 * This file retains types and formatting functions used by components.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PerpPair {
  symbol: string
  baseAsset: string
  quoteAsset: string
  markPrice: number
  indexPrice: number
  change24h: number
  volume24h: number
  fundingRate: number
  nextFundingTime: number
  openInterest: number
  maxLeverage: number
}

export interface AccountSummaryData {
  balance: number
  equity: number
  unrealizedPnl: number
  marginUsed: number
  availableMargin: number
  marginRatio: number
}

export interface OpenPosition {
  pair: string
  side: 'long' | 'short'
  size: number
  leverage: number
  entryPrice: number
  markPrice: number
  liquidationPrice: number
  unrealizedPnl: number
  margin: number
  marginMode: 'cross' | 'isolated'
}

export interface PendingOrder {
  id: string
  pair: string
  type: 'limit' | 'stop-limit'
  side: 'long' | 'short'
  price: number
  triggerPrice?: number
  size: number
  leverage: number
  createdAt: number
}

export interface TradeHistoryRecord {
  id: string
  pair: string
  side: 'long' | 'short'
  type: 'market' | 'limit'
  size: number
  price: number
  fee: number
  pnl: number
  timestamp: number
}

export interface FundingPayment {
  pair: string
  amount: number
  rate: number
  timestamp: number
}

export interface LeaderboardEntry {
  rank: number
  address: string
  pnl: number
  winRate: number
  totalTrades: number
  topPair: string
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const PRICE_TIERS: [number, string][] = [
  [1e15, 'Q'],
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
]

export function formatPerpsPrice(price: number): string {
  const abs = Math.abs(price)
  const sign = price < 0 ? '-' : ''
  for (const [threshold, suffix] of PRICE_TIERS) {
    if (abs >= threshold) {
      const abbr = abs / threshold
      const decimals = abbr >= 100 ? 0 : abbr >= 10 ? 1 : 2
      return `${sign}$${abbr.toFixed(decimals)}${suffix}`
    }
  }
  if (abs >= 1000) return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`
  if (abs >= 0.01) return `${sign}$${abs.toFixed(4)}`
  return `${sign}$${abs.toFixed(6)}`
}

export function formatLargeValue(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  for (const [threshold, suffix] of PRICE_TIERS) {
    if (abs >= threshold) {
      const abbr = abs / threshold
      const decimals = abbr >= 100 ? 0 : abbr >= 10 ? 1 : 2
      return `${sign}$${abbr.toFixed(decimals)}${suffix}`
    }
  }
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`
  return `${sign}$${abs.toFixed(2)}`
}

export function formatFundingRate(rate: number): string {
  return `${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(4)}%`
}

export function getFundingCountdown(nextTime: number): string {
  const diff = Math.max(0, nextTime - Date.now())
  const hours = Math.floor(diff / (3600 * 1000))
  const minutes = Math.floor((diff % (3600 * 1000)) / (60 * 1000))
  return `${hours}h ${minutes}m`
}

// ─── Deprecated mock getters — return empty; use hooks instead ───────────────

/** @deprecated Use useOnChainPairs() hook instead */
export function getPairs(): PerpPair[] { return [] }

/** @deprecated Use useOnChainPairs() hook instead */
export function getPairBySymbol(_symbol: string): PerpPair | undefined { return undefined }

/** @deprecated Use useOnChainAccountSummary() hook instead */
export function getAccountSummary(): AccountSummaryData {
  return { balance: 0, equity: 0, unrealizedPnl: 0, marginUsed: 0, availableMargin: 0, marginRatio: 0 }
}

/** @deprecated Use useOnChainPositions() hook instead */
export function getOpenPositions(): OpenPosition[] { return [] }

/** @deprecated Use on-chain event logs instead */
export function getPendingOrders(): PendingOrder[] { return [] }

/** @deprecated Use on-chain event logs instead */
export function getTradeHistory(): TradeHistoryRecord[] { return [] }

/** @deprecated Use on-chain event logs instead */
export function getFundingPayments(): FundingPayment[] { return [] }

/** @deprecated Leaderboard from backend indexer */
export function getLeaderboard(): LeaderboardEntry[] { return [] }
