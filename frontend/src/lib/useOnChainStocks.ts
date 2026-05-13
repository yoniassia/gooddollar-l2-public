'use client'

/**
 * useOnChainStocks — reads synthetic stock data from on-chain contracts.
 *
 * Replaces mock MOCK_STOCKS/MOCK_HOLDINGS/MOCK_TRADES from stockData.ts
 * with real reads from SyntheticAssetFactory, CollateralVault, and PriceOracle.
 *
 * Falls back to empty data when contracts are unavailable.
 */

import { useMemo } from 'react'
import { useReadContract, useReadContracts, useAccount } from 'wagmi'
import { SyntheticAssetFactoryABI, CollateralVaultABI, PriceOracleABI } from './abi'
import { CONTRACTS } from './chain'
import type { Stock, PortfolioHolding } from './stockData'

// ─── Fallback demo stocks when on-chain data is unavailable ──────────────────
const FALLBACK_STOCKS: Stock[] = [
  { ticker: 'AAPL', name: 'sAAPL', sector: 'Technology', description: 'Apple Inc. — smartphones, computers, services.', price: 218.27, change24h: 1.3, volume24h: 62_000_000, marketCap: 3_340_000_000_000, high52w: 237.49, low52w: 164.08, sparkline7d: [213, 214, 215, 216, 217, 218, 218.27], peRatio: 33.8, eps: 6.46, dividendYield: 0.44, avgVolume: 58_000_000 },
  { ticker: 'MSFT', name: 'sMSFT', sector: 'Technology', description: 'Microsoft Corp. — Windows, Azure, Office.', price: 388.45, change24h: 0.9, volume24h: 22_000_000, marketCap: 2_890_000_000_000, high52w: 420.82, low52w: 309.45, sparkline7d: [383, 384, 385, 386, 387, 388, 388.45], peRatio: 34.2, eps: 11.36, dividendYield: 0.72, avgVolume: 20_000_000 },
  { ticker: 'GOOGL', name: 'sGOOGL', sector: 'Technology', description: 'Alphabet Inc. — Google, YouTube, Cloud.', price: 161.12, change24h: -0.5, volume24h: 25_000_000, marketCap: 2_010_000_000_000, high52w: 191.75, low52w: 130.67, sparkline7d: [159, 160, 160.5, 161, 161.2, 161, 161.12], peRatio: 22.1, eps: 7.29, dividendYield: 0.50, avgVolume: 23_000_000 },
  { ticker: 'AMZN', name: 'sAMZN', sector: 'Consumer', description: 'Amazon.com — e-commerce & AWS cloud.', price: 186.21, change24h: 1.8, volume24h: 48_000_000, marketCap: 1_950_000_000_000, high52w: 201.20, low52w: 151.61, sparkline7d: [182, 183, 184, 185, 185.5, 186, 186.21], peRatio: 58.3, eps: 3.19, dividendYield: 0, avgVolume: 44_000_000 },
  { ticker: 'NVDA', name: 'sNVDA', sector: 'Technology', description: 'NVIDIA Corp. — GPUs & AI computing.', price: 104.75, change24h: 3.2, volume24h: 310_000_000, marketCap: 2_580_000_000_000, high52w: 153.13, low52w: 75.61, sparkline7d: [98, 99, 101, 102, 103, 104, 104.75], peRatio: 60.1, eps: 1.74, dividendYield: 0.03, avgVolume: 280_000_000 },
  { ticker: 'TSLA', name: 'sTSLA', sector: 'Automotive', description: 'Tesla Inc. — electric vehicles & energy.', price: 272.18, change24h: -2.1, volume24h: 95_000_000, marketCap: 874_000_000_000, high52w: 488.54, low52w: 138.80, sparkline7d: [280, 278, 276, 275, 274, 273, 272.18], peRatio: 150.2, eps: 1.81, dividendYield: 0, avgVolume: 88_000_000 },
  { ticker: 'META', name: 'sMETA', sector: 'Technology', description: 'Meta Platforms — Facebook, Instagram, WhatsApp.', price: 567.89, change24h: 0.6, volume24h: 18_000_000, marketCap: 1_430_000_000_000, high52w: 602.95, low52w: 414.50, sparkline7d: [562, 563, 564, 565, 566, 567, 567.89], peRatio: 25.7, eps: 22.10, dividendYield: 0.36, avgVolume: 16_000_000 },
  { ticker: 'NFLX', name: 'sNFLX', sector: 'Entertainment', description: 'Netflix — streaming entertainment.', price: 998.61, change24h: 1.1, volume24h: 5_200_000, marketCap: 428_000_000_000, high52w: 1040.00, low52w: 550.64, sparkline7d: [990, 992, 994, 995, 996, 997, 998.61], peRatio: 48.9, eps: 20.42, dividendYield: 0, avgVolume: 4_800_000 },
  { ticker: 'AMD', name: 'sAMD', sector: 'Technology', description: 'AMD — CPUs, GPUs, adaptive computing.', price: 101.32, change24h: -1.5, volume24h: 42_000_000, marketCap: 164_000_000_000, high52w: 187.28, low52w: 97.09, sparkline7d: [104, 103, 102.5, 102, 101.8, 101.5, 101.32], peRatio: 102.3, eps: 0.99, dividendYield: 0, avgVolume: 38_000_000 },
  { ticker: 'COIN', name: 'sCOIN', sector: 'Finance', description: 'Coinbase Global — crypto exchange platform.', price: 178.54, change24h: 4.2, volume24h: 12_000_000, marketCap: 43_500_000_000, high52w: 349.75, low52w: 146.12, sparkline7d: [170, 172, 174, 175, 176, 177, 178.54], peRatio: 28.6, eps: 6.24, dividendYield: 0, avgVolume: 10_000_000 },
]

const FACTORY = CONTRACTS.SyntheticAssetFactory
const VAULT = CONTRACTS.CollateralVault
const ORACLE = CONTRACTS.StocksPriceOracle

// Static metadata for known stocks (sector/description enrichment)
const STOCK_META: Record<string, { sector: string; description: string }> = {
  AAPL:  { sector: 'Technology', description: 'Apple Inc. — smartphones, computers, services.' },
  TSLA:  { sector: 'Automotive', description: 'Tesla Inc. — electric vehicles & energy.' },
  NVDA:  { sector: 'Technology', description: 'NVIDIA Corp. — GPUs & AI computing.' },
  MSFT:  { sector: 'Technology', description: 'Microsoft Corp. — Windows, Azure, Office.' },
  AMZN:  { sector: 'Consumer', description: 'Amazon.com — e-commerce & AWS cloud.' },
  GOOGL: { sector: 'Technology', description: 'Alphabet Inc. — Google, YouTube, Cloud.' },
  META:  { sector: 'Technology', description: 'Meta Platforms — Facebook, Instagram, WhatsApp.' },
  JPM:   { sector: 'Finance', description: 'JPMorgan Chase — banking & financial services.' },
  V:     { sector: 'Finance', description: 'Visa Inc. — global payments network.' },
  DIS:   { sector: 'Entertainment', description: 'Walt Disney — media, parks, streaming.' },
  NFLX:  { sector: 'Entertainment', description: 'Netflix — streaming entertainment.' },
  AMD:   { sector: 'Technology', description: 'AMD — CPUs, GPUs, adaptive computing.' },
}

// Known tickers (matches what DeployGoodStocks deployed)
const KNOWN_TICKERS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'JPM', 'V', 'DIS', 'NFLX', 'AMD']

// ─── Read all stock listings + prices from chain ─────────────────────────────

export function useOnChainStocks(): { stocks: Stock[]; isLoading: boolean; isLive: boolean } {
  // Read prices for all known tickers from StocksPriceOracle
  const priceContracts = useMemo(() => {
    if (!ORACLE) return []
    return KNOWN_TICKERS.map(ticker => ({
      address: ORACLE as `0x${string}`,
      abi: PriceOracleABI,
      functionName: 'getPrice' as const,
      args: [ticker] as [string],
    }))
  }, [])

  const { data: priceData, isLoading } = useReadContracts({
    contracts: priceContracts,
    query: { enabled: priceContracts.length > 0, refetchInterval: 30_000 },
  })

  const stocks = useMemo<Stock[]>(() => {
    if (!priceData || priceData.length === 0) return []

    return KNOWN_TICKERS.map((ticker, i) => {
      const r = priceData[i]
      const price = r?.status === 'success' && typeof r.result === 'bigint'
        ? Number(r.result) / 1e8
        : 0

      if (price === 0) return null

      const meta = STOCK_META[ticker] ?? { sector: 'Unknown', description: `Synthetic ${ticker}` }

      return {
        ticker,
        name: `s${ticker}`,
        sector: meta.sector,
        description: meta.description,
        price,
        change24h: 0,
        volume24h: 0,
        marketCap: 0,
        high52w: price * 1.15,
        low52w: price * 0.75,
        sparkline7d: [price, price, price, price, price, price, price],
        peRatio: 0,
        eps: 0,
        dividendYield: 0,
        avgVolume: 0,
      }
    }).filter(Boolean) as Stock[]
  }, [priceData])

  const finalStocks = stocks.length > 0 ? stocks : FALLBACK_STOCKS
  return { stocks: finalStocks, isLoading, isLive: stocks.length > 0 }
}

// ─── Read user's on-chain portfolio (CollateralVault positions) ──────────────

export function useOnChainHoldings(): {
  holdings: PortfolioHolding[]
  isLoading: boolean
} {
  const { address } = useAccount()

  // Read positions for all tickers
  const posContracts = useMemo(() => {
    if (!VAULT || !address) return []
    return KNOWN_TICKERS.map(ticker => ({
      address: VAULT as `0x${string}`,
      abi: CollateralVaultABI,
      functionName: 'getPosition' as const,
      args: [address, ticker] as [string, string],
    }))
  }, [address])

  // Read prices
  const priceContracts = useMemo(() => {
    if (!ORACLE) return []
    return KNOWN_TICKERS.map(ticker => ({
      address: ORACLE as `0x${string}`,
      abi: PriceOracleABI,
      functionName: 'getPrice' as const,
      args: [ticker] as [string],
    }))
  }, [])

  const { data: posData, isLoading: posLoading } = useReadContracts({
    contracts: posContracts,
    query: { enabled: posContracts.length > 0, refetchInterval: 15_000 },
  })

  const { data: priceData } = useReadContracts({
    contracts: priceContracts,
    query: { enabled: priceContracts.length > 0, refetchInterval: 30_000 },
  })

  const holdings = useMemo<PortfolioHolding[]>(() => {
    if (!posData) return []

    const result: PortfolioHolding[] = []
    for (let i = 0; i < KNOWN_TICKERS.length; i++) {
      const posR = posData[i]
      if (posR?.status !== 'success' || !posR.result) continue

      const [collateralAmount, debtAmount] = posR.result as unknown as [bigint, bigint]
      if (debtAmount === BigInt(0)) continue // no position

      const shares = Number(debtAmount) / 1e18
      const collateral = Number(collateralAmount) / 1e18

      const priceR = priceData?.[i]
      const currentPrice = priceR?.status === 'success' && typeof priceR.result === 'bigint'
        ? Number(priceR.result) / 1e8
        : 0

      result.push({
        ticker: KNOWN_TICKERS[i],
        shares,
        avgCost: currentPrice, // CDP doesn't track avg cost, use current
        currentPrice,
        collateralDeposited: collateral,
        collateralRequired: shares * currentPrice * 0.5, // min 200% → 50% of value
      })
    }
    return result
  }, [posData, priceData])

  return { holdings, isLoading: posLoading }
}
