'use client'

/**
 * useStockPrices — live USD prices for GoodStocks synthetic equities.
 *
 * Data source priority:
 *   1. On-chain PriceOracle contract (when StocksPriceOracle is deployed)
 *      Reads all ticker prices in a single multicall via wagmi useReadContracts.
 *   2. Static fallback prices from stockData.ts
 *
 * Prices are returned as plain JavaScript numbers (dollars, NOT 8-decimal bigint).
 * The on-chain oracle returns 8-decimal integers — we convert via / 1e8.
 *
 * Refresh: on-chain data uses wagmi's built-in refetch interval (30s).
 */

import { useReadContracts } from 'wagmi'
import { useMemo } from 'react'
import { CONTRACTS } from './chain'
import { PriceOracleABI } from './abi'
import { getAllTickers, getStockByTicker } from './stockData'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StockPriceState {
  /** ticker → USD price as a plain number */
  prices: Record<string, number>
  /** true when prices come from the live on-chain oracle */
  isLive: boolean
  /** true while the first on-chain fetch is in flight */
  isLoading: boolean
}

// ─── Static fallback from stockData seeds ────────────────────────────────────

function buildFallbackPrices(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const ticker of getAllTickers()) {
    const stock = getStockByTicker(ticker)
    if (stock) out[ticker] = stock.price
  }
  return out
}

const FALLBACK_PRICES = buildFallbackPrices()

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns USD prices for all listed GoodStocks tickers.
 *
 * When the on-chain oracle is deployed (CONTRACTS.StocksPriceOracle is set),
 * prices are read from the chain and refreshed every 30 seconds.
 * Otherwise the static seed prices from stockData.ts are used.
 */
export function useStockPrices(): StockPriceState {
  const oracleAddress = CONTRACTS.StocksPriceOracle
  const tickers = useMemo(() => getAllTickers(), [])

  // Build a wagmi multicall for every ticker when the oracle is available.
  const contracts = useMemo(() => {
    if (!oracleAddress) return []
    return tickers.map(ticker => ({
      address: oracleAddress,
      abi: PriceOracleABI,
      functionName: 'getPrice' as const,
      args: [ticker] as const,
    }))
  }, [oracleAddress, tickers])

  const { data, isLoading } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      refetchInterval: 30_000,
    },
  })

  const prices = useMemo<Record<string, number>>(() => {
    if (!data || data.length === 0) return FALLBACK_PRICES

    const out: Record<string, number> = { ...FALLBACK_PRICES }
    let anyLive = false

    for (let i = 0; i < tickers.length; i++) {
      const result = data[i]
      if (result?.status === 'success' && typeof result.result === 'bigint') {
        // Oracle returns 8-decimal price (e.g. 17872000000 = $178.72)
        out[tickers[i]] = Number(result.result) / 1e8
        anyLive = true
      }
    }

    return anyLive ? out : FALLBACK_PRICES
  }, [data, tickers])

  const isLive = useMemo(() => {
    if (!data || data.length === 0) return false
    return data.some(r => r?.status === 'success')
  }, [data])

  return { prices, isLive, isLoading }
}

/**
 * Look up a single ticker's price from a prices map (with fallback).
 */
export function getStockPrice(
  prices: Record<string, number>,
  ticker: string,
): number {
  return prices[ticker] ?? FALLBACK_PRICES[ticker] ?? 0
}
