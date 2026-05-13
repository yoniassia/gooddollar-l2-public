'use client'

import { useMemo } from 'react'
import { useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { AgentRegistryABI } from './AgentRegistryABI'
import { CONTRACTS } from './chain'

const REGISTRY = CONTRACTS.AgentRegistry

export interface AgentLeaderboardEntry {
  rank: number
  address: string
  name: string
  ubiContribution: string   // formatted ETH
  ubiContributionRaw: bigint
  volume: string             // formatted ETH
  volumeRaw: bigint
  trades: number
}

export interface DashboardStats {
  totalAgents: number
  totalTrades: number
  totalVolume: string
  totalUBI: string
}

export function useAgentDashboard(): DashboardStats {
  const { data } = useReadContract({
    address: REGISTRY,
    abi: AgentRegistryABI,
    functionName: 'getDashboardStats',
  })

  return useMemo(() => {
    if (!data) return { totalAgents: 0, totalTrades: 0, totalVolume: '0', totalUBI: '0' }
    const [agents, trades, volume, ubi] = data as [bigint, bigint, bigint, bigint]
    return {
      totalAgents: Number(agents),
      totalTrades: Number(trades),
      totalVolume: Number(formatEther(volume)).toLocaleString(undefined, { maximumFractionDigits: 2 }),
      totalUBI: Number(formatEther(ubi)).toLocaleString(undefined, { maximumFractionDigits: 4 }),
    }
  }, [data])
}

export function useTopAgents(count: number = 10): AgentLeaderboardEntry[] {
  const { data } = useReadContract({
    address: REGISTRY,
    abi: AgentRegistryABI,
    functionName: 'getTopAgents',
    args: [BigInt(count)],
  })

  return useMemo(() => {
    if (!data) return []
    const [addrs, names, ubis, volumes, trades] = data as [
      readonly string[], readonly string[], readonly bigint[], readonly bigint[], readonly bigint[]
    ]
    return addrs
      .map((addr, i) => ({
        rank: i + 1,
        address: addr,
        name: names[i] || 'Unknown',
        ubiContribution: Number(formatEther(ubis[i])).toLocaleString(undefined, { maximumFractionDigits: 4 }),
        ubiContributionRaw: ubis[i],
        volume: Number(formatEther(volumes[i])).toLocaleString(undefined, { maximumFractionDigits: 2 }),
        volumeRaw: volumes[i],
        trades: Number(trades[i]),
      }))
      .filter(e => e.address !== '0x0000000000000000000000000000000000000000')
  }, [data])
}
