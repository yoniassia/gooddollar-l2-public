'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { formatEther } from 'viem'
import {
  useProposalCount,
  useProposal,
  useProposalState,
  useTotalVotingPower,
  useTotalLocked,
  proposalStateName,
  proposalStateColor,
  proposalStateBg,
  formatVotes,
  type ProposalState,
} from '@/lib/useGovernance'
import { InfoBanner } from '@/components/InfoBanner'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProposalSummary {
  id: number
  description: string
  proposer: string
  state: ProposalState
  forVotes: bigint
  againstVotes: bigint
  abstainVotes: bigint
  startTime: number
  endTime: number
}

// ── Multi-Proposal Loader ─────────────────────────────────────────────────────

function useAllProposals(count: number): ProposalSummary[] {
  // Load up to 50 proposals (more than enough for devnet)
  const ids = useMemo(() => Array.from({ length: Math.min(count, 50) }, (_, i) => i + 1), [count])

  const p1 = useProposal(ids[0] ?? 0)
  const p2 = useProposal(ids[1] ?? 0)
  const p3 = useProposal(ids[2] ?? 0)
  const p4 = useProposal(ids[3] ?? 0)
  const p5 = useProposal(ids[4] ?? 0)
  const p6 = useProposal(ids[5] ?? 0)
  const p7 = useProposal(ids[6] ?? 0)
  const p8 = useProposal(ids[7] ?? 0)
  const p9 = useProposal(ids[8] ?? 0)
  const p10 = useProposal(ids[9] ?? 0)

  const s1 = useProposalState(ids[0] ?? 0)
  const s2 = useProposalState(ids[1] ?? 0)
  const s3 = useProposalState(ids[2] ?? 0)
  const s4 = useProposalState(ids[3] ?? 0)
  const s5 = useProposalState(ids[4] ?? 0)
  const s6 = useProposalState(ids[5] ?? 0)
  const s7 = useProposalState(ids[6] ?? 0)
  const s8 = useProposalState(ids[7] ?? 0)
  const s9 = useProposalState(ids[8] ?? 0)
  const s10 = useProposalState(ids[9] ?? 0)

  return useMemo(() => {
    const proposals = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10]
    const states = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10]

    const result: ProposalSummary[] = []
    for (let i = 0; i < count && i < 10; i++) {
      const p = proposals[i]?.data as any
      const s = states[i]?.data
      if (!p) continue
      result.push({
        id: i + 1,
        description: p.description || `Proposal #${i + 1}`,
        proposer: p.proposer as string,
        state: proposalStateName(Number(s ?? 0)),
        forVotes: (p.forVotes ?? 0n) as bigint,
        againstVotes: (p.againstVotes ?? 0n) as bigint,
        abstainVotes: (p.abstainVotes ?? 0n) as bigint,
        startTime: Number(p.startTime ?? 0),
        endTime: Number(p.endTime ?? 0),
      })
    }
    return result
  }, [count, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10])
}

// ── Stats Cards ───────────────────────────────────────────────────────────────

function StatCard({ label, value, subtext, color = 'text-white' }: {
  label: string; value: string; subtext?: string; color?: string
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
    </div>
  )
}

// ── Proposal State Distribution ───────────────────────────────────────────────

function StateDistribution({ proposals }: { proposals: ProposalSummary[] }) {
  const distribution = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of proposals) {
      counts[p.state] = (counts[p.state] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [proposals])

  const total = proposals.length

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-400 mb-4">Proposal Status Distribution</h3>
      {distribution.length === 0 ? (
        <p className="text-gray-500 text-sm">No proposals yet</p>
      ) : (
        <div className="space-y-3">
          {distribution.map(([state, count]) => {
            const pct = total > 0 ? (count / total) * 100 : 0
            return (
              <div key={state}>
                <div className="flex justify-between text-sm mb-1">
                  <span className={proposalStateColor(state as ProposalState)}>{state}</span>
                  <span className="text-gray-400">{count} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stateBarColor(state as ProposalState)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function stateBarColor(state: ProposalState): string {
  switch (state) {
    case 'Active': return 'bg-blue-500'
    case 'Succeeded': case 'Queued': return 'bg-green-500'
    case 'Executed': return 'bg-emerald-500'
    case 'Defeated': case 'Canceled': case 'Expired': return 'bg-red-500'
    default: return 'bg-yellow-500'
  }
}

// ── Voting Activity Table ─────────────────────────────────────────────────────

function VotingActivityTable({ proposals }: { proposals: ProposalSummary[] }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-400 mb-4">Voting Activity</h3>
      {proposals.length === 0 ? (
        <p className="text-gray-500 text-sm">No proposals to analyze</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
                <th className="text-left py-2 pr-3">#</th>
                <th className="text-left py-2 pr-3">Title</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-right py-2 pr-3">For</th>
                <th className="text-right py-2 pr-3">Against</th>
                <th className="text-right py-2 pr-3">Abstain</th>
                <th className="text-right py-2">Participation</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map(p => {
                const total = p.forVotes + p.againstVotes + p.abstainVotes
                const forPct = total > 0n ? Number(p.forVotes * 100n / total) : 0
                return (
                  <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-3 pr-3 text-gray-400">{p.id}</td>
                    <td className="py-3 pr-3 text-white max-w-[200px] truncate">{p.description}</td>
                    <td className="py-3 pr-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${proposalStateBg(p.state)} ${proposalStateColor(p.state)}`}>
                        {p.state}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right text-green-400">{formatVotes(p.forVotes)}</td>
                    <td className="py-3 pr-3 text-right text-red-400">{formatVotes(p.againstVotes)}</td>
                    <td className="py-3 pr-3 text-right text-gray-400">{formatVotes(p.abstainVotes)}</td>
                    <td className="py-3 text-right text-white">{formatVotes(total)} veG$</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Vote Composition Chart (CSS-only bar chart) ───────────────────────────────

function VoteCompositionChart({ proposals }: { proposals: ProposalSummary[] }) {
  const data = useMemo(() => {
    return proposals.map(p => {
      const total = p.forVotes + p.againstVotes + p.abstainVotes
      return {
        id: p.id,
        forPct: total > 0n ? Number(p.forVotes * 100n / total) : 0,
        againstPct: total > 0n ? Number(p.againstVotes * 100n / total) : 0,
        abstainPct: total > 0n ? Number(p.abstainVotes * 100n / total) : 0,
        total,
      }
    })
  }, [proposals])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-400 mb-4">Vote Composition by Proposal</h3>
      {data.length === 0 ? (
        <p className="text-gray-500 text-sm">No proposals yet</p>
      ) : (
        <div className="space-y-3">
          {data.map(d => (
            <div key={d.id}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Proposal #{d.id}</span>
                <span className="text-gray-500">{formatVotes(d.total)} total</span>
              </div>
              <div className="h-6 bg-gray-800 rounded-full overflow-hidden flex">
                {d.forPct > 0 && (
                  <div
                    className="bg-green-500 h-full flex items-center justify-center text-[10px] text-white font-medium"
                    style={{ width: `${d.forPct}%` }}
                  >
                    {d.forPct > 10 ? `${d.forPct}%` : ''}
                  </div>
                )}
                {d.againstPct > 0 && (
                  <div
                    className="bg-red-500 h-full flex items-center justify-center text-[10px] text-white font-medium"
                    style={{ width: `${d.againstPct}%` }}
                  >
                    {d.againstPct > 10 ? `${d.againstPct}%` : ''}
                  </div>
                )}
                {d.abstainPct > 0 && (
                  <div
                    className="bg-gray-600 h-full flex items-center justify-center text-[10px] text-white font-medium"
                    style={{ width: `${d.abstainPct}%` }}
                  >
                    {d.abstainPct > 10 ? `${d.abstainPct}%` : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Legend */}
          <div className="flex gap-4 mt-2 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded-full inline-block" /> For</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-full inline-block" /> Against</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-600 rounded-full inline-block" /> Abstain</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Top Proposers ─────────────────────────────────────────────────────────────

function TopProposers({ proposals }: { proposals: ProposalSummary[] }) {
  const proposers = useMemo(() => {
    const counts: Record<string, { count: number; passed: number }> = {}
    for (const p of proposals) {
      const addr = p.proposer
      if (!counts[addr]) counts[addr] = { count: 0, passed: 0 }
      counts[addr].count++
      if (['Succeeded', 'Queued', 'Executed'].includes(p.state)) {
        counts[addr].passed++
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
  }, [proposals])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-400 mb-4">Top Proposers</h3>
      {proposers.length === 0 ? (
        <p className="text-gray-500 text-sm">No proposals yet</p>
      ) : (
        <div className="space-y-2">
          {proposers.map(([addr, stats]) => (
            <div key={addr} className="flex items-center justify-between py-2 border-b border-gray-800/50">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs text-white font-bold">
                  {addr.slice(2, 4).toUpperCase()}
                </span>
                <span className="text-white text-sm font-mono">
                  {addr.slice(0, 8)}…{addr.slice(-6)}
                </span>
              </div>
              <div className="flex gap-3 text-sm">
                <span className="text-gray-400">{stats.count} proposals</span>
                <span className="text-green-400">{stats.passed} passed</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Governance Health Score ───────────────────────────────────────────────────

function GovernanceHealth({ proposals, totalLocked, totalPower }: {
  proposals: ProposalSummary[]
  totalLocked: bigint | undefined
  totalPower: bigint | undefined
}) {
  const metrics = useMemo(() => {
    const total = proposals.length
    const executed = proposals.filter(p => p.state === 'Executed').length
    const defeated = proposals.filter(p => ['Defeated', 'Canceled', 'Expired'].includes(p.state)).length
    const active = proposals.filter(p => p.state === 'Active').length

    const avgParticipation = total > 0
      ? proposals.reduce((sum, p) => sum + Number(p.forVotes + p.againstVotes + p.abstainVotes), 0) / total
      : 0

    const passRate = total > 0 ? ((total - defeated) / total * 100) : 0

    return { total, executed, defeated, active, avgParticipation, passRate }
  }, [proposals])

  const lockedNum = totalLocked ? Number(formatEther(totalLocked)) : 0
  const powerNum = totalPower ? Number(formatEther(totalPower)) : 0

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-400 mb-4">📊 Governance Health</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-500">Pass Rate</p>
          <p className="text-xl font-bold text-green-400">{metrics.passRate.toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Executed</p>
          <p className="text-xl font-bold text-emerald-400">{metrics.executed}/{metrics.total}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Active Now</p>
          <p className="text-xl font-bold text-blue-400">{metrics.active}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total Locked</p>
          <p className="text-xl font-bold text-white">{lockedNum >= 1000 ? `${(lockedNum / 1000).toFixed(1)}K` : lockedNum.toFixed(0)} G$</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Effective Power</p>
          <p className="text-xl font-bold text-purple-400">{powerNum >= 1000 ? `${(powerNum / 1000).toFixed(1)}K` : powerNum.toFixed(0)} veG$</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Avg Participation</p>
          <p className="text-xl font-bold text-yellow-400">
            {metrics.avgParticipation >= 1e18 ? formatVotes(BigInt(Math.floor(metrics.avgParticipation))) : '0'} veG$
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Proposal Timeline ─────────────────────────────────────────────────────────

function ProposalTimeline({ proposals }: { proposals: ProposalSummary[] }) {
  const sorted = useMemo(() =>
    [...proposals].sort((a, b) => b.startTime - a.startTime),
    [proposals]
  )

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-400 mb-4">📅 Proposal Timeline</h3>
      {sorted.length === 0 ? (
        <p className="text-gray-500 text-sm">No proposals yet</p>
      ) : (
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-800" />

          {sorted.map((p, i) => {
            const date = p.startTime > 0
              ? new Date(p.startTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'Pending'
            return (
              <div key={p.id} className="relative mb-6 last:mb-0">
                {/* Dot */}
                <div className={`absolute -left-4 w-3 h-3 rounded-full border-2 border-gray-900 ${dotColor(p.state)}`} />
                <div className="ml-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{date}</span>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${proposalStateBg(p.state)} ${proposalStateColor(p.state)}`}>
                      {p.state}
                    </span>
                  </div>
                  <p className="text-white text-sm mt-1">Proposal #{p.id}: {p.description}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    by {p.proposer.slice(0, 8)}… • {formatVotes(p.forVotes + p.againstVotes + p.abstainVotes)} votes cast
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function dotColor(state: ProposalState): string {
  switch (state) {
    case 'Active': return 'bg-blue-500'
    case 'Succeeded': case 'Queued': return 'bg-green-500'
    case 'Executed': return 'bg-emerald-500'
    case 'Defeated': case 'Canceled': case 'Expired': return 'bg-red-500'
    default: return 'bg-yellow-500'
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GovernanceAnalyticsPage() {
  const { data: count } = useProposalCount()
  const proposalCount = Number(count ?? 0)
  const { data: totalPower } = useTotalVotingPower()
  const { data: totalLocked } = useTotalLocked()

  const proposals = useAllProposals(proposalCount)

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <InfoBanner
        title="Governance Analytics"
        description="Track voting activity, proposal outcomes, and veG$ participation across GoodDAO."
        storageKey="governance-analytics-banner"
      />

      {/* Navigation back to governance */}
      <div className="flex items-center gap-4">
        <Link
          href="/governance"
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          ← Back to Governance
        </Link>
        <h1 className="text-2xl font-bold text-white">📊 Governance Analytics</h1>
      </div>

      {/* Top-level stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Proposals"
          value={String(proposalCount)}
          subtext="All-time"
        />
        <StatCard
          label="Total Locked"
          value={totalLocked ? `${formatVotes(totalLocked as bigint)} G$` : '—'}
          subtext="In veG$ contract"
          color="text-blue-400"
        />
        <StatCard
          label="Voting Power"
          value={totalPower ? `${formatVotes(totalPower as bigint)} veG$` : '—'}
          subtext="Time-weighted"
          color="text-purple-400"
        />
        <StatCard
          label="Pass Rate"
          value={proposals.length > 0
            ? `${Math.round((proposals.filter(p => !['Defeated', 'Canceled', 'Expired'].includes(p.state)).length / proposals.length) * 100)}%`
            : '—'}
          subtext="Succeeded / Total"
          color="text-green-400"
        />
      </div>

      {/* Governance Health */}
      <GovernanceHealth
        proposals={proposals}
        totalLocked={totalLocked as bigint | undefined}
        totalPower={totalPower as bigint | undefined}
      />

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StateDistribution proposals={proposals} />
        <VoteCompositionChart proposals={proposals} />
      </div>

      {/* Timeline */}
      <ProposalTimeline proposals={proposals} />

      {/* Voting Activity Table */}
      <VotingActivityTable proposals={proposals} />

      {/* Top Proposers */}
      <TopProposers proposals={proposals} />

      {/* Governance Parameters Reference */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Governance Parameters</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><span className="text-gray-500">Proposal Threshold:</span> <span className="text-white">1% veG$</span></div>
          <div><span className="text-gray-500">Quorum:</span> <span className="text-white">10% veG$</span></div>
          <div><span className="text-gray-500">Voting Period:</span> <span className="text-white">3 days</span></div>
          <div><span className="text-gray-500">Voting Delay:</span> <span className="text-white">1 day</span></div>
          <div><span className="text-gray-500">Timelock:</span> <span className="text-white">1 day</span></div>
          <div><span className="text-gray-500">Max Lock:</span> <span className="text-white">4 years</span></div>
          <div><span className="text-gray-500">Early Unlock Penalty:</span> <span className="text-white">30%</span></div>
          <div><span className="text-gray-500">Penalty → UBI:</span> <span className="text-white">33%</span></div>
          <div><span className="text-gray-500">Execution Window:</span> <span className="text-white">7 days</span></div>
        </div>
      </div>
    </div>
  )
}
