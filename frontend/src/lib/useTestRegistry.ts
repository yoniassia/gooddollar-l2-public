'use client'

/**
 * useTestRegistry — reads QA test results from TestRegistry contract on-chain.
 *
 * TestRegistry (chain 42069): 0x12bcb546bc60ff39f1adfc7ce4605d5bd6a6a876
 *
 * Exposes:
 *   useTestResultCount()     — total number of logged test results
 *   useTestResults(n)        — latest N results (paginated from end)
 *   useContractCoverage()    — per-contract pass/fail stats + coverage gaps
 *   useTesterActivity()      — per-tester result counts + last-seen timestamp
 */

import { useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { TestRegistryABI } from './abi'
import { CONTRACTS } from './chain'

const REGISTRY = CONTRACTS.TestRegistry

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TestResult {
  id: number
  tester: `0x${string}`
  contractTested: `0x${string}`
  functionSelector: `0x${string}`
  success: boolean
  gasUsed: number
  timestamp: number
  note: string
}

export interface ContractStats {
  address: `0x${string}`
  name: string
  total: number
  passed: number
  failed: number
  passRate: number
  lastTested: number
  avgGasUsed: number
}

export interface TesterStats {
  address: `0x${string}`
  total: number
  passed: number
  failed: number
  passRate: number
  lastSeen: number
}

// ─── Known contract name map (devnet addresses) ───────────────────────────────

const CONTRACT_NAMES: Record<string, string> = {
  '0x5fbdb2315678afecb367f032d93f642f64180aa3': 'GoodDollarToken',
  '0xc7cdb7a2e5dda1b7a0e792fe1ef08ed20a6f56d4': 'MarketFactory',
  '0x28f057dc79e3cb77b2bbf4358d7a690cfe21b2d5': 'ConditionalTokens',
  '0x322813fd9a801c5507c9de605d63cea4f2ce6c44': 'GoodLendPool',
  '0x9a9f2ccfde556a7e9ff0848998aa4a0cfd8863ae': 'GoodLendPriceOracle',
  '0xa513e6e4b8f2a923d98304ec87f64353c4d5c853': 'PerpEngine',
  '0x5fc8d32690cc91d4c39d9d3abcbd16989f875707': 'MarginVault',
  '0x0165878a594ca255338adfa4d48449f69242eb8f': 'PriceOracle',
  '0xdc64a140aa3e981100a9beca4e685f962f0cf6c9': 'FundingRate',
  '0xb7f8bc63bbcad18155201308c8f3540b07f84f5e': 'CollateralVault',
  '0x610178da211fef7d417bc0e6fed39f05609ad788': 'SyntheticAssetFactory',
  '0xac9fcba56e42d5960f813b9d0387f3d3bc003338': 'GoodSwapRouter',
  '0xc9a43158891282a2b1475592d5719c001986aaec': 'PoolManager',
  '0x0b306bf915c4d645ff596e518faf3f9669b97016': 'MockUSDC',
  '0x959922be3caee4b8cd9a407cc3ac1c251c2007b1': 'MockWETH',
  '0xe039608e695d21ab11675ebba00261a0e750526c': 'VaultManager',
  '0x9d4454b023096f34b160d6b654540c56a1f81688': 'CollateralRegistry',
  '0x0e801d84fa97b50751dbf25036d067dcf18858bf': 'gUSD',
}

export function contractName(addr: string): string {
  return CONTRACT_NAMES[addr.toLowerCase()] ?? addr.slice(0, 6) + '…' + addr.slice(-4)
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useTestResultCount(): { count: number; isLoading: boolean } {
  const { data, isLoading } = useReadContract({
    address: REGISTRY,
    abi: TestRegistryABI,
    functionName: 'getResultCount',
    query: { refetchInterval: 30_000 },
  })
  return { count: Number((data as bigint | undefined) ?? 0n), isLoading }
}

/** Fetch the latest `limit` results (reads from the tail of the array). */
export function useTestResults(limit = 100): { results: TestResult[]; isLoading: boolean } {
  const { count, isLoading: countLoading } = useTestResultCount()

  const from = Math.max(0, count - limit)
  const to = count > 0 ? count - 1 : 0

  const { data, isLoading } = useReadContract({
    address: REGISTRY,
    abi: TestRegistryABI,
    functionName: 'getResults',
    args: [BigInt(from), BigInt(to)],
    query: { enabled: count > 0, refetchInterval: 30_000 },
  })

  const results = useMemo<TestResult[]>(() => {
    const raw = data as Array<{
      tester: `0x${string}`
      contractTested: `0x${string}`
      functionSelector: `0x${string}`
      success: boolean
      gasUsed: bigint
      timestamp: bigint
      note: string
    }> | undefined

    if (!raw) return []
    return raw
      .map((r, i) => ({
        id: from + i,
        tester: r.tester,
        contractTested: r.contractTested,
        functionSelector: r.functionSelector,
        success: r.success,
        gasUsed: Number(r.gasUsed),
        timestamp: Number(r.timestamp),
        note: r.note,
      }))
      .reverse() // newest first
  }, [data, from])

  return { results, isLoading: countLoading || isLoading }
}

/** Derive per-contract coverage stats from a result set. */
export function useContractCoverage(results: TestResult[]): ContractStats[] {
  return useMemo<ContractStats[]>(() => {
    const map = new Map<string, { total: number; passed: number; gasSum: number; lastTested: number }>()
    for (const r of results) {
      const addr = r.contractTested.toLowerCase()
      const prev = map.get(addr) ?? { total: 0, passed: 0, gasSum: 0, lastTested: 0 }
      map.set(addr, {
        total: prev.total + 1,
        passed: prev.passed + (r.success ? 1 : 0),
        gasSum: prev.gasSum + r.gasUsed,
        lastTested: Math.max(prev.lastTested, r.timestamp),
      })
    }
    return Array.from(map.entries())
      .map(([addr, s]) => ({
        address: addr as `0x${string}`,
        name: contractName(addr),
        total: s.total,
        passed: s.passed,
        failed: s.total - s.passed,
        passRate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0,
        lastTested: s.lastTested,
        avgGasUsed: s.total > 0 ? Math.round(s.gasSum / s.total) : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [results])
}

/** Derive per-tester activity stats from a result set. */
export function useTesterActivity(results: TestResult[]): TesterStats[] {
  return useMemo<TesterStats[]>(() => {
    const map = new Map<string, { total: number; passed: number; lastSeen: number }>()
    for (const r of results) {
      const addr = r.tester.toLowerCase()
      const prev = map.get(addr) ?? { total: 0, passed: 0, lastSeen: 0 }
      map.set(addr, {
        total: prev.total + 1,
        passed: prev.passed + (r.success ? 1 : 0),
        lastSeen: Math.max(prev.lastSeen, r.timestamp),
      })
    }
    return Array.from(map.entries())
      .map(([addr, s]) => ({
        address: addr as `0x${string}`,
        total: s.total,
        passed: s.passed,
        failed: s.total - s.passed,
        passRate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0,
        lastSeen: s.lastSeen,
      }))
      .sort((a, b) => b.total - a.total)
  }, [results])
}

/** Results from the last 24 hours. */
export function useRecentResults(results: TestResult[]): TestResult[] {
  return useMemo(() => {
    const cutoff = Math.floor(Date.now() / 1000) - 86400
    return results.filter(r => r.timestamp >= cutoff)
  }, [results])
}
