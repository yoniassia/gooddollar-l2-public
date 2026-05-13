'use client'

/**
 * useOnChainPredict — reads prediction market data from on-chain MarketFactory.
 *
 * Replaces MOCK_MARKETS / MOCK_POSITIONS / MOCK_RESOLVED from predictData.ts
 * with real reads from MarketFactory.getMarket() and impliedProbabilityYES().
 *
 * Falls back to empty data when contracts are unavailable.
 */

import { useMemo } from 'react'
import { useReadContract, useReadContracts, useAccount } from 'wagmi'
import { MarketFactoryABI, ConditionalTokensABI } from './abi'
import { CONTRACTS } from './chain'
import type { PredictionMarket, MarketCategory, UserPosition, ResolvedPosition } from './predictData'

// ─── Fallback demo prediction markets when on-chain data is unavailable ──────
const FALLBACK_MARKETS: PredictionMarket[] = [
  { id: 'demo-1', question: 'Will Bitcoin exceed $100,000 by end of 2025?', category: 'Crypto', yesPrice: 0.72, volume: 4_500_000, liquidity: 1_200_000, endDate: '2025-12-31', resolved: false, resolutionSource: 'CoinGecko spot price', createdAt: '2025-01-15', totalShares: 8_500_000 },
  { id: 'demo-2', question: 'Will the US pass a stablecoin regulation bill by Q3 2025?', category: 'Politics', yesPrice: 0.58, volume: 2_100_000, liquidity: 680_000, endDate: '2025-09-30', resolved: false, resolutionSource: 'Congressional record', createdAt: '2025-02-01', totalShares: 3_200_000 },
  { id: 'demo-3', question: 'Will OpenAI release GPT-5 before July 2025?', category: 'AI & Tech', yesPrice: 0.45, volume: 3_800_000, liquidity: 950_000, endDate: '2025-07-01', resolved: false, resolutionSource: 'OpenAI official announcement', createdAt: '2025-01-20', totalShares: 6_100_000 },
  { id: 'demo-4', question: 'Will Ethereum ETF daily inflows exceed $1B in a single day in 2025?', category: 'Crypto', yesPrice: 0.38, volume: 1_750_000, liquidity: 520_000, endDate: '2025-12-31', resolved: false, resolutionSource: 'Bloomberg ETF data', createdAt: '2025-03-01', totalShares: 2_900_000 },
  { id: 'demo-5', question: 'Will Real Madrid win the 2025 Champions League?', category: 'Sports', yesPrice: 0.31, volume: 6_200_000, liquidity: 1_800_000, endDate: '2025-06-01', resolved: false, resolutionSource: 'UEFA official results', createdAt: '2025-02-10', totalShares: 9_400_000 },
  { id: 'demo-6', question: 'Will GoodDollar reach 1 million unique claimers by end of 2025?', category: 'Crypto', yesPrice: 0.62, volume: 890_000, liquidity: 310_000, endDate: '2025-12-31', resolved: false, resolutionSource: 'GoodDollar dashboard', createdAt: '2025-03-15', totalShares: 1_500_000 },
]

const FACTORY = CONTRACTS.MarketFactory
const COND_TOKENS = CONTRACTS.ConditionalTokens

// ─── Infer category from question text ───────────────────────────────────────

function inferCategory(question: string): MarketCategory {
  const q = question.toLowerCase()
  if (q.includes('bitcoin') || q.includes('ethereum') || q.includes('crypto') || q.includes('gooddollar') || q.includes('etoro') || q.includes('etor')) return 'Crypto'
  if (q.includes('election') || q.includes('fed ') || q.includes('regulation') || q.includes('legislation') || q.includes('congress') || q.includes('stablecoin')) return 'Politics'
  if (q.includes('champion') || q.includes('nba') || q.includes('fifa') || q.includes('world cup') || q.includes('olympic')) return 'Sports'
  if (q.includes('ai ') || q.includes('agi') || q.includes('gpt') || q.includes('openai') || q.includes('nvidia') || q.includes('apple') || q.includes('agent')) return 'AI & Tech'
  if (q.includes('spacex') || q.includes('mars') || q.includes('climate') || q.includes('pandemic') || q.includes('who ')) return 'World Events'
  return 'Culture'
}

// Market status enum matches Solidity: 0=Open, 1=Closed, 2=ResolvedYES, 3=ResolvedNO, 4=Voided
type ChainMarketStatus = 0 | 1 | 2 | 3 | 4

// ─── Read all markets from chain ─────────────────────────────────────────────

export function useOnChainMarkets(): {
  markets: PredictionMarket[]
  isLoading: boolean
  isLive: boolean
} {
  // Step 1: Get market count
  const { data: countData, isLoading: countLoading } = useReadContract({
    address: FACTORY,
    abi: MarketFactoryABI,
    functionName: 'marketCount',
    query: { refetchInterval: 30_000 },
  })

  const marketCount = typeof countData === 'bigint' ? Number(countData) : 0

  // Step 2: Batch-read all markets + probabilities
  const contracts = useMemo(() => {
    if (marketCount === 0) return []
    const calls: Array<{
      address: `0x${string}`
      abi: typeof MarketFactoryABI
      functionName: string
      args: [bigint]
    }> = []
    for (let i = 0; i < marketCount; i++) {
      const id = BigInt(i)
      calls.push({
        address: FACTORY,
        abi: MarketFactoryABI,
        functionName: 'getMarket',
        args: [id],
      })
      calls.push({
        address: FACTORY,
        abi: MarketFactoryABI,
        functionName: 'impliedProbabilityYES',
        args: [id],
      })
    }
    return calls
  }, [marketCount])

  const { data: batchData, isLoading: batchLoading } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, refetchInterval: 30_000 },
  })

  const markets = useMemo<PredictionMarket[]>(() => {
    if (!batchData || batchData.length === 0) return []

    const result: PredictionMarket[] = []

    for (let i = 0; i < marketCount; i++) {
      const marketResult = batchData[i * 2]
      const probResult = batchData[i * 2 + 1]

      if (marketResult?.status !== 'success' || !marketResult.result) continue

      // getMarket returns: (question, endTime, status, totalYES, totalNO, collateral)
      const [question, endTime, status, totalYES, totalNO, collateral] = marketResult.result as unknown as [
        string, bigint, number, bigint, bigint, bigint
      ]

      const chainStatus = Number(status) as ChainMarketStatus
      const yesTokens = Number(totalYES) / 1e18
      const noTokens = Number(totalNO) / 1e18
      const totalCollateral = Number(collateral) / 1e18

      // Implied probability from contract (basis points)
      let yesPrice = 0.5
      if (probResult?.status === 'success' && typeof probResult.result === 'bigint') {
        yesPrice = Number(probResult.result) / 10000
      }

      const endDate = new Date(Number(endTime) * 1000).toISOString().split('T')[0]
      const resolved = chainStatus === 2 || chainStatus === 3
      const outcome = chainStatus === 2 ? 'yes' : chainStatus === 3 ? 'no' : undefined

      result.push({
        id: String(i),
        question,
        category: inferCategory(question),
        yesPrice,
        volume: totalCollateral,      // total G$ collateral as volume proxy
        liquidity: totalCollateral,
        endDate,
        resolved,
        outcome,
        resolutionSource: 'On-chain oracle / admin resolution',
        createdAt: endDate,            // no createdAt on chain; use endDate
        totalShares: yesTokens + noTokens,
      })
    }

    return result
  }, [batchData, marketCount])

  const finalMarkets = markets.length > 0 ? markets : FALLBACK_MARKETS
  return {
    markets: finalMarkets,
    isLoading: countLoading || batchLoading,
    isLive: markets.length > 0,
  }
}

// ─── Read user positions (ConditionalTokens balances) ────────────────────────

export function useOnChainPredictPositions(): {
  positions: UserPosition[]
  resolved: ResolvedPosition[]
  isLoading: boolean
} {
  const { address, isConnected } = useAccount()

  // Get market count
  const { data: countData } = useReadContract({
    address: FACTORY,
    abi: MarketFactoryABI,
    functionName: 'marketCount',
    query: { refetchInterval: 30_000 },
  })

  const marketCount = typeof countData === 'bigint' ? Number(countData) : 0

  // Read YES/NO token balances for each market + market data.
  // ConditionalTokens is ERC1155: balanceOf(owner, tokenId).
  // YES token ID = marketId * 2, NO token ID = marketId * 2 + 1.
  const contracts = useMemo(() => {
    if (!isConnected || !address || marketCount === 0 || !COND_TOKENS) return []
    const calls: Array<{
      address: `0x${string}`
      abi: typeof ConditionalTokensABI | typeof MarketFactoryABI
      functionName: string
      args: readonly unknown[]
    }> = []
    for (let i = 0; i < marketCount; i++) {
      const id = BigInt(i)
      const yesId = id * 2n        // yesTokenId = marketId * 2
      const noId = id * 2n + 1n    // noTokenId  = marketId * 2 + 1
      // YES balance
      calls.push({
        address: COND_TOKENS,
        abi: ConditionalTokensABI,
        functionName: 'balanceOf',
        args: [address, yesId] as const,
      })
      // NO balance
      calls.push({
        address: COND_TOKENS,
        abi: ConditionalTokensABI,
        functionName: 'balanceOf',
        args: [address, noId] as const,
      })
      // implied probability
      calls.push({
        address: FACTORY,
        abi: MarketFactoryABI,
        functionName: 'impliedProbabilityYES',
        args: [id] as const,
      })
      // market status
      calls.push({
        address: FACTORY,
        abi: MarketFactoryABI,
        functionName: 'getMarket',
        args: [id] as const,
      })
    }
    return calls
  }, [address, isConnected, marketCount])

  const { data: batchData, isLoading } = useReadContracts({
    contracts: contracts as any,
    query: { enabled: contracts.length > 0, refetchInterval: 30_000 },
  })

  const { positions, resolved } = useMemo(() => {
    const pos: UserPosition[] = []
    const res: ResolvedPosition[] = []

    if (!batchData || batchData.length === 0) return { positions: pos, resolved: res }

    for (let i = 0; i < marketCount; i++) {
      const yesResult = batchData[i * 4]
      const noResult = batchData[i * 4 + 1]
      const probResult = batchData[i * 4 + 2]
      const marketResult = batchData[i * 4 + 3]

      const yesBal = yesResult?.status === 'success' && typeof yesResult.result === 'bigint'
        ? Number(yesResult.result) / 1e18
        : 0
      const noBal = noResult?.status === 'success' && typeof noResult.result === 'bigint'
        ? Number(noResult.result) / 1e18
        : 0

      if (yesBal === 0 && noBal === 0) continue

      let yesPrice = 0.5
      if (probResult?.status === 'success' && typeof probResult.result === 'bigint') {
        yesPrice = Number(probResult.result) / 10000
      }

      let chainStatus = 0
      if (marketResult?.status === 'success' && marketResult.result) {
        const [, , status] = marketResult.result as unknown as [string, bigint, number, bigint, bigint, bigint]
        chainStatus = Number(status)
      }

      const isResolved = chainStatus === 2 || chainStatus === 3
      const outcome = chainStatus === 2 ? 'yes' : 'no'

      // Figure out dominant side
      const side = yesBal >= noBal ? 'yes' : 'no'
      const shares = side === 'yes' ? yesBal : noBal

      if (isResolved) {
        const payout = (outcome === side) ? shares : 0
        res.push({
          marketId: String(i),
          side: side as 'yes' | 'no',
          shares,
          avgPrice: 0.5, // no avg price tracked on-chain
          outcome: outcome as 'yes' | 'no',
          payout,
        })
      } else {
        pos.push({
          marketId: String(i),
          side: side as 'yes' | 'no',
          shares,
          avgPrice: 0.5, // no avg price tracked on-chain
          currentPrice: yesPrice,
        })
      }
    }

    return { positions: pos, resolved: res }
  }, [batchData, marketCount])

  return { positions, resolved, isLoading }
}

// ─── Portfolio summary ───────────────────────────────────────────────────────

export function useOnChainPredictSummary() {
  const { positions } = useOnChainPredictPositions()

  return useMemo(() => {
    const totalInvested = positions.reduce((sum, p) => sum + p.shares * p.avgPrice, 0)
    const currentValue = positions.reduce((sum, p) => {
      const price = p.side === 'yes' ? p.currentPrice : 1 - p.currentPrice
      return sum + p.shares * price
    }, 0)
    const unrealizedPnl = currentValue - totalInvested

    return { totalInvested, currentValue, unrealizedPnl }
  }, [positions])
}
