'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useAgentDetail, type Protocol } from '@/lib/useAgentDetail'

const PROTOCOL_META: Record<Protocol, { icon: string; label: string; color: string }> = {
  swap:    { icon: '🔄', label: 'Swaps',      color: 'from-blue-500/30 to-cyan-500/30' },
  perps:   { icon: '📈', label: 'Perpetuals',  color: 'from-purple-500/30 to-pink-500/30' },
  predict: { icon: '🔮', label: 'Predictions', color: 'from-amber-500/30 to-orange-500/30' },
  lend:    { icon: '🏦', label: 'Lending',     color: 'from-green-500/30 to-emerald-500/30' },
  stable:  { icon: '💵', label: 'Stablecoin',  color: 'from-teal-500/30 to-cyan-500/30' },
  stocks:  { icon: '📊', label: 'Stocks',      color: 'from-indigo-500/30 to-violet-500/30' },
  yield:   { icon: '🌾', label: 'Yield',       color: 'from-lime-500/30 to-green-500/30' },
}

function StatBox({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-dark-100 rounded-xl border border-gray-700/20 p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${accent ? 'text-goodgreen' : 'text-white'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function ProtocolCard({ protocol, trades, volume, fees }: {
  protocol: Protocol; trades: number; volume: string; fees: string
}) {
  const meta = PROTOCOL_META[protocol]
  return (
    <div className="bg-dark-100 rounded-xl border border-gray-700/20 p-4 hover:border-gray-600/30 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center text-sm`}>
          {meta.icon}
        </div>
        <span className="font-semibold text-white text-sm">{meta.label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Trades</div>
          <div className="text-sm font-bold text-white">{trades}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Volume</div>
          <div className="text-sm font-bold text-white">{volume}</div>
          <div className="text-[10px] text-gray-500">ETH</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Fees</div>
          <div className="text-sm font-bold text-goodgreen">{fees}</div>
          <div className="text-[10px] text-gray-500">ETH</div>
        </div>
      </div>
    </div>
  )
}

export default function AgentDetailPage() {
  const params = useParams()
  const address = params?.address as string | undefined

  const { profile, stats, protocolBreakdown, isLoading } = useAgentDetail(address)

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="animate-pulse text-4xl mb-4">🤖</div>
        <div className="text-gray-400">Loading agent data…</div>
      </div>
    )
  }

  if (!profile || !stats) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4">🚫</div>
        <h2 className="text-xl font-bold text-white mb-2">Agent Not Found</h2>
        <p className="text-gray-400 text-sm mb-4">
          No registered agent at{' '}
          <code className="text-xs bg-dark-100 px-1.5 py-0.5 rounded">{address}</code>
        </p>
        <Link href="/agents" className="text-goodgreen hover:underline text-sm">
          ← Back to Leaderboard
        </Link>
      </div>
    )
  }

  const registeredDate = new Date(profile.registeredAt * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
  const lastActiveDate = stats.lastActiveAt > 0
    ? new Date(stats.lastActiveAt * 1000).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : 'Never'

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <Link href="/agents" className="text-sm text-gray-400 hover:text-goodgreen transition-colors flex items-center gap-1">
        ← Leaderboard
      </Link>

      {/* Agent Header */}
      <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-goodgreen/30 to-blue-500/30 flex items-center justify-center text-2xl font-bold text-white shrink-0">
            {profile.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-white">{profile.name}</h1>
              {profile.active ? (
                <span className="px-2 py-0.5 bg-goodgreen/10 border border-goodgreen/20 rounded-full text-goodgreen text-[10px] font-semibold uppercase tracking-wide">
                  Active
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-[10px] font-semibold uppercase tracking-wide">
                  Inactive
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 font-mono mt-1 break-all">{address}</div>
            {profile.strategy && (
              <p className="text-sm text-gray-300 mt-2">{profile.strategy}</p>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span>Registered {registeredDate}</span>
              <span>•</span>
              <span>Last active {lastActiveDate}</span>
              <span>•</span>
              <span>Owner: <code className="text-gray-400">{profile.owner.slice(0, 6)}…{profile.owner.slice(-4)}</code></span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Total Trades" value={stats.totalTrades} />
        <StatBox label="Total Volume" value={`${stats.totalVolume} ETH`} />
        <StatBox label="UBI Generated" value={`${stats.ubiContribution} ETH`} accent />
        <StatBox
          label="Net P&L"
          value={`${stats.pnlPositive ? '+' : '-'}${stats.totalPnL} ETH`}
          sub={stats.pnlPositive ? '🟢 Profitable' : '🔴 In the red'}
        />
      </div>

      {/* Fee Breakdown */}
      <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-5">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-goodgreen/10 border border-goodgreen/15 flex items-center justify-center text-goodgreen text-xs">💚</span>
          Fee & UBI Breakdown
        </h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-white">{stats.totalFeesGenerated}</div>
            <div className="text-xs text-gray-400">Total Fees (ETH)</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-goodgreen">{stats.ubiContribution}</div>
            <div className="text-xs text-gray-400">→ UBI Pool (33%)</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400">
              {Number(Number(stats.totalFeesGenerated.replace(/,/g, '')) - Number(stats.ubiContribution.replace(/,/g, ''))).toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </div>
            <div className="text-xs text-gray-400">Protocol Revenue</div>
          </div>
        </div>
      </div>

      {/* Per-Protocol Breakdown */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center text-blue-400 text-xs">📋</span>
          Protocol Breakdown
        </h2>
        {protocolBreakdown.length === 0 ? (
          <div className="bg-dark-100 rounded-xl border border-gray-700/20 p-6 text-center text-gray-500">
            <div className="text-2xl mb-2">📭</div>
            <p className="text-sm">No protocol activity recorded yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {protocolBreakdown.map((pb) => (
              <ProtocolCard
                key={pb.protocol}
                protocol={pb.protocol}
                trades={pb.trades}
                volume={pb.volume}
                fees={pb.fees}
              />
            ))}
          </div>
        )}
      </div>

      {/* Explorer Link */}
      <div className="text-center text-xs text-gray-500">
        <a
          href={`https://explorer.goodclaw.org/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-goodgreen hover:underline"
        >
          View on Explorer →
        </a>
      </div>
    </div>
  )
}
