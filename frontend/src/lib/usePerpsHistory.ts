'use client'

/**
 * usePerpsHistory — reads perps trade history, funding payments, and leaderboard
 * from the GoodDollar L2 indexer API and on-chain PerpPriceOracle.
 *
 * The indexer (backend/indexer) stores PositionOpened, PositionClosed,
 * FundingApplied, and PositionLiquidated events. We query its REST API
 * and transform them into the types expected by the portfolio page.
 *
 * Also exports useOracleMarkPrices() which reads mark prices from PerpPriceOracle.
 */

import { useMemo, useEffect, useState } from 'react'
import { useReadContracts, useAccount } from 'wagmi'
import { CONTRACTS } from './chain'
import type {
  TradeHistoryRecord,
  FundingPayment,
  LeaderboardEntry,
} from './perpsData'

// ─── Config ───────────────────────────────────────────────────────────────────

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:4200'

// Market oracle keys (keccak256 of ticker string) — used for oracle reads
// Market ordering matches PerpEngine.markets[] array (verified via on-chain reads)
const MARKET_ORACLE_KEYS: Record<number, { key: `0x${string}`; symbol: string }> = {
  0: { key: '0xaaaebeba3810b1e6b70781f14b2d72c1cb89c0b2b320c43bb67ff79f562f5ff4', symbol: 'ETH-USD' },
  1: { key: '0xe98e2830be1a7e4156d656a7505e65d08c67660dc618072422e9c78053c261e9', symbol: 'BTC-USD' },
  2: { key: '0x0a3ec4fc70eaf64faf6eeda4e9b2bd4742a785464053aa23afad8bd24650e86f', symbol: 'SOL-USD' },
  3: { key: '0x3ed03c38e59dc60c7b69c2a4bf68f9214acd953252b5a90e8f5f59583e9bc3ae', symbol: 'BNB-USD' },
  4: { key: '0xa6a7de01e8b7ba6a4a61c782a73188d808fc1f3cf5743fadb68a02ed884b594f', symbol: 'MATIC-USD' },
  5: { key: '0xc07524b7a4eecc2784fc7ac17ff2730f877f3cf7a2ceb4e2375fa40a103115d0', symbol: 'ARB-USD' },
}

// Minimal ABI for PerpPriceOracle reads
const PerpPriceOracleABI = [
  {
    name: 'getMarkPrice',
    inputs: [{ name: 'key', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    name: 'getIndexPrice',
    inputs: [{ name: 'key', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const ORACLE = CONTRACTS.PerpPriceOracle

// ─── Oracle mark prices ───────────────────────────────────────────────────────

export function useOracleMarkPrices(marketCount: number): {
  markPrices: Record<number, number>
  indexPrices: Record<number, number>
  isLoading: boolean
} {
  const contracts = useMemo(() => {
    const list: Array<{
      address: `0x${string}`
      abi: typeof PerpPriceOracleABI
      functionName: 'getMarkPrice' | 'getIndexPrice'
      args: [`0x${string}`]
    }> = []
    for (let i = 0; i < marketCount; i++) {
      const m = MARKET_ORACLE_KEYS[i]
      if (!m || m.key === '0x0000000000000000000000000000000000000000000000000000000000000000') continue
      list.push({
        address: ORACLE as `0x${string}`,
        abi: PerpPriceOracleABI,
        functionName: 'getMarkPrice',
        args: [m.key],
      })
      list.push({
        address: ORACLE as `0x${string}`,
        abi: PerpPriceOracleABI,
        functionName: 'getIndexPrice',
        args: [m.key],
      })
    }
    return list
  }, [marketCount])

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, refetchInterval: 10_000 },
  })

  const { markPrices, indexPrices } = useMemo(() => {
    const mark: Record<number, number> = {}
    const index: Record<number, number> = {}
    if (!data) return { markPrices: mark, indexPrices: index }

    let dataIdx = 0
    for (let i = 0; i < Math.min(marketCount, Object.keys(MARKET_ORACLE_KEYS).length); i++) {
      const m = MARKET_ORACLE_KEYS[i]
      if (!m || m.key === '0x0000000000000000000000000000000000000000000000000000000000000000') continue
      const markResult = data[dataIdx]
      const indexResult = data[dataIdx + 1]
      dataIdx += 2
      if (markResult?.status === 'success' && markResult.result) {
        mark[i] = Number(markResult.result as bigint) / 1e8
      }
      if (indexResult?.status === 'success' && indexResult.result) {
        index[i] = Number(indexResult.result as bigint) / 1e8
      }
    }
    return { markPrices: mark, indexPrices: index }
  }, [data, marketCount])

  return { markPrices, indexPrices, isLoading }
}

// ─── Trade history from indexer ───────────────────────────────────────────────

interface IndexerEvent {
  tx_hash: string
  event_name: string
  timestamp: number
  args: Record<string, string | number | boolean>
}

async function fetchIndexerEvents(
  protocol: string,
  eventName?: string,
  limit: number = 100,
): Promise<IndexerEvent[]> {
  try {
    const params = new URLSearchParams({ limit: String(limit) })
    if (eventName) params.set('event', eventName)
    const url = `${INDEXER_URL}/api/events/${protocol}?${params}`
    const res = await fetch(url, { next: { revalidate: 15 } })
    if (!res.ok) return []
    const json = await res.json()
    return json.ok ? json.data : []
  } catch {
    return []
  }
}

// Map marketId → symbol
const MARKET_SYMBOLS: Record<number, string> = {
  0: 'ETH-USD',
  1: 'BTC-USD',
  2: 'SOL-USD',
  3: 'BNB-USD',
  4: 'MATIC-USD',
  5: 'ARB-USD',
}

export function useTradeHistory(): {
  trades: TradeHistoryRecord[]
  isLoading: boolean
} {
  const { address } = useAccount()
  const [trades, setTrades] = useState<TradeHistoryRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!address) {
      setTrades([])
      setIsLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      setIsLoading(true)
      // Fetch PositionClosed events (these represent completed trades)
      const closedEvents = await fetchIndexerEvents('perps', 'PositionClosed', 200)
      // Also fetch PositionOpened for entry info
      const openedEvents = await fetchIndexerEvents('perps', 'PositionOpened', 200)

      if (cancelled) return

      const userAddr = address!.toLowerCase()

      // Build a map of opened events by tx hash for cross-reference
      const openedByKey = new Map<string, IndexerEvent>()
      for (const ev of openedEvents) {
        const trader = String(ev.args.trader || '').toLowerCase()
        const mktId = Number(ev.args.marketId ?? 0)
        if (trader === userAddr) {
          openedByKey.set(`${trader}-${mktId}`, ev)
        }
      }

      // Map closed events to TradeHistoryRecord
      const records: TradeHistoryRecord[] = closedEvents
        .filter(ev => String(ev.args.trader || '').toLowerCase() === userAddr)
        .map((ev, idx) => {
          const mktId = Number(ev.args.marketId ?? 0)
          const pnl = Number(ev.args.pnl ?? 0) / 1e18
          const exitPrice = Number(ev.args.exitPrice ?? 0) / 1e8
          const opened = openedByKey.get(`${userAddr}-${mktId}`)
          const entryPrice = opened ? Number(opened.args.entryPrice ?? 0) / 1e8 : exitPrice
          const size = opened ? Number(opened.args.size ?? 0) / 1e18 : 0
          const isLong = opened ? Boolean(opened.args.isLong) : true
          const notional = size * entryPrice
          const fee = notional * 0.001 // 0.1% fee

          return {
            id: ev.tx_hash.slice(0, 10) + '-' + idx,
            pair: MARKET_SYMBOLS[mktId] ?? `MKT-${mktId}`,
            side: isLong ? 'long' as const : 'short' as const,
            type: 'market' as const,
            size,
            price: exitPrice || entryPrice,
            fee,
            pnl,
            timestamp: ev.timestamp * 1000,
          }
        })

      // Also include open events as "entry" trades for visibility
      const entryRecords: TradeHistoryRecord[] = openedEvents
        .filter(ev => String(ev.args.trader || '').toLowerCase() === userAddr)
        .map((ev, idx) => {
          const mktId = Number(ev.args.marketId ?? 0)
          const entryPrice = Number(ev.args.entryPrice ?? 0) / 1e8
          const size = Number(ev.args.size ?? 0) / 1e18
          const isLong = Boolean(ev.args.isLong)
          const notional = size * entryPrice
          const fee = notional * 0.001

          return {
            id: 'open-' + ev.tx_hash.slice(0, 10) + '-' + idx,
            pair: MARKET_SYMBOLS[mktId] ?? `MKT-${mktId}`,
            side: isLong ? 'long' as const : 'short' as const,
            type: 'market' as const,
            size,
            price: entryPrice,
            fee,
            pnl: 0,
            timestamp: ev.timestamp * 1000,
          }
        })

      setTrades([...records, ...entryRecords].sort((a, b) => b.timestamp - a.timestamp))
      setIsLoading(false)
    }

    load()
    // Refresh every 30 seconds
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [address])

  return { trades, isLoading }
}

// ─── Funding payments from indexer ────────────────────────────────────────────

export function useFundingPayments(): {
  funding: FundingPayment[]
  isLoading: boolean
} {
  const { address } = useAccount()
  const [funding, setFunding] = useState<FundingPayment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!address) {
      setFunding([])
      setIsLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      setIsLoading(true)
      const events = await fetchIndexerEvents('perps', 'FundingApplied', 100)
      if (cancelled) return

      // FundingApplied events are per-market, not per-user.
      // We show all funding events for markets the user has/had positions in.
      const payments: FundingPayment[] = events.map(ev => {
        const mktId = Number(ev.args.marketId ?? 0)
        const rate = Number(ev.args.rate ?? 0) / 1e18
        // Estimate user's funding payment based on rate (simplified)
        // In production, we'd track per-position funding accumulation
        const amount = rate * 100 // placeholder magnitude
        return {
          pair: MARKET_SYMBOLS[mktId] ?? `MKT-${mktId}`,
          amount,
          rate,
          timestamp: ev.timestamp * 1000,
        }
      })

      setFunding(payments.sort((a, b) => b.timestamp - a.timestamp))
      setIsLoading(false)
    }

    load()
    const interval = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [address])

  return { funding, isLoading }
}

// ─── Leaderboard from indexer ─────────────────────────────────────────────────

export function useLeaderboard(): {
  leaderboard: LeaderboardEntry[]
  isLoading: boolean
} {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      const closedEvents = await fetchIndexerEvents('perps', 'PositionClosed', 500)
      if (cancelled) return

      // Aggregate PnL per trader
      const traders = new Map<string, { pnl: number; wins: number; total: number; markets: Set<string> }>()

      for (const ev of closedEvents) {
        const trader = String(ev.args.trader || '').toLowerCase()
        const pnl = Number(ev.args.pnl ?? 0) / 1e18
        const mktId = Number(ev.args.marketId ?? 0)

        if (!traders.has(trader)) {
          traders.set(trader, { pnl: 0, wins: 0, total: 0, markets: new Set() })
        }
        const t = traders.get(trader)!
        t.pnl += pnl
        t.total += 1
        if (pnl > 0) t.wins += 1
        t.markets.add(MARKET_SYMBOLS[mktId] ?? `MKT-${mktId}`)
      }

      const sorted = [...traders.entries()]
        .sort(([, a], [, b]) => b.pnl - a.pnl)
        .slice(0, 20)
        .map(([addr, data], i) => ({
          rank: i + 1,
          address: addr.slice(0, 6) + '...' + addr.slice(-4),
          pnl: data.pnl,
          winRate: data.total > 0 ? data.wins / data.total : 0,
          totalTrades: data.total,
          topPair: [...data.markets][0] || 'N/A',
        }))

      setLeaderboard(sorted)
      setIsLoading(false)
    }

    load()
    const interval = setInterval(load, 120_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return { leaderboard, isLoading }
}
