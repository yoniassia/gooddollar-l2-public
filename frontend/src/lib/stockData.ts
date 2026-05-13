/**
 * stockData.ts — Types and formatting utilities for GoodStocks.
 *
 * MOCK DATA REMOVED — all data now comes from on-chain hooks:
 *   - useOnChainStocks() for stock listings + prices
 *   - useOnChainHoldings() for portfolio positions
 *   - useStockPrices() for live oracle prices
 *
 * This file retains types and formatting functions used by components.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Stock {
  ticker: string
  name: string
  sector: string
  description: string
  price: number
  change24h: number
  volume24h: number
  marketCap: number
  high52w: number
  low52w: number
  sparkline7d: number[]
  peRatio: number
  eps: number
  dividendYield: number
  avgVolume: number
}

export interface PortfolioHolding {
  ticker: string
  shares: number
  avgCost: number
  currentPrice: number
  collateralDeposited: number
  collateralRequired: number
}

export interface TradeRecord {
  id: string
  ticker: string
  side: 'buy' | 'sell'
  shares: number
  price: number
  timestamp: number
  pnl: number
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatStockPrice(price: number): string {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

// ─── Ticker list (for oracle reads) ──────────────────────────────────────────

const TICKERS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'JPM', 'V', 'DIS', 'NFLX', 'AMD']

export function getAllTickers(): string[] {
  return TICKERS
}

// ─── Deprecated mock getters — return empty; use hooks instead ───────────────
// Kept temporarily so pages that haven't migrated don't crash on import.

/** @deprecated Use useOnChainStocks() hook instead */
export function getStockData(): Stock[] { return [] }

/** @deprecated Use useOnChainStocks() hook instead */
export function getStockByTicker(_ticker: string): Stock | undefined { return undefined }

/** @deprecated Use useOnChainHoldings() hook instead */
export function getPortfolioHoldings(): PortfolioHolding[] { return [] }

/** @deprecated Use useOnChainHoldings() hook instead */
export function getTradeHistory(): TradeRecord[] { return [] }

/** @deprecated Use useOnChainHoldings() hook instead */
export function getPortfolioSummary() {
  return { totalValue: 0, totalCost: 0, totalCollateral: 0, totalRequired: 0, unrealizedPnl: 0, pnlPercent: 0, healthRatio: 0 }
}
