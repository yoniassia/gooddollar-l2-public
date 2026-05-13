'use client'

/**
 * UBI Impact Dashboard — /ubi-impact
 *
 * Shows how every protocol on GoodDollar L2 contributes to UBI funding.
 * Reads on-chain data from UBIRevenueTracker (GOO-226).
 *
 * Sections:
 *   1. Hero stats — total UBI funded, total fees, UBI %, active protocols
 *   2. Protocol breakdown — per-protocol fee cards with bar chart
 *   3. UBI flow visualization — Sankey-style fee → UBI flow
 *   4. Historical chart — daily snapshots over time
 */

import { useMemo } from 'react'
import { formatEther } from 'viem'
import {
  useDashboardData,
  useAllProtocols,
  useSnapshots,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  type ProtocolStats,
} from '@/lib/useUBIImpact'
import { InfoBanner } from '@/components/InfoBanner'
import { CONTRACTS, DEVNET_EXPLORER_URL, DEVNET_CHAIN_ID } from '@/lib/devnet'

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-1">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className={`text-2xl font-bold ${accent ?? 'text-white'}`}>{value}</span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
    </div>
  )
}

// ── Protocol Card ─────────────────────────────────────────────────────────────

function ProtocolCard({ protocol }: { protocol: ProtocolStats }) {
  const color = CATEGORY_COLORS[protocol.category] ?? '#6b7280'
  const icon = CATEGORY_ICONS[protocol.category] ?? '⚡'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-white">{protocol.name}</h3>
          <span className="text-xs text-zinc-500 uppercase tracking-wide">{protocol.category}</span>
        </div>
        {protocol.active ? (
          <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Active</span>
        ) : (
          <span className="text-xs bg-zinc-700/50 text-zinc-500 px-2 py-0.5 rounded-full">Inactive</span>
        )}
      </div>

      {/* Fee bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Total Fees</span>
          <span className="text-white font-mono">{protocol.totalFeesFormatted} G$</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(protocol.feeShare, 100)}%`, backgroundColor: color }}
          />
        </div>
        <div className="flex justify-between text-xs text-zinc-500">
          <span>{protocol.feeShare.toFixed(1)}% of total</span>
          <span>{Number(protocol.txCount).toLocaleString()} txs</span>
        </div>
      </div>

      {/* UBI contribution */}
      <div className="flex justify-between items-center pt-2 border-t border-zinc-800">
        <span className="text-sm text-zinc-400">UBI Funded</span>
        <span className="text-sm font-mono text-green-400">{protocol.ubiFormatted} G$</span>
      </div>
    </div>
  )
}

// ── Fee Flow Visualization ────────────────────────────────────────────────────

function FeeFlowViz({ protocols, totalFees, totalUBI }: {
  protocols: ProtocolStats[]
  totalFees: bigint
  totalUBI: bigint
}) {
  const activeProtocols = protocols.filter(p => p.active && p.totalFees > 0n)
  if (activeProtocols.length === 0) return null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">💧 Fee → UBI Flow</h2>
      <p className="text-sm text-zinc-400 mb-6">
        Every protocol fee is split: 33% funds Universal Basic Income for verified humans worldwide.
      </p>

      <div className="space-y-3">
        {activeProtocols
          .sort((a, b) => (a.totalFees > b.totalFees ? -1 : 1))
          .map((p, i) => {
            const color = CATEGORY_COLORS[p.category] ?? '#6b7280'
            const icon = CATEGORY_ICONS[p.category] ?? '⚡'
            const feeWidth = totalFees > 0n ? Number((p.totalFees * 100n) / totalFees) : 0
            const ubiWidth = totalUBI > 0n ? Number((p.ubiContribution * 100n) / totalUBI) : 0

            return (
              <div key={i} className="flex items-center gap-3">
                {/* Protocol label */}
                <div className="w-28 flex items-center gap-1 shrink-0">
                  <span className="text-sm">{icon}</span>
                  <span className="text-xs text-zinc-300 truncate">{p.name}</span>
                </div>

                {/* Fee bar */}
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-5 bg-zinc-800 rounded relative overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-500 opacity-80"
                      style={{ width: `${Math.max(feeWidth, 2)}%`, backgroundColor: color }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/70 font-mono">
                      {p.totalFeesFormatted}
                    </span>
                  </div>

                  {/* Arrow */}
                  <span className="text-zinc-600 text-xs">→</span>

                  {/* UBI bar */}
                  <div className="w-24 h-5 bg-zinc-800 rounded relative overflow-hidden">
                    <div
                      className="h-full rounded bg-green-500/60 transition-all duration-500"
                      style={{ width: `${Math.max(ubiWidth, 5)}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-green-300/80 font-mono">
                      {p.ubiFormatted}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
      </div>

      {/* Totals */}
      <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-between items-center">
        <div>
          <span className="text-sm text-zinc-400">Total Protocol Fees</span>
          <span className="text-sm font-mono text-white ml-2">
            {formatGD(totalFees)} G$
          </span>
        </div>
        <div className="text-right">
          <span className="text-sm text-zinc-400">Total UBI Funded</span>
          <span className="text-sm font-mono text-green-400 ml-2">
            {formatGD(totalUBI)} G$
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Historical Chart (text-based) ─────────────────────────────────────────────

function HistorySection() {
  const { data: snapshots, isLoading } = useSnapshots(30)

  if (isLoading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">📅 Historical Snapshots</h2>
        <div className="animate-pulse h-40 bg-zinc-800 rounded" />
      </div>
    )
  }

  if (snapshots.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">📅 Historical Snapshots</h2>
        <p className="text-zinc-500 text-sm">No snapshots yet. The revenue keeper will start recording daily.</p>
      </div>
    )
  }

  // Simple ASCII-ish bar chart for snapshots
  const maxUBI = snapshots.reduce((max, s) => s.totalUBI > max ? s.totalUBI : max, 0n)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">📅 Historical Snapshots</h2>
      <div className="space-y-2">
        {snapshots.map((s, i) => {
          const pct = maxUBI > 0n ? Number((s.totalUBI * 100n) / maxUBI) : 0
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 w-24 shrink-0 font-mono">{s.date}</span>
              <div className="flex-1 h-4 bg-zinc-800 rounded overflow-hidden">
                <div
                  className="h-full bg-green-500/50 rounded transition-all"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400 w-20 text-right font-mono">{s.totalUBIFormatted} G$</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UBIImpactPage() {
  const { data: dashboard, isLoading: dashLoading } = useDashboardData()
  const { data: protocols, isLoading: protLoading } = useAllProtocols(
    dashboard?.totalFees,
    dashboard?.totalUBI
  )

  const isLoading = dashLoading || protLoading

  return (
    <div className="w-full max-w-5xl mx-auto px-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">🌍 UBI Impact Dashboard</h1>
        <p className="text-zinc-400 mt-2">
          Every transaction on GoodDollar L2 funds Universal Basic Income. Here&apos;s the proof.
        </p>
      </div>

      <InfoBanner
        storageKey="ubi-impact-info"
        title="UBI Fee Routing"
        description="GoodDollar L2 routes 33% of all protocol fees to the UBI pool. This dashboard tracks every protocol's contribution in real-time, directly from the UBIRevenueTracker contract."
      />

      {/* Hero Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : dashboard ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total UBI Funded"
            value={`${dashboard.totalUBIFormatted} G$`}
            sub="From all protocol fees"
            accent="text-green-400"
          />
          <StatCard
            label="Total Fees Collected"
            value={`${dashboard.totalFeesFormatted} G$`}
            sub={`${dashboard.ubiPercentage.toFixed(1)}% → UBI`}
          />
          <StatCard
            label="Fee-Generating Txs"
            value={Number(dashboard.totalTx).toLocaleString()}
            sub={`Across ${Number(dashboard.activeProtocols)} protocols`}
          />
          <StatCard
            label="Active Protocols"
            value={`${Number(dashboard.activeProtocols)} / ${Number(dashboard.protocolCount)}`}
            sub="Contributing to UBI"
            accent="text-blue-400"
          />
        </div>
      ) : (
        <div className="text-zinc-500 text-center py-8">
          Unable to load dashboard data. Is the devnet running?
        </div>
      )}

      {/* UBI Splitter Stats */}
      {dashboard && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            label="UBIFeeSplitter — Total Collected"
            value={`${dashboard.splitterFeesFormatted} G$`}
            sub="On-chain fee splitter contract"
          />
          <StatCard
            label="UBIFeeSplitter — Sent to UBI"
            value={`${dashboard.splitterUBIFormatted} G$`}
            sub="Directly to UBI pool"
            accent="text-green-400"
          />
        </div>
      )}

      {/* Fee Flow Visualization */}
      {dashboard && protocols.length > 0 && (
        <FeeFlowViz
          protocols={protocols}
          totalFees={dashboard.totalFees}
          totalUBI={dashboard.totalUBI}
        />
      )}

      {/* Protocol Breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">📋 Protocol Breakdown</h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-pulse h-40" />
            ))}
          </div>
        ) : protocols.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {protocols
              .filter(p => p.active)
              .sort((a, b) => (a.totalFees > b.totalFees ? -1 : 1))
              .map((p, i) => (
                <ProtocolCard key={i} protocol={p} />
              ))}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">No protocols registered yet.</p>
        )}
      </div>

      {/* Historical Snapshots */}
      <HistorySection />

      {/* Contract Info */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-zinc-400 mb-2">📝 Contract Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-zinc-500 font-mono">
          <div>UBIRevenueTracker: <a href={`${DEVNET_EXPLORER_URL}/address/${CONTRACTS.UBIRevenueTracker}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{CONTRACTS.UBIRevenueTracker.slice(0, 6)}...{CONTRACTS.UBIRevenueTracker.slice(-3)}</a></div>
          <div>UBIFeeSplitter: <a href={`${DEVNET_EXPLORER_URL}/address/${CONTRACTS.UBIFeeSplitter}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{CONTRACTS.UBIFeeSplitter.slice(0, 6)}...{CONTRACTS.UBIFeeSplitter.slice(-3)}</a></div>
          <div>Chain: GoodDollar L2 (ID {DEVNET_CHAIN_ID})</div>
          <div>Data: Refreshes every 15s</div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGD(wei: bigint): string {
  const num = Number(formatEther(wei))
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toFixed(2)
}
