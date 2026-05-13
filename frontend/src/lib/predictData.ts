/**
 * predictData.ts — Types, utility functions, and category definitions for
 * prediction markets.
 *
 * Mock data has been REMOVED (GOO-215). All market/position data now comes
 * from on-chain reads via useOnChainPredict.ts and useMarkets.ts.
 *
 * This module retains:
 *   - Type exports (PredictionMarket, UserPosition, etc.)
 *   - Pure utility functions (filtering, sorting, formatting)
 *   - Category constants
 */

export type MarketCategory = 'Crypto' | 'Politics' | 'Sports' | 'AI & Tech' | 'World Events' | 'Culture'

export interface PredictionMarket {
  id: string
  question: string
  category: MarketCategory
  yesPrice: number
  volume: number
  liquidity: number
  endDate: string
  resolved: boolean
  outcome?: 'yes' | 'no'
  resolutionSource: string
  createdAt: string
  totalShares: number
}

export const ALL_CATEGORIES: MarketCategory[] = ['Crypto', 'Politics', 'Sports', 'AI & Tech', 'World Events', 'Culture']

export type SortOption = 'trending' | 'newest' | 'volume' | 'ending'

export function filterAndSortMarkets(
  markets: PredictionMarket[],
  category: MarketCategory | 'All',
  sort: SortOption,
  query: string,
): PredictionMarket[] {
  let result = [...markets]

  if (category !== 'All') {
    result = result.filter(m => m.category === category)
  }

  if (query.trim()) {
    const q = query.trim().toLowerCase()
    result = result.filter(m => m.question.toLowerCase().includes(q))
  }

  const expiredLast = (a: PredictionMarket, b: PredictionMarket) => {
    const aExpired = getMarketStatus(a.endDate) === 'expired'
    const bExpired = getMarketStatus(b.endDate) === 'expired'
    if (aExpired && !bExpired) return 1
    if (!aExpired && bExpired) return -1
    return 0
  }

  switch (sort) {
    case 'trending':
      result.sort((a, b) => expiredLast(a, b) || b.volume - a.volume)
      break
    case 'newest':
      result.sort((a, b) => expiredLast(a, b) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      break
    case 'volume':
      result.sort((a, b) => expiredLast(a, b) || b.volume - a.volume)
      break
    case 'ending':
      result.sort((a, b) => expiredLast(a, b) || new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
      break
  }

  return result
}

export type MarketStatus = 'active' | 'ending-today' | 'expired'

export function getMarketStatus(endDate: string): MarketStatus {
  const end = new Date(endDate)
  const now = new Date()
  const msLeft = end.getTime() - now.getTime()
  if (msLeft < 0) return 'expired'
  if (msLeft < 24 * 60 * 60 * 1000) return 'ending-today'
  return 'active'
}

export function getDaysLeftLabel(endDate: string): string {
  const status = getMarketStatus(endDate)
  if (status === 'expired') return 'Expired'
  if (status === 'ending-today') return 'Ending today'
  const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  return `${days}d left`
}

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function generateProbabilityHistory(marketId: string, currentPrice: number, points = 30): number[] {
  const rng = seededRandom(hashString(marketId))
  const startPrice = Math.max(0.02, Math.min(0.98, currentPrice + (rng() - 0.5) * 0.4))
  const result: number[] = []
  let price = startPrice
  const step = (currentPrice - startPrice) / points

  for (let i = 0; i < points; i++) {
    result.push(Math.max(0.01, Math.min(0.99, price)))
    price += step + (rng() - 0.5) * 0.06
  }
  result.push(currentPrice)
  return result
}

export function formatVolume(vol: number): string {
  if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`
  if (vol >= 1e3) return `$${(vol / 1e3).toFixed(0)}K`
  return `$${vol.toFixed(0)}`
}

export interface UserPosition {
  marketId: string
  side: 'yes' | 'no'
  shares: number
  avgPrice: number
  currentPrice: number
}

export interface ResolvedPosition {
  marketId: string
  side: 'yes' | 'no'
  shares: number
  avgPrice: number
  outcome: 'yes' | 'no'
  payout: number
}
