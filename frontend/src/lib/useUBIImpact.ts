'use client'

/**
 * useUBIImpact — wagmi hooks for UBIRevenueTracker on-chain reads.
 *
 * Provides:
 *   - useDashboardData(): aggregate stats (total fees, UBI, txs, protocol count)
 *   - useAllProtocols(): per-protocol breakdown array
 *   - useSnapshots(count): historical daily snapshots for charting
 *
 * All data is read directly from the UBIRevenueTracker contract (GOO-226).
 */

import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { UBIRevenueTrackerABI } from './abi'
import { CONTRACTS } from './chain'

const TRACKER = CONTRACTS.UBIRevenueTracker

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardData {
  totalFees: bigint
  totalUBI: bigint
  totalTx: bigint
  protocolCount: bigint
  activeProtocols: bigint
  splitterFees: bigint
  splitterUBI: bigint
  snapshotCount: bigint
  // Formatted
  totalFeesFormatted: string
  totalUBIFormatted: string
  splitterFeesFormatted: string
  splitterUBIFormatted: string
  ubiPercentage: number
}

export interface ProtocolStats {
  name: string
  category: string
  feeSource: string
  totalFees: bigint
  ubiContribution: bigint
  txCount: bigint
  lastUpdateBlock: bigint
  active: boolean
  // Formatted
  totalFeesFormatted: string
  ubiFormatted: string
  feeShare: number   // percentage of total fees
  ubiShare: number   // percentage of total UBI
}

export interface Snapshot {
  timestamp: bigint
  totalUBI: bigint
  totalFees: bigint
  protocolCount: bigint
  date: string
  totalUBIFormatted: string
  totalFeesFormatted: string
}

// ─── Category metadata ────────────────────────────────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  swap:    '#3b82f6', // blue
  perps:   '#f59e0b', // amber
  predict: '#8b5cf6', // purple
  lend:    '#10b981', // emerald
  stable:  '#06b6d4', // cyan
  stocks:  '#ef4444', // red
  bridge:  '#f97316', // orange
}

export const CATEGORY_ICONS: Record<string, string> = {
  swap:    '🔄',
  perps:   '📈',
  predict: '🔮',
  lend:    '🏦',
  stable:  '💵',
  stocks:  '📊',
  bridge:  '🌉',
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useDashboardData(): {
  data: DashboardData | null
  isLoading: boolean
  error: Error | null
} {
  const result = useReadContract({
    address: TRACKER,
    abi: UBIRevenueTrackerABI,
    functionName: 'getDashboardData',
    query: { refetchInterval: 15_000 },
  })

  const data = useMemo(() => {
    if (!result.data) return null
    const [totalFees, totalUBI, totalTx, protocolCount, activeProtocols, splitterFees, splitterUBI, snapshotCount] = result.data as unknown as bigint[]
    const ubiPct = totalFees > 0n ? Number((totalUBI * 10000n) / totalFees) / 100 : 0
    return {
      totalFees,
      totalUBI,
      totalTx,
      protocolCount,
      activeProtocols,
      splitterFees,
      splitterUBI,
      snapshotCount,
      totalFeesFormatted: formatGD(totalFees),
      totalUBIFormatted: formatGD(totalUBI),
      splitterFeesFormatted: formatGD(splitterFees),
      splitterUBIFormatted: formatGD(splitterUBI),
      ubiPercentage: ubiPct,
    }
  }, [result.data])

  return { data, isLoading: result.isLoading, error: result.error as Error | null }
}

export function useAllProtocols(totalFeesRef?: bigint, totalUBIRef?: bigint): {
  data: ProtocolStats[]
  isLoading: boolean
  error: Error | null
} {
  const result = useReadContract({
    address: TRACKER,
    abi: UBIRevenueTrackerABI,
    functionName: 'getAllProtocols',
    query: { refetchInterval: 15_000 },
  })

  const data = useMemo(() => {
    if (!result.data) return []
    const raw = result.data as any[]
    const tf = totalFeesRef ?? 1n
    const tu = totalUBIRef ?? 1n
    return raw.map((p: any) => ({
      name: p.name as string,
      category: p.category as string,
      feeSource: p.feeSource as string,
      totalFees: p.totalFees as bigint,
      ubiContribution: p.ubiContribution as bigint,
      txCount: p.txCount as bigint,
      lastUpdateBlock: p.lastUpdateBlock as bigint,
      active: p.active as boolean,
      totalFeesFormatted: formatGD(p.totalFees as bigint),
      ubiFormatted: formatGD(p.ubiContribution as bigint),
      feeShare: tf > 0n ? Number(((p.totalFees as bigint) * 10000n) / tf) / 100 : 0,
      ubiShare: tu > 0n ? Number(((p.ubiContribution as bigint) * 10000n) / tu) / 100 : 0,
    }))
  }, [result.data, totalFeesRef, totalUBIRef])

  return { data, isLoading: result.isLoading, error: result.error as Error | null }
}

export function useSnapshots(count: number = 30): {
  data: Snapshot[]
  isLoading: boolean
  error: Error | null
} {
  const result = useReadContract({
    address: TRACKER,
    abi: UBIRevenueTrackerABI,
    functionName: 'getSnapshots',
    args: [BigInt(count)],
    query: { refetchInterval: 60_000 },
  })

  const data = useMemo(() => {
    if (!result.data) return []
    const raw = result.data as any[]
    return raw.map((s: any) => ({
      timestamp: s.timestamp as bigint,
      totalUBI: s.totalUBI as bigint,
      totalFees: s.totalFees as bigint,
      protocolCount: s.protocolCount as bigint,
      date: new Date(Number(s.timestamp) * 1000).toLocaleDateString(),
      totalUBIFormatted: formatGD(s.totalUBI as bigint),
      totalFeesFormatted: formatGD(s.totalFees as bigint),
    }))
  }, [result.data])

  return { data, isLoading: result.isLoading, error: result.error as Error | null }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGD(wei: bigint): string {
  const num = Number(formatEther(wei))
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toFixed(2)
}
