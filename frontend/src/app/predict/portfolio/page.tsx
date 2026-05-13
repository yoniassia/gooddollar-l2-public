'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatVolume } from '@/lib/predictData'
import { useOnChainPredictPositions, useOnChainPredictSummary, useOnChainMarkets } from '@/lib/useOnChainPredict'
import { ConnectWalletEmptyState } from '@/components/ConnectWalletEmptyState'
import { PriceDisplay } from '@/components/ui/price-display'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { UBIContributionCard } from '@/components/UBIContributionCard'
import { PartnershipIntegrationCard } from '@/components/PartnershipIntegrationCard'
import { ExpertValidationBadge } from '@/components/ExpertValidationBadge'

export default function PredictPortfolioPage() {
  const { positions, resolved } = useOnChainPredictPositions()
  const summary = useOnChainPredictSummary()
  const { markets } = useOnChainMarkets()

  // Build a lookup from market ID → question
  const marketMap = useMemo(() => {
    const m = new Map<string, { question: string; yesPrice: number; endDate: string; resolved: boolean }>()
    for (const market of markets) {
      m.set(market.id, { question: market.question, yesPrice: market.yesPrice, endDate: market.endDate, resolved: market.resolved })
    }
    return m
  }, [markets])

  const pendingPositions = positions.filter(p => {
    const market = marketMap.get(p.marketId)
    return market && new Date(market.endDate) < new Date() && !market.resolved
  })

  return (
    <ConnectWalletEmptyState
      title="Connect to View Predictions"
      description="Connect your wallet to view your prediction market positions and resolved bets."
    >
    <div className="w-full max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Predictions Portfolio</h1>

      {/* Portfolio Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6">
        <div className="bg-dark-100 rounded-xl sm:rounded-2xl border border-gray-700/20 p-3 sm:p-5">
          <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1">Total Invested</div>
          <div className="text-lg sm:text-xl font-bold text-white">{formatVolume(summary.totalInvested)}</div>
        </div>
        <div className="bg-dark-100 rounded-xl sm:rounded-2xl border border-gray-700/20 p-3 sm:p-5">
          <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1">Current Value</div>
          <div className="text-lg sm:text-xl font-bold text-white">{formatVolume(summary.currentValue)}</div>
        </div>
        <div className="bg-dark-100 rounded-xl sm:rounded-2xl border border-gray-700/20 p-3 sm:p-5">
          <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1">Unrealized P&L</div>
          <div className="text-lg sm:text-xl font-bold">
            <PriceDisplay value={summary.unrealizedPnl} prefix="$" showSign size="lg" showContext contextLabel="all markets" />
          </div>
        </div>
        <div className="bg-dark-100 rounded-xl sm:rounded-2xl border border-gray-700/20 p-3 sm:p-5">
          <div className="text-[10px] sm:text-xs text-gray-400 mb-0.5 sm:mb-1">UBI Contributed</div>
          <div className="text-lg sm:text-xl font-bold text-goodgreen">
            <PriceDisplay value={summary.totalInvested * 0.01 * 0.33} prefix="$" showContext contextLabel="via fees" />
          </div>
        </div>
      </div>

      {/* UBI Impact Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <UBIContributionCard
          platform="predict"
          showExpertValidation={true}
          className="h-fit"
        />
        <PartnershipIntegrationCard
          userUBIContribution={summary.totalInvested * 0.01 * 0.33}
          compact={false}
          className="h-fit"
        />
      </div>

      <Tabs defaultValue="positions" className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
        <TabsList className="flex h-auto p-0 bg-transparent border-b border-gray-700/20 rounded-none w-full justify-start">
          <TabsTrigger
            value="positions"
            className="px-5 py-3 text-sm font-medium transition-colors rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-goodgreen data-[state=active]:shadow-none text-gray-400 hover:text-white"
          >
            Positions ({positions.length})
          </TabsTrigger>
          <TabsTrigger
            value="pending"
            className="px-5 py-3 text-sm font-medium transition-colors rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-goodgreen data-[state=active]:shadow-none text-gray-400 hover:text-white"
          >
            Pending ({pendingPositions.length})
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="px-5 py-3 text-sm font-medium transition-colors rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-goodgreen data-[state=active]:shadow-none text-gray-400 hover:text-white"
          >
            History ({resolved.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-0">
          {positions.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-400 text-sm mb-1">No open positions</p>
              <p className="text-gray-600 text-xs mb-4">Start predicting to build your portfolio</p>
              <Link href="/predict" className="text-goodgreen text-sm hover:underline">Browse Markets</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-700/10">
              {positions.map(pos => {
                const market = marketMap.get(pos.marketId)
                const currentVal = pos.side === 'yes' ? pos.currentPrice : 1 - pos.currentPrice
                const pnl = pos.shares * (currentVal - pos.avgPrice)
                return (
                  <Link key={pos.marketId} href={`/predict/${pos.marketId}`} className="block px-5 py-4 hover:bg-dark-50/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{market?.question ?? `Market #${pos.marketId}`}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs">
                          <span className={`px-2 py-0.5 rounded font-medium ${pos.side === 'yes' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                            {pos.side.toUpperCase()}
                          </span>
                          <span className="text-gray-500">{pos.shares.toFixed(1)} shares @ {(pos.avgPrice * 100).toFixed(0)}¢</span>
                          <ExpertValidationBadge
                            marketId={pos.marketId}
                            showDetails={false}
                            className="ml-1"
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium">
                          <PriceDisplay value={pnl} prefix="$" decimals={2} showSign size="sm" />
                        </div>
                        <div className="text-xs text-gray-500">
                          {market ? `${Math.round(market.yesPrice * 100)}% YES` : ''}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pending" className="mt-0">
          {
          pendingPositions.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-400 text-sm">No markets pending resolution</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700/10">
              {pendingPositions.map(pos => {
                const market = marketMap.get(pos.marketId)
                return (
                  <div key={pos.marketId} className="px-5 py-4">
                    <p className="text-sm text-white">{market?.question ?? `Market #${pos.marketId}`}</p>
                    <p className="text-xs text-gray-500 mt-1">Ended {market ? new Date(market.endDate).toLocaleDateString() : ''} — awaiting resolution</p>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          {
          resolved.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-400 text-sm">No resolved positions</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700/10">
              {resolved.map(pos => {
                const market = marketMap.get(pos.marketId)
                const won = pos.side === pos.outcome
                const pnl = won ? pos.payout - pos.shares * pos.avgPrice : -(pos.shares * pos.avgPrice)
                return (
                  <div key={pos.marketId} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-white">{market?.question ?? `Market #${pos.marketId}`}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          <span className={`px-2 py-0.5 rounded font-medium ${won ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                            {won ? 'WON' : 'LOST'}
                          </span>
                          <span className="text-gray-500">Outcome: {pos.outcome.toUpperCase()}</span>
                        </div>
                      </div>
                      <div className="text-sm font-medium">
                        <PriceDisplay value={pnl} prefix="$" decimals={2} showSign size="sm" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </ConnectWalletEmptyState>
  )
}
