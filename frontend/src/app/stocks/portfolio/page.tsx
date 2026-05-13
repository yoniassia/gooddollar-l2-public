'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { formatStockPrice, formatLargeNumber, type PortfolioHolding, type TradeRecord } from '@/lib/stockData'
import { useOnChainStocks } from '@/lib/useOnChainStocks'
import { useStockHoldings } from '@/lib/useStockHoldings'
import { useStockTrades } from '@/lib/useStockTrades'
import { ConnectWalletEmptyState } from '@/components/ConnectWalletEmptyState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UBIContributionCard } from '@/components/UBIContributionCard'
import { PartnershipIntegrationCard } from '@/components/PartnershipIntegrationCard'

function CollateralHealth({ ratio }: { ratio: number }) {
  const color = ratio >= 150 ? 'text-green-400' : ratio >= 120 ? 'text-yellow-400' : 'text-red-400'
  const bgColor = ratio >= 150 ? 'bg-green-400' : ratio >= 120 ? 'bg-yellow-400' : 'bg-red-400'
  const label = ratio >= 150 ? 'Healthy' : ratio >= 120 ? 'At Risk' : 'Critical'
  const barWidth = Math.min(100, (ratio / 200) * 100)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1.5 gap-0.5">
        <span className="text-[10px] sm:text-xs text-gray-400">Collateral Health</span>
        <span className={`text-[10px] sm:text-xs font-medium ${color}`}>{ratio.toFixed(0)}% — {label}</span>
      </div>
      <div className="h-1.5 bg-dark-50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${bgColor}`} style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  )
}

function HoldingRow({ holding, onClick }: { holding: PortfolioHolding; onClick: () => void }) {
  const stockName: string | null = null // on-chain doesn't store display names
  const value = holding.shares * holding.currentPrice
  const cost = holding.shares * holding.avgCost
  const pnl = value - cost
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0

  return (
    <tr onClick={onClick} className="border-b border-gray-700/10 hover:bg-white/[0.04] cursor-pointer transition-colors">
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-goodgreen/30 to-goodgreen/10 border border-goodgreen/20 flex items-center justify-center text-[9px] font-bold text-goodgreen">
            {holding.ticker.slice(0, 2)}
          </div>
          <div>
            <span className="font-medium text-white text-sm">{holding.ticker}</span>
            {stockName && <span className="text-gray-500 text-xs ml-1 hidden sm:inline">{stockName}</span>}
          </div>
        </div>
      </td>
      <td className="py-3 px-3 text-right text-white text-sm">{holding.shares.toFixed(2)}</td>
      <td className="py-3 px-3 text-right text-gray-300 text-sm hidden sm:table-cell">{formatStockPrice(holding.avgCost)}</td>
      <td className="py-3 px-3 text-right text-white text-sm">{formatStockPrice(holding.currentPrice)}</td>
      <td className="py-3 px-3 text-right text-white text-sm hidden sm:table-cell">{formatStockPrice(value)}</td>
      <td className={`py-3 px-3 text-right text-sm font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {pnl >= 0 ? '+' : ''}{formatStockPrice(pnl)}
        <span className="text-xs ml-1 opacity-70">({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
      </td>
    </tr>
  )
}

function TradeRow({ trade }: { trade: TradeRecord }) {
  const date = new Date(trade.timestamp)
  return (
    <tr className="border-b border-gray-700/10">
      <td className="py-3 px-3 text-sm text-white">{trade.ticker}</td>
      <td className="py-3 px-3 text-sm">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${trade.side === 'buy' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
          {trade.side.toUpperCase()}
        </span>
      </td>
      <td className="py-3 px-3 text-right text-gray-300 text-sm">{trade.shares.toFixed(2)}</td>
      <td className="py-3 px-3 text-right text-white text-sm">{formatStockPrice(trade.price)}</td>
      <td className="py-3 px-3 text-right text-gray-400 text-sm hidden sm:table-cell">
        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </td>
      <td className={`py-3 px-3 text-right text-sm font-medium ${trade.pnl > 0 ? 'text-green-400' : trade.pnl < 0 ? 'text-red-400' : 'text-gray-500'}`}>
        {trade.pnl !== 0 ? `${trade.pnl > 0 ? '+' : ''}${formatStockPrice(trade.pnl)}` : '—'}
      </td>
    </tr>
  )
}

export default function StocksPortfolioPage() {
  const router = useRouter()
  const { address } = useAccount()
  const {
    holdings,
    totalValue,
    unrealizedPnl,
    pnlPercent,
    totalCollateral,
    totalRequired,
    healthRatio,
    isLoading: holdingsLoading,
  } = useStockHoldings(address)
  const { trades, isLoading: tradesLoading } = useStockTrades(address)

  const summary = { totalValue, unrealizedPnl, pnlPercent, totalCollateral, totalRequired, healthRatio }
  const isLoading = holdingsLoading || tradesLoading

  return (
    <ConnectWalletEmptyState
      title="Connect to View Stocks"
      description="Connect your wallet to view your tokenized stock holdings and trade history."
    >
    <div className="w-full max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Stock Portfolio</h1>

      {/* Portfolio Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6">
        <div className="bg-dark-100 rounded-xl sm:rounded-2xl border border-gray-700/20 p-3 sm:p-5">
          <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1">Total Value</div>
          <div className="text-lg sm:text-xl font-bold text-white">{formatLargeNumber(summary.totalValue)}</div>
        </div>
        <div className="bg-dark-100 rounded-xl sm:rounded-2xl border border-gray-700/20 p-3 sm:p-5">
          <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1">Unrealized P&L</div>
          <div className={`text-lg sm:text-xl font-bold ${summary.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {summary.unrealizedPnl >= 0 ? '+' : ''}{formatStockPrice(summary.unrealizedPnl)}
            <span className="hidden sm:inline text-sm ml-1 opacity-70">({summary.pnlPercent >= 0 ? '+' : ''}{summary.pnlPercent.toFixed(1)}%)</span>
          </div>
        </div>
        <div className="bg-dark-100 rounded-xl sm:rounded-2xl border border-gray-700/20 p-3 sm:p-5">
          <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1">UBI Contributed</div>
          <div className="text-lg sm:text-xl font-bold text-goodgreen">
            {formatStockPrice((summary.totalValue || 0) * 0.003 * 0.33)}
            <span className="hidden sm:inline text-sm ml-1 opacity-70 text-gray-400">via fees</span>
          </div>
        </div>
        <div className="bg-dark-100 rounded-xl sm:rounded-2xl border border-gray-700/20 p-3 sm:p-5">
          <CollateralHealth ratio={summary.healthRatio} />
          <div className="hidden sm:block mt-2 text-xs text-gray-500">
            {formatStockPrice(summary.totalCollateral)} / {formatStockPrice(summary.totalRequired)} required
          </div>
        </div>
      </div>

      {/* UBI Impact Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <UBIContributionCard
          platform="stocks"
          className="h-fit"
        />
        <PartnershipIntegrationCard
          userUBIContribution={(summary.totalValue || 0) * 0.003 * 0.33}
          compact={false}
          className="h-fit"
        />
      </div>

      <Tabs defaultValue="holdings" className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
        <TabsList className="w-full justify-start rounded-none border-b border-gray-700/20 bg-transparent p-0 h-auto">
          <TabsTrigger
            value="holdings"
            className="px-5 py-3 text-sm font-medium transition-colors rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-goodgreen data-[state=active]:shadow-none text-gray-400 hover:text-white"
          >
            Holdings ({holdings.length})
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="px-5 py-3 text-sm font-medium transition-colors rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-goodgreen data-[state=active]:shadow-none text-gray-400 hover:text-white"
          >
            History ({trades.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="holdings">
          {isLoading ? (
            <div className="py-16 text-center">
              <p className="text-gray-400 text-sm">Loading positions…</p>
            </div>
          ) : holdings.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-10 h-10 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <p className="text-gray-400 text-sm mb-1">No positions yet</p>
              <p className="text-gray-600 text-xs mb-4">Start trading to build your portfolio</p>
              <Link href="/stocks" className="text-goodgreen text-sm hover:underline">Browse Stocks</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/30 text-gray-400">
                    <th className="text-left py-2.5 px-3 font-semibold">Stock</th>
                    <th className="text-right py-2.5 px-3 font-semibold">Shares</th>
                    <th className="text-right py-2.5 px-3 font-semibold hidden sm:table-cell">Avg Cost</th>
                    <th className="text-right py-2.5 px-3 font-semibold">Price</th>
                    <th className="text-right py-2.5 px-3 font-semibold hidden sm:table-cell">Value</th>
                    <th className="text-right py-2.5 px-3 font-semibold">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map(h => (
                    <HoldingRow key={h.ticker} holding={h} onClick={() => router.push(`/stocks/${h.ticker}`)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {trades.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-400 text-sm">No trade history</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/30 text-gray-400">
                    <th className="text-left py-2.5 px-3 font-semibold">Stock</th>
                    <th className="text-left py-2.5 px-3 font-semibold">Side</th>
                    <th className="text-right py-2.5 px-3 font-semibold">Shares</th>
                    <th className="text-right py-2.5 px-3 font-semibold">Price</th>
                    <th className="text-right py-2.5 px-3 font-semibold hidden sm:table-cell">Date</th>
                    <th className="text-right py-2.5 px-3 font-semibold">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => <TradeRow key={t.id} trade={t} />)}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </ConnectWalletEmptyState>
  )
}
