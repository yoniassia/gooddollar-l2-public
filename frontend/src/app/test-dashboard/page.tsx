'use client'

import { useState, useMemo } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import Link from 'next/link'
import {
  useTestResults,
  useContractCoverage,
  useTesterActivity,
  useRecentResults,
  contractName,
  type TestResult,
  type ContractStats,
} from '@/lib/useTestRegistry'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  if (ts === 0) return '—'
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

function formatGas(gas: number): string {
  if (gas === 0) return '—'
  if (gas >= 1_000_000) return (gas / 1_000_000).toFixed(2) + 'M'
  if (gas >= 1_000) return (gas / 1_000).toFixed(1) + 'k'
  return gas.toString()
}

// ─── Stats Cards ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-dark-50 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${color ?? 'text-white'}`}>{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  )
}

// ─── Pass Rate Bar ────────────────────────────────────────────────────────────

function PassRateBar({ rate, size = 'md' }: { rate: number; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'h-1' : 'h-1.5'
  const color = rate >= 90 ? 'bg-goodgreen' : rate >= 70 ? 'bg-yellow-400' : 'bg-red-500'
  return (
    <div className={`w-full bg-dark-100 rounded-full ${h} overflow-hidden`}>
      <div className={`${h} rounded-full ${color} transition-all`} style={{ width: `${rate}%` }} />
    </div>
  )
}

// ─── Contract Coverage Table ──────────────────────────────────────────────────

function CoverageTable({ stats }: { stats: ContractStats[] }) {
  if (stats.length === 0) {
    return <p className="text-gray-500 text-sm py-4 text-center">No coverage data yet.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-dark-50">
            <th className="text-left py-2 pr-4">Contract</th>
            <th className="text-right py-2 px-2">Tests</th>
            <th className="text-right py-2 px-2">Pass</th>
            <th className="text-right py-2 px-2">Fail</th>
            <th className="text-left py-2 px-4 min-w-[120px]">Pass Rate</th>
            <th className="text-right py-2 px-2">Avg Gas</th>
            <th className="text-right py-2 pl-2">Last Tested</th>
          </tr>
        </thead>
        <tbody>
          {stats.map(s => (
            <tr key={s.address} className="border-b border-dark-50/40 hover:bg-dark-50/30 transition-colors">
              <td className="py-2 pr-4">
                <div className="font-medium text-white">{s.name}</div>
                <div className="text-xs text-gray-500 font-mono">{shortAddr(s.address)}</div>
              </td>
              <td className="text-right py-2 px-2 text-gray-300">{s.total}</td>
              <td className="text-right py-2 px-2 text-goodgreen">{s.passed}</td>
              <td className={`text-right py-2 px-2 ${s.failed > 0 ? 'text-red-400' : 'text-gray-500'}`}>{s.failed}</td>
              <td className="py-2 px-4">
                <div className="flex items-center gap-2">
                  <PassRateBar rate={s.passRate} size="sm" />
                  <span className={`text-xs font-medium w-8 text-right ${s.passRate >= 90 ? 'text-goodgreen' : s.passRate >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {s.passRate}%
                  </span>
                </div>
              </td>
              <td className="text-right py-2 px-2 text-gray-400 font-mono text-xs">{formatGas(s.avgGasUsed)}</td>
              <td className="text-right py-2 pl-2 text-gray-500 text-xs">{timeAgo(s.lastTested)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

function ActivityLog({ results }: { results: TestResult[] }) {
  if (results.length === 0) {
    return <p className="text-gray-500 text-sm py-4 text-center">No test results logged yet.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-dark-50">
            <th className="text-left py-2 pr-3">Status</th>
            <th className="text-left py-2 pr-4">Contract</th>
            <th className="text-left py-2 pr-4 hidden sm:table-cell">Tester</th>
            <th className="text-left py-2 pr-2 hidden md:table-cell">Selector</th>
            <th className="text-right py-2 px-2 hidden lg:table-cell">Gas</th>
            <th className="text-right py-2 pl-2">When</th>
          </tr>
        </thead>
        <tbody>
          {results.slice(0, 50).map(r => (
            <tr key={r.id} className="border-b border-dark-50/30 hover:bg-dark-50/20 transition-colors">
              <td className="py-1.5 pr-3">
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${r.success ? 'bg-goodgreen/10 text-goodgreen' : 'bg-red-500/10 text-red-400'}`}>
                  {r.success ? '✓ Pass' : '✗ Fail'}
                </span>
              </td>
              <td className="py-1.5 pr-4">
                <div className="font-medium text-white text-xs">{contractName(r.contractTested)}</div>
                {r.note && <div className="text-xs text-gray-500 truncate max-w-[180px]" title={r.note}>{r.note}</div>}
              </td>
              <td className="py-1.5 pr-4 hidden sm:table-cell">
                <span className="font-mono text-xs text-gray-400">{shortAddr(r.tester)}</span>
              </td>
              <td className="py-1.5 pr-2 hidden md:table-cell">
                <span className="font-mono text-xs text-gray-500">{r.functionSelector.slice(0, 10)}</span>
              </td>
              <td className="text-right py-1.5 px-2 hidden lg:table-cell">
                <span className="text-xs text-gray-400 font-mono">{formatGas(r.gasUsed)}</span>
              </td>
              <td className="text-right py-1.5 pl-2 text-gray-500 text-xs">{timeAgo(r.timestamp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Tester Panel ─────────────────────────────────────────────────────────────

function TesterPanel({ testerStats }: { testerStats: ReturnType<typeof useTesterActivity> }) {
  if (testerStats.length === 0) {
    return <p className="text-gray-500 text-sm py-4 text-center">No tester activity yet.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {testerStats.map(t => (
        <div key={t.address} className="flex items-center gap-3 p-3 bg-dark-50/50 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-dark-100 flex items-center justify-center text-xs font-mono text-gray-400 flex-shrink-0">
            {t.address.slice(2, 4).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-gray-300">{shortAddr(t.address)}</span>
              <span className="text-xs text-gray-500">{timeAgo(t.lastSeen)}</span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <PassRateBar rate={t.passRate} size="sm" />
              <span className={`text-xs font-medium w-8 text-right flex-shrink-0 ${t.passRate >= 90 ? 'text-goodgreen' : t.passRate >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                {t.passRate}%
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {t.total} tests · <span className="text-goodgreen">{t.passed} pass</span>{t.failed > 0 && <span className="text-red-400"> · {t.failed} fail</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Gas Trend (last 20 results) ─────────────────────────────────────────────

function GasTrend({ results }: { results: TestResult[] }) {
  const recent = useMemo(() => results.slice(0, 20).reverse(), [results])
  if (recent.length < 2) {
    return <p className="text-gray-500 text-sm py-4 text-center">Not enough data yet.</p>
  }
  const maxGas = Math.max(...recent.map(r => r.gasUsed))
  const h = 48

  return (
    <div className="flex items-end gap-0.5 h-16" aria-label="Gas usage trend">
      {recent.map((r, i) => {
        const barH = maxGas > 0 ? Math.max(2, Math.round((r.gasUsed / maxGas) * h)) : 2
        return (
          <div
            key={i}
            title={`${contractName(r.contractTested)}: ${r.gasUsed.toLocaleString()} gas`}
            className={`flex-1 rounded-t transition-all ${r.success ? 'bg-goodgreen/50 hover:bg-goodgreen/70' : 'bg-red-500/50 hover:bg-red-500/70'}`}
            style={{ height: `${barH}px` }}
          />
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'log'

export default function TestDashboardPage() {
  const [filterTester, setFilterTester] = useState<string>('')

  const { results, isLoading } = useTestResults(200)
  const recentResults = useRecentResults(results)
  const coverageStats = useContractCoverage(results)
  const testerStats = useTesterActivity(results)

  const displayResults = useMemo(() => {
    if (!filterTester) return results
    return results.filter(r => r.tester.toLowerCase().includes(filterTester.toLowerCase()))
  }, [results, filterTester])

  const totalPassed = results.filter(r => r.success).length
  const totalFailed = results.filter(r => !r.success).length
  const overallPassRate = results.length > 0 ? Math.round((totalPassed / results.length) * 100) : 0
  const recentPassed = recentResults.filter(r => r.success).length
  const recentFailed = recentResults.filter(r => !r.success).length
  const gaps = coverageStats.filter(s => s.total === 0)

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Test Coverage</h1>
          <p className="text-sm text-gray-400 mt-0.5">Live on-chain QA data from TestRegistry</p>
        </div>
        <Link href="/activity" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Activity
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Tests" value={results.length} sub={isLoading ? 'loading…' : 'all time'} />
        <StatCard
          label="Pass Rate"
          value={`${overallPassRate}%`}
          sub={`${totalPassed} pass / ${totalFailed} fail`}
          color={overallPassRate >= 90 ? 'text-goodgreen' : overallPassRate >= 70 ? 'text-yellow-400' : 'text-red-400'}
        />
        <StatCard label="Last 24h" value={recentResults.length} sub={`${recentPassed} pass · ${recentFailed} fail`} />
        <StatCard label="Testers" value={testerStats.length} sub={`${coverageStats.length} contracts hit`} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="flex gap-1 mb-4 bg-dark-50 p-1 rounded-lg w-fit">
          <TabsTrigger
            value="overview"
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors data-[state=active]:bg-dark-100 data-[state=active]:text-white data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-white data-[state=active]:shadow-none"
          >
            Coverage
          </TabsTrigger>
          <TabsTrigger
            value="log"
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors data-[state=active]:bg-dark-100 data-[state=active]:text-white data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-white data-[state=active]:shadow-none"
          >
            Activity Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          {/* Left: Coverage + Gas trend */}
          <div className="flex flex-col gap-4">
            <div className="bg-dark-50 rounded-xl p-4">
              <h2 className="text-sm font-medium text-gray-300 mb-3">Contract Coverage</h2>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-8 bg-dark-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <CoverageTable stats={coverageStats} />
              )}
            </div>

            <div className="bg-dark-50 rounded-xl p-4">
              <h2 className="text-sm font-medium text-gray-300 mb-3">Gas Usage Trend (last 20)</h2>
              {isLoading ? (
                <div className="h-16 bg-dark-100 rounded animate-pulse" />
              ) : (
                <GasTrend results={results} />
              )}
              <p className="text-xs text-gray-500 mt-2">Green = pass · Red = fail · Height = relative gas used</p>
            </div>
          </div>

          {/* Right: Testers */}
          <div className="bg-dark-50 rounded-xl p-4">
            <h2 className="text-sm font-medium text-gray-300 mb-3">Tester Agents</h2>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-dark-100 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <TesterPanel testerStats={testerStats} />
            )}

            {gaps.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-xs font-medium text-yellow-400 mb-1">Coverage Gaps</p>
                <p className="text-xs text-gray-400">{gaps.length} contract{gaps.length !== 1 ? 's' : ''} with no test transactions.</p>
              </div>
            )}
          </div>
        </div>
        </TabsContent>

        <TabsContent value="log" className="mt-0">
        <div className="bg-dark-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3 gap-3">
            <h2 className="text-sm font-medium text-gray-300">Activity Log</h2>
            <input
              type="text"
              placeholder="Filter by tester address…"
              value={filterTester}
              onChange={e => setFilterTester(e.target.value)}
              className="bg-dark-100 text-sm text-gray-300 placeholder-gray-600 border border-dark-50 rounded-lg px-3 py-1.5 focus:outline-none focus:border-goodgreen/50 w-52"
            />
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-8 bg-dark-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <ActivityLog results={displayResults} />
          )}
        </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
