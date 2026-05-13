'use client'

/**
 * useStockHoldings — live portfolio positions from CollateralVault.
 *
 * Reads getPosition(user, ticker) for all listed stocks in a single multicall.
 * Only positions with non-zero debt (minted synthetic tokens) are returned.
 *
 * Returned PortfolioHolding fields:
 *   shares             – synthetic tokens minted (userDebt / 1e18)
 *   collateralDeposited – G$ locked as collateral / 1e18
 *   currentPrice       – live USD price from PriceOracle via useStockPrices
 *   collateralRequired  – minimum G$ needed at 150% ratio (shares × price × 1.5)
 *   avgCost            – not recoverable from vault state; always 0
 *
 * Refresh: every 30 s (inherits wagmi refetchInterval).
 */

import { useReadContracts } from 'wagmi'
import { useMemo } from 'react'
import { CONTRACTS } from './chain'
import { CollateralVaultABI } from './abi'
import { getAllTickers, type PortfolioHolding } from './stockData'
import { useStockPrices } from './useStockPrices'

const MIN_COLLATERAL_RATIO = 1.5 // 150% — matches CollateralVault.MIN_COLLATERAL_RATIO

export interface StockHoldingsState {
  holdings: PortfolioHolding[]
  totalValue: number
  totalCollateral: number
  totalRequired: number
  unrealizedPnl: number
  pnlPercent: number
  /** totalCollateral / totalRequired × 100. 0 when no positions. */
  healthRatio: number
  /** true when at least one position was read from the chain */
  isLive: boolean
  isLoading: boolean
}

export function useStockHoldings(
  userAddress: `0x${string}` | undefined,
): StockHoldingsState {
  const tickers = useMemo(() => getAllTickers(), [])
  const { prices, isLoading: pricesLoading } = useStockPrices()

  const contracts = useMemo(() => {
    if (!userAddress) return []
    return tickers.map(ticker => ({
      address: CONTRACTS.CollateralVault,
      abi: CollateralVaultABI,
      functionName: 'getPosition' as const,
      args: [userAddress, ticker] as const,
    }))
  }, [userAddress, tickers])

  const { data, isLoading: positionsLoading } = useReadContracts({
    contracts,
    query: {
      enabled: contracts.length > 0,
      refetchInterval: 30_000,
    },
  })

  const holdings = useMemo<PortfolioHolding[]>(() => {
    if (!data || !userAddress) return []
    const result: PortfolioHolding[] = []

    for (let i = 0; i < tickers.length; i++) {
      const r = data[i]
      if (r?.status !== 'success') continue
      const [userCollateral, userDebt] = r.result as readonly [bigint, bigint, bigint]
      if (userDebt === BigInt(0)) continue

      const ticker = tickers[i]
      const shares = Number(userDebt) / 1e18
      const collateralDeposited = Number(userCollateral) / 1e18
      const currentPrice = prices[ticker] ?? 0
      const collateralRequired = shares * currentPrice * MIN_COLLATERAL_RATIO

      result.push({
        ticker,
        shares,
        avgCost: 0,
        currentPrice,
        collateralDeposited,
        collateralRequired,
      })
    }

    return result
  }, [data, userAddress, tickers, prices])

  const summary = useMemo(() => {
    const totalValue = holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0)
    const totalCost = holdings.reduce((s, h) => s + h.shares * h.avgCost, 0)
    const totalCollateral = holdings.reduce((s, h) => s + h.collateralDeposited, 0)
    const totalRequired = holdings.reduce((s, h) => s + h.collateralRequired, 0)
    const unrealizedPnl = totalValue - totalCost
    const pnlPercent = totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0
    const healthRatio = totalRequired > 0 ? (totalCollateral / totalRequired) * 100 : 0
    return { totalValue, totalCollateral, totalRequired, unrealizedPnl, pnlPercent, healthRatio }
  }, [holdings])

  const isLive = useMemo(
    () => !!data && data.some(r => r?.status === 'success'),
    [data],
  )

  return {
    holdings,
    ...summary,
    isLive,
    isLoading: positionsLoading || pricesLoading,
  }
}
