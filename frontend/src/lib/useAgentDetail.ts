'use client'

import { useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatEther, type Address } from 'viem'
import { AgentRegistryABI } from './AgentRegistryABI'
import { CONTRACTS } from './chain'

const REGISTRY = CONTRACTS.AgentRegistry

const PROTOCOLS = ['swap', 'perps', 'predict', 'lend', 'stable', 'stocks', 'yield'] as const
export type Protocol = (typeof PROTOCOLS)[number]

export interface AgentProfile {
  name: string
  avatarURI: string
  strategy: string
  owner: string
  registeredAt: number
  active: boolean
}

export interface AgentStats {
  totalTrades: number
  totalVolume: string
  totalVolumeRaw: bigint
  totalFeesGenerated: string
  totalFeesRaw: bigint
  ubiContribution: string
  ubiContributionRaw: bigint
  totalPnL: string
  pnlPositive: boolean
  lastActiveAt: number
}

export interface ProtocolBreakdown {
  protocol: Protocol
  trades: number
  volume: string
  volumeRaw: bigint
  fees: string
  feesRaw: bigint
}

export function useAgentDetail(address: string | undefined) {
  const agentAddr = address as Address | undefined

  // Fetch profile + stats
  const { data: infoData, isLoading: infoLoading } = useReadContract({
    address: REGISTRY,
    abi: AgentRegistryABI,
    functionName: 'getAgentInfo',
    args: agentAddr ? [agentAddr] : undefined,
    query: { enabled: !!agentAddr },
  })

  // Fetch per-protocol breakdown (7 calls)
  const protocolCalls = useMemo(() => {
    if (!agentAddr) return []
    return PROTOCOLS.map((p) => ({
      address: REGISTRY as Address,
      abi: AgentRegistryABI,
      functionName: 'getAgentProtocolStats' as const,
      args: [agentAddr, p] as const,
    }))
  }, [agentAddr])

  const { data: protocolData, isLoading: protocolLoading } = useReadContracts({
    contracts: protocolCalls,
    query: { enabled: protocolCalls.length > 0 },
  })

  const profile = useMemo<AgentProfile | null>(() => {
    if (!infoData) return null
    const [p] = infoData as [any, any]
    return {
      name: p.name || 'Unknown Agent',
      avatarURI: p.avatarURI || '',
      strategy: p.strategy || '',
      owner: p.owner,
      registeredAt: Number(p.registeredAt),
      active: p.active,
    }
  }, [infoData])

  const stats = useMemo<AgentStats | null>(() => {
    if (!infoData) return null
    const [, s] = infoData as [any, any]
    return {
      totalTrades: Number(s.totalTrades),
      totalVolume: Number(formatEther(s.totalVolume)).toLocaleString(undefined, { maximumFractionDigits: 4 }),
      totalVolumeRaw: s.totalVolume,
      totalFeesGenerated: Number(formatEther(s.totalFeesGenerated)).toLocaleString(undefined, { maximumFractionDigits: 6 }),
      totalFeesRaw: s.totalFeesGenerated,
      ubiContribution: Number(formatEther(s.ubiContribution)).toLocaleString(undefined, { maximumFractionDigits: 6 }),
      ubiContributionRaw: s.ubiContribution,
      totalPnL: Number(formatEther(s.totalPnL)).toLocaleString(undefined, { maximumFractionDigits: 4 }),
      pnlPositive: s.pnlPositive,
      lastActiveAt: Number(s.lastActiveAt),
    }
  }, [infoData])

  const protocolBreakdown = useMemo<ProtocolBreakdown[]>(() => {
    if (!protocolData) return []
    return PROTOCOLS.map((protocol, i) => {
      const result = protocolData[i]
      if (!result || result.status !== 'success' || !result.result) {
        return { protocol, trades: 0, volume: '0', volumeRaw: 0n, fees: '0', feesRaw: 0n }
      }
      const d = result.result as { trades: bigint; volume: bigint; fees: bigint }
      return {
        protocol,
        trades: Number(d.trades),
        volume: Number(formatEther(d.volume)).toLocaleString(undefined, { maximumFractionDigits: 4 }),
        volumeRaw: d.volume,
        fees: Number(formatEther(d.fees)).toLocaleString(undefined, { maximumFractionDigits: 6 }),
        feesRaw: d.fees,
      }
    }).filter(p => p.trades > 0)
  }, [protocolData])

  return {
    profile,
    stats,
    protocolBreakdown,
    isLoading: infoLoading || protocolLoading,
    allProtocols: PROTOCOLS,
  }
}
