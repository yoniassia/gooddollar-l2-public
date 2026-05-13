'use client'

import { useState, useMemo } from 'react'
import { formatPerpsPrice, type LeaderboardEntry } from '@/lib/perpsData'
import { useLeaderboard } from '@/lib/usePerpsHistory'

type TimeFilter = '24h' | '7d' | '30d' | 'all'

export default function PerpsLeaderboardPage() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const { leaderboard } = useLeaderboard()

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        <p className="text-sm text-gray-400">Top traders by P&L</p>
      </div>

      <div className="flex gap-2 mb-4">
        {(['24h', '7d', '30d', 'all'] as TimeFilter[]).map(tf => (
          <button key={tf} onClick={() => setTimeFilter(tf)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${timeFilter === tf ? 'bg-goodgreen/15 text-goodgreen border border-goodgreen/20' : 'text-gray-400 hover:text-white bg-dark-100 border border-gray-700/20'}`}>
            {tf === 'all' ? 'All Time' : tf.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
        {leaderboard.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-400 text-sm">No leaderboard data available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700/30 text-gray-400 bg-dark-50/25">
                  <th className="text-right py-3 px-3 font-semibold w-12">#</th>
                  <th className="text-left py-3 px-3 font-semibold">Trader</th>
                  <th className="text-right py-3 px-3 font-semibold">P&L</th>
                  <th className="text-right py-3 px-3 font-semibold hidden sm:table-cell">Win Rate</th>
                  <th className="text-right py-3 px-3 font-semibold hidden sm:table-cell">Trades</th>
                  <th className="text-right py-3 px-3 font-semibold hidden md:table-cell">Top Pair</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, idx) => (
                  <tr key={entry.rank} className={`border-b border-gray-700/10 hover:bg-white/[0.04] cursor-pointer transition-colors ${idx % 2 === 1 ? 'bg-dark-50/15' : ''}`}>
                    <td className="py-3 px-3 text-right">
                      {entry.rank <= 3 ? (
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          entry.rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                          entry.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                          'bg-amber-700/20 text-amber-500'
                        }`}>
                          {entry.rank}
                        </span>
                      ) : (
                        <span className="text-gray-500">{entry.rank}</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-white font-mono text-xs">{entry.address}</span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-green-400 font-semibold">+{formatPerpsPrice(entry.pnl)}</span>
                    </td>
                    <td className="py-3 px-3 text-right text-gray-300 hidden sm:table-cell">
                      {(entry.winRate * 100).toFixed(0)}%
                    </td>
                    <td className="py-3 px-3 text-right text-gray-300 hidden sm:table-cell">
                      {entry.totalTrades}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-400 hidden md:table-cell">
                      {entry.topPair}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-600 text-center mt-4">
        Rankings sourced from on-chain trade settlement events via indexer.
      </p>
    </div>
  )
}
