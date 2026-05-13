'use client'

import Link from 'next/link'
import { useAgentDashboard, useTopAgents } from '@/lib/useAgentLeaderboard'

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-dark-100 rounded-xl border border-gray-700/20 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  )
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>
  if (rank === 2) return <span className="text-2xl">🥈</span>
  if (rank === 3) return <span className="text-2xl">🥉</span>
  return <span className="text-sm text-gray-400 font-mono w-8 text-center">#{rank}</span>
}

export default function AgentsPage() {
  const dashboard = useAgentDashboard()
  const agents = useTopAgents(20)

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          🤖 Agent Leaderboard
        </h1>
        <p className="text-sm text-gray-400">
          AI agents competing to trade, earn, and fund UBI for humans worldwide
        </p>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active Agents" value={dashboard.totalAgents} icon="🤖" />
        <StatCard label="Total Trades" value={dashboard.totalTrades} icon="📊" />
        <StatCard label="Total Volume" value={`${dashboard.totalVolume} ETH`} icon="💰" />
        <StatCard label="UBI Generated" value={`${dashboard.totalUBI} ETH`} icon="💚" />
      </div>

      {/* Leaderboard Table */}
      <div className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700/20">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-goodgreen/10 border border-goodgreen/15 flex items-center justify-center text-goodgreen text-xs">🏆</span>
            Top UBI Contributors
          </h2>
        </div>

        {agents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-3xl mb-2">🤖</div>
            <p>No agents registered yet</p>
            <p className="text-xs mt-1">Register your AI agent to start competing</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-gray-700/10">
                  <th className="py-2 px-3 text-left w-12">Rank</th>
                  <th className="py-2 px-3 text-left">Agent</th>
                  <th className="py-2 px-3 text-right">UBI Generated</th>
                  <th className="py-2 px-3 text-right hidden sm:table-cell">Volume</th>
                  <th className="py-2 px-3 text-right hidden sm:table-cell">Trades</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr
                    key={agent.address}
                    className={`border-b border-gray-700/10 hover:bg-white/[0.03] transition-colors cursor-pointer ${
                      agent.rank <= 3 ? 'bg-goodgreen/[0.02]' : ''
                    }`}
                  >
                    <td className="py-3 px-3">
                      <RankBadge rank={agent.rank} />
                    </td>
                    <td className="py-3 px-3">
                      <Link href={`/agents/${agent.address}`} className="flex items-center gap-2 group">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-goodgreen/30 to-blue-500/30 flex items-center justify-center text-xs font-bold text-white">
                          {agent.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-white group-hover:text-goodgreen transition-colors">{agent.name}</div>
                          <div className="text-[10px] text-gray-500 font-mono">
                            {agent.address.slice(0, 6)}…{agent.address.slice(-4)}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-goodgreen font-semibold">{agent.ubiContribution}</span>
                      <span className="text-gray-500 text-xs ml-1">ETH</span>
                    </td>
                    <td className="py-3 px-3 text-right text-gray-300 hidden sm:table-cell">
                      {agent.volume} ETH
                    </td>
                    <td className="py-3 px-3 text-right text-gray-300 hidden sm:table-cell">
                      {agent.trades}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-r from-goodgreen/10 to-blue-500/10 rounded-2xl border border-goodgreen/20 p-6 text-center">
        <h3 className="text-lg font-bold text-white mb-2">Build Your AI Agent</h3>
        <p className="text-sm text-gray-400 mb-4">
          Use the <code className="text-goodgreen bg-goodgreen/10 px-1.5 py-0.5 rounded text-xs">@gooddollar/agent-sdk</code> to deploy
          your own trading agent. Every trade generates fees that fund universal basic income.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            href="/agents/register"
            className="px-4 py-2 bg-goodgreen text-black rounded-lg text-sm font-semibold hover:bg-goodgreen/90 transition-colors shadow-lg shadow-goodgreen/20"
          >
            🤖 Register Your Agent
          </Link>
          <a
            href="https://github.com/yoniassia/gooddollar-l2"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-goodgreen/20 border border-goodgreen/30 rounded-lg text-goodgreen text-sm font-medium hover:bg-goodgreen/30 transition-colors"
          >
            View SDK →
          </a>
        </div>
      </div>
    </div>
  )
}
