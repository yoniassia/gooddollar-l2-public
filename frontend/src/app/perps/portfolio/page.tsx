'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatPerpsPrice, formatLargeValue, type OpenPosition, type PendingOrder, type TradeHistoryRecord, type FundingPayment } from '@/lib/perpsData'
import { useOnChainPairs, useOnChainPositions, useOnChainAccountSummary } from '@/lib/useOnChainPerps'
import { useTradeHistory, useFundingPayments } from '@/lib/usePerpsHistory'
import { useClosePosition } from '@/lib/usePerps'
import { ConnectWalletEmptyState } from '@/components/ConnectWalletEmptyState'
import { PriceDisplay } from '@/components/ui/price-display'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function PositionRow({ pos, marketId }: { pos: OpenPosition; marketId: bigint }) {
  const { closePosition, phase, error } = useClosePosition()
  const isClosing = phase === 'pending'
  const isDone = phase === 'done'

  return (
    <tr className="border-b border-gray-700/10">
      <td className="py-2.5 px-3 text-sm text-white">{pos.pair}</td>
      <td className="py-2.5 px-3">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${pos.side === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
          {pos.side.toUpperCase()} {pos.leverage}x
        </span>
      </td>
      <td className="py-2.5 px-3 text-right text-sm text-gray-300">{pos.size}</td>
      <td className="py-2.5 px-3 text-right text-sm text-gray-300 hidden sm:table-cell">{formatPerpsPrice(pos.entryPrice)}</td>
      <td className="py-2.5 px-3 text-right text-sm text-gray-300">{formatPerpsPrice(pos.markPrice)}</td>
      <td className="py-2.5 px-3 text-right text-sm font-medium">
        <PriceDisplay value={pos.unrealizedPnl} prefix="$" showSign size="sm" showContext contextLabel="unrealized" />
      </td>
      <td className="py-2.5 px-3 text-right text-sm text-yellow-400 hidden sm:table-cell">{formatPerpsPrice(pos.liquidationPrice)}</td>
      <td className="py-2.5 px-3 text-right">
        {error && <span className="text-[10px] text-red-400 mr-1">{error}</span>}
        <button
          onClick={() => closePosition(marketId)}
          disabled={isClosing || isDone}
          className="px-2.5 py-1 text-xs rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          {isDone ? 'Closed' : isClosing ? 'Closing...' : 'Close'}
        </button>
      </td>
    </tr>
  )
}

function OrderRow({ order }: { order: PendingOrder }) {
  const [cancelling, setCancelling] = useState(false)
  return (
    <tr className="border-b border-gray-700/10">
      <td className="py-2.5 px-3 text-sm text-white">{order.pair}</td>
      <td className="py-2.5 px-3">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-dark-50 text-gray-300 capitalize">{order.type}</span>
      </td>
      <td className="py-2.5 px-3">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${order.side === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
          {order.side.toUpperCase()}
        </span>
      </td>
      <td className="py-2.5 px-3 text-right text-sm text-gray-300">{formatPerpsPrice(order.price)}</td>
      <td className="py-2.5 px-3 text-right text-sm text-gray-300">{order.size}</td>
      <td className="py-2.5 px-3 text-right">
        <button onClick={() => setCancelling(true)} disabled={cancelling}
          className="px-2.5 py-1 text-xs rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
          {cancelling ? 'Cancelled' : 'Cancel'}
        </button>
      </td>
    </tr>
  )
}

function TradeRow({ trade }: { trade: TradeHistoryRecord }) {
  const date = new Date(trade.timestamp)
  return (
    <tr className="border-b border-gray-700/10">
      <td className="py-2.5 px-3 text-sm text-white">{trade.pair}</td>
      <td className="py-2.5 px-3">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${trade.side === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
          {trade.side.toUpperCase()}
        </span>
      </td>
      <td className="py-2.5 px-3 text-[10px] text-gray-400 capitalize">{trade.type}</td>
      <td className="py-2.5 px-3 text-right text-sm text-gray-300">{trade.size}</td>
      <td className="py-2.5 px-3 text-right text-sm text-gray-300">{formatPerpsPrice(trade.price)}</td>
      <td className="py-2.5 px-3 text-right text-sm text-gray-400">${trade.fee.toFixed(2)}</td>
      <td className="py-2.5 px-3 text-right text-sm font-medium">
        {trade.pnl !== 0 ? (
          <PriceDisplay value={trade.pnl} prefix="$" showSign size="sm" />
        ) : (
          <span className="text-gray-500">—</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right text-xs text-gray-500 hidden sm:table-cell">
        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </td>
    </tr>
  )
}

function FundingRow({ payment }: { payment: FundingPayment }) {
  const date = new Date(payment.timestamp)
  return (
    <tr className="border-b border-gray-700/10">
      <td className="py-2.5 px-3 text-sm text-white">{payment.pair}</td>
      <td className="py-2.5 px-3 text-right text-sm font-medium">
        <PriceDisplay value={payment.amount} prefix="$" showSign size="sm" />
      </td>
      <td className="py-2.5 px-3 text-right text-sm text-gray-400">{(payment.rate * 100).toFixed(4)}%</td>
      <td className="py-2.5 px-3 text-right text-xs text-gray-500">
        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
      </td>
    </tr>
  )
}

export default function PerpsPortfolioPage() {
  const { positions } = useOnChainPositions()
  const { pairs } = useOnChainPairs()
  const orders: PendingOrder[] = []  // limit orders not yet supported
  const { trades } = useTradeHistory()
  const { funding } = useFundingPayments()
  const { summary: account } = useOnChainAccountSummary()

  const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0)
  const totalFunding = funding.reduce((sum, f) => sum + f.amount, 0)

  return (
    <ConnectWalletEmptyState
      title="Connect to View Perps"
      description="Connect your wallet to view your perpetual futures positions, orders, and trade history."
    >
    <div className="w-full max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Perps Portfolio</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <div className="bg-dark-100 rounded-xl border border-gray-700/20 p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Equity</div>
          <div className="text-base sm:text-lg font-bold text-white">{formatPerpsPrice(account.equity)}</div>
        </div>
        <div className="bg-dark-100 rounded-xl border border-gray-700/20 p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Unrealized P&L</div>
          <div className="text-base sm:text-lg font-bold">
            <PriceDisplay value={totalPnl} prefix="$" showSign size="lg" showContext contextLabel="all positions" />
          </div>
        </div>
        <div className="bg-dark-100 rounded-xl border border-gray-700/20 p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Net Funding</div>
          <div className="text-base sm:text-lg font-bold">
            <PriceDisplay value={totalFunding} prefix="$" showSign size="lg" showContext contextLabel="funding history" />
          </div>
        </div>
        <div className="bg-dark-100 rounded-xl border border-gray-700/20 p-3 sm:p-4">
          <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5">Available</div>
          <div className="text-base sm:text-lg font-bold text-goodgreen">{formatPerpsPrice(account.availableMargin)}</div>
        </div>
      </div>

      <Tabs defaultValue="positions" className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
        <TabsList className="w-full justify-start rounded-none border-b border-gray-700/20 bg-transparent p-0 h-auto overflow-x-auto">
          <TabsTrigger
            value="positions"
            className="px-5 py-3 text-sm font-medium transition-colors rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-goodgreen data-[state=active]:shadow-none text-gray-400 hover:text-white"
          >
            Positions ({positions.length})
          </TabsTrigger>
          <TabsTrigger
            value="orders"
            className="px-5 py-3 text-sm font-medium transition-colors rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-goodgreen data-[state=active]:shadow-none text-gray-400 hover:text-white"
          >
            Orders ({orders.length})
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="px-5 py-3 text-sm font-medium transition-colors rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-goodgreen data-[state=active]:shadow-none text-gray-400 hover:text-white"
          >
            Trades ({trades.length})
          </TabsTrigger>
          <TabsTrigger
            value="funding"
            className="px-5 py-3 text-sm font-medium transition-colors rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-goodgreen data-[state=active]:shadow-none text-gray-400 hover:text-white"
          >
            Funding ({funding.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions">
          positions.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-400 text-sm mb-1">No open positions</p>
              <Link href="/perps" className="text-goodgreen text-sm hover:underline">Start Trading</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/30 text-gray-400">
                    <th className="text-left py-2 px-3 font-semibold">Pair</th>
                    <th className="text-left py-2 px-3 font-semibold">Side</th>
                    <th className="text-right py-2 px-3 font-semibold">Size</th>
                    <th className="text-right py-2 px-3 font-semibold hidden sm:table-cell">Entry</th>
                    <th className="text-right py-2 px-3 font-semibold">Mark</th>
                    <th className="text-right py-2 px-3 font-semibold">P&L</th>
                    <th className="text-right py-2 px-3 font-semibold hidden sm:table-cell">Liq.</th>
                    <th className="text-right py-2 px-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => (
                    <PositionRow
                      key={i}
                      pos={p}
                      marketId={BigInt(pairs.findIndex(pair => pair.symbol === p.pair))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        </TabsContent>

        <TabsContent value="orders">
          orders.length === 0 ? (
            <div className="py-16 text-center"><p className="text-gray-400 text-sm">No pending orders</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/30 text-gray-400">
                    <th className="text-left py-2 px-3 font-semibold">Pair</th>
                    <th className="text-left py-2 px-3 font-semibold">Type</th>
                    <th className="text-left py-2 px-3 font-semibold">Side</th>
                    <th className="text-right py-2 px-3 font-semibold">Price</th>
                    <th className="text-right py-2 px-3 font-semibold">Size</th>
                    <th className="text-right py-2 px-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => <OrderRow key={o.id} order={o} />)}
                </tbody>
              </table>
            </div>
          )
        </TabsContent>

        <TabsContent value="history">
          trades.length === 0 ? (
            <div className="py-16 text-center"><p className="text-gray-400 text-sm">No trade history</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/30 text-gray-400">
                    <th className="text-left py-2 px-3 font-semibold">Pair</th>
                    <th className="text-left py-2 px-3 font-semibold">Side</th>
                    <th className="text-left py-2 px-3 font-semibold">Type</th>
                    <th className="text-right py-2 px-3 font-semibold">Size</th>
                    <th className="text-right py-2 px-3 font-semibold">Price</th>
                    <th className="text-right py-2 px-3 font-semibold">Fee</th>
                    <th className="text-right py-2 px-3 font-semibold">P&L</th>
                    <th className="text-right py-2 px-3 font-semibold hidden sm:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => <TradeRow key={t.id} trade={t} />)}
                </tbody>
              </table>
            </div>
          )
        </TabsContent>

        <TabsContent value="funding">
          funding.length === 0 ? (
            <div className="py-16 text-center"><p className="text-gray-400 text-sm">No funding payments</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/30 text-gray-400">
                    <th className="text-left py-2 px-3 font-semibold">Pair</th>
                    <th className="text-right py-2 px-3 font-semibold">Amount</th>
                    <th className="text-right py-2 px-3 font-semibold">Rate</th>
                    <th className="text-right py-2 px-3 font-semibold">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {funding.map((f, i) => <FundingRow key={i} payment={f} />)}
                </tbody>
              </table>
            </div>
          )
        </TabsContent>
      </Tabs>
    </div>
    </ConnectWalletEmptyState>
  )
}
