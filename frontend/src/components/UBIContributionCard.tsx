'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PriceDisplay } from "@/components/ui/price-display"
import { PercentageChange } from "@/components/ui/percentage-change"
import { useAccount } from 'wagmi'
import { useUserUBIContribution } from '@/lib/useUserUBIContribution'
import { Heart, TrendingUp, Users, Sparkles } from 'lucide-react'

interface UBIContributionCardProps {
  platform?: 'predict' | 'stocks' | 'all'
  className?: string
  showExpertValidation?: boolean
}

export function UBIContributionCard({
  platform = 'all',
  className = '',
  showExpertValidation = false
}: UBIContributionCardProps) {
  const { address } = useAccount()
  const {
    totalUBIContributed,
    platformBreakdown,
    monthlyContribution,
    expertValidationCount,
    impactRanking,
    isLoading,
    error
  } = useUserUBIContribution(address, platform)

  if (!address) {
    return (
      <Card className={`bg-dark-100 border-gray-700/20 ${className}`}>
        <CardContent className="p-6">
          <div className="text-center text-gray-400">
            Connect wallet to see your UBI impact
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className={`bg-dark-100 border-gray-700/20 ${className}`}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-700 rounded w-3/4"></div>
            <div className="h-8 bg-gray-700 rounded w-1/2"></div>
            <div className="h-3 bg-gray-700 rounded w-full"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={`bg-dark-100 border-gray-700/20 ${className}`}>
        <CardContent className="p-6">
          <div className="text-center text-red-400">
            Error loading UBI impact data
          </div>
        </CardContent>
      </Card>
    )
  }

  const getPlatformTitle = () => {
    switch (platform) {
      case 'predict': return 'UBI from Predictions'
      case 'stocks': return 'UBI from Stock Trading'
      default: return 'Total UBI Impact'
    }
  }

  const getPlatformIcon = () => {
    switch (platform) {
      case 'predict': return <Sparkles className="w-5 h-5 text-goodgreen" />
      case 'stocks': return <TrendingUp className="w-5 h-5 text-goodgreen" />
      default: return <Heart className="w-5 h-5 text-goodgreen" />
    }
  }

  return (
    <Card className={`bg-dark-100 border-gray-700/20 hover:border-goodgreen/30 transition-colors ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-white text-lg">
          {getPlatformIcon()}
          {getPlatformTitle()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main UBI Amount */}
        <div className="space-y-1">
          <div className="flex items-baseline gap-1">
            <PriceDisplay
              value={totalUBIContributed}
              className="text-2xl font-bold text-goodgreen"
              prefix="$"
            />
            <span className="text-sm text-gray-400">G$ funded</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Users className="w-4 h-4" />
            <span>Ranking #{impactRanking} contributor</span>
          </div>
        </div>

        {/* Platform Breakdown for 'all' view */}
        {platform === 'all' && platformBreakdown && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-300">Platform Breakdown</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-dark-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-gray-400">Predictions</span>
                </div>
                <PriceDisplay
                  value={platformBreakdown.predict}
                  className="text-lg font-semibold text-purple-400"
                  prefix="$"
                />
              </div>
              <div className="bg-dark-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-gray-400">Stocks</span>
                </div>
                <PriceDisplay
                  value={platformBreakdown.stocks}
                  className="text-lg font-semibold text-blue-400"
                  prefix="$"
                />
              </div>
            </div>
          </div>
        )}

        {/* Monthly Trend */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-300">This Month</div>
          <div className="flex items-center justify-between">
            <PriceDisplay
              value={monthlyContribution.amount}
              className="text-lg font-semibold text-white"
              prefix="$"
            />
            <PercentageChange
              value={monthlyContribution.changePercent}
              className="text-sm"
            />
          </div>
        </div>

        {/* Expert Validation (Predict only) */}
        {showExpertValidation && platform === 'predict' && expertValidationCount > 0 && (
          <div className="pt-3 border-t border-gray-700/50">
            <Badge variant="secondary" className="bg-goodgreen/10 text-goodgreen border-goodgreen/20">
              <Sparkles className="w-3 h-3 mr-1" />
              {expertValidationCount} Expert Validations
            </Badge>
          </div>
        )}

        {/* Impact Message */}
        <div className="pt-3 border-t border-gray-700/50">
          <p className="text-xs text-gray-400 leading-relaxed">
            Your trades automatically fund Universal Basic Income for people in need.
            <span className="text-goodgreen"> Thank you for making an impact!</span>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}