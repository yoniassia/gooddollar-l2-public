'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { PriceDisplay } from "@/components/ui/price-display"
import { useImpactPartnerships } from '@/lib/useUserUBIContribution'
import { Heart, Users, ExternalLink, CheckCircle, ArrowUpRight } from 'lucide-react'
import { useState } from 'react'

interface PartnershipIntegrationCardProps {
  userUBIContribution?: number
  className?: string
  compact?: boolean
}

export function PartnershipIntegrationCard({
  userUBIContribution = 0,
  className = '',
  compact = false
}: PartnershipIntegrationCardProps) {
  const [showDialog, setShowDialog] = useState(false)
  const { partnerships, totalPartnershipShare, isLoading } = useImpactPartnerships()

  if (isLoading) {
    return (
      <Card className={`bg-dark-100 border-gray-700/20 ${className}`}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-700 rounded w-3/4"></div>
            <div className="h-8 bg-gray-700 rounded w-1/2"></div>
            <div className="space-y-2">
              <div className="h-3 bg-gray-700 rounded w-full"></div>
              <div className="h-3 bg-gray-700 rounded w-3/4"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Calculate user's contribution to each partnership
  const userPartnershipContributions = partnerships.map(partnership => ({
    ...partnership,
    userContribution: (userUBIContribution * partnership.impactShare) / 100
  }))

  const totalUserPartnershipContribution = userPartnershipContributions.reduce(
    (sum, p) => sum + p.userContribution,
    0
  )

  if (compact) {
    return (
      <Card className={`bg-dark-100 border-gray-700/20 hover:border-goodgreen/30 transition-colors ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-goodgreen flex items-center justify-center">
                <Heart className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-semibold text-white">Impact Partners</div>
                <div className="text-sm text-gray-400">
                  {partnerships.length} organizations • {totalPartnershipShare}% of UBI
                </div>
              </div>
            </div>
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-600 hover:border-goodgreen/50 hover:bg-goodgreen/10"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-dark-100 border-gray-700/50 text-white max-w-3xl">
                <PartnershipDialogContent
                  partnerships={userPartnershipContributions}
                  totalUserContribution={totalUserPartnershipContribution}
                  totalPartnershipShare={totalPartnershipShare}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`bg-dark-100 border-gray-700/20 hover:border-goodgreen/30 transition-colors ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-white text-lg">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-500 to-goodgreen flex items-center justify-center">
            <Heart className="w-4 h-4 text-white" />
          </div>
          Impact Partnership
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Partner Overview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Active Partners</span>
            <Badge variant="secondary" className="bg-goodgreen/10 text-goodgreen border-goodgreen/20">
              {partnerships.length} organizations
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Your Impact Share</span>
            <PriceDisplay
              value={totalUserPartnershipContribution}
              className="text-lg font-semibold text-goodgreen"
              prefix="$"
            />
          </div>
        </div>

        {/* Top Partners Preview */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-300">Top Partners</div>
          <div className="space-y-2">
            {userPartnershipContributions.slice(0, 2).map((partnership) => (
              <div
                key={partnership.id}
                className="flex items-center justify-between bg-dark-50 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-goodgreen flex items-center justify-center">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-medium text-white text-sm">{partnership.name}</div>
                    <div className="text-xs text-gray-400">
                      {partnership.impactShare}% share
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <PriceDisplay
                    value={partnership.userContribution}
                    className="text-sm font-semibold text-goodgreen"
                    prefix="$"
                  />
                  {partnership.verified && (
                    <div className="flex items-center gap-1 justify-end">
                      <CheckCircle className="w-3 h-3 text-goodgreen" />
                      <span className="text-xs text-goodgreen">Verified</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* View All Partners */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full border-gray-600 hover:border-goodgreen/50 hover:bg-goodgreen/10"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View All Partners ({partnerships.length})
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-dark-100 border-gray-700/50 text-white max-w-3xl">
            <PartnershipDialogContent
              partnerships={userPartnershipContributions}
              totalUserContribution={totalUserPartnershipContribution}
              totalPartnershipShare={totalPartnershipShare}
            />
          </DialogContent>
        </Dialog>

        {/* Impact Message */}
        <div className="pt-3 border-t border-gray-700/50">
          <p className="text-xs text-gray-400 leading-relaxed">
            <span className="text-goodgreen font-medium">{totalPartnershipShare}%</span> of your UBI contributions
            go directly to verified impact organizations working on global poverty, health, and education.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

interface PartnershipDialogContentProps {
  partnerships: Array<{
    id: string
    name: string
    description: string
    impactShare: number
    website: string
    verified: boolean
    userContribution: number
  }>
  totalUserContribution: number
  totalPartnershipShare: number
}

function PartnershipDialogContent({
  partnerships,
  totalUserContribution,
  totalPartnershipShare
}: PartnershipDialogContentProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-goodgreen" />
          Impact Partnerships
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-6">
        {/* Partnership Overview */}
        <div className="bg-dark-50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-400 mb-1">Your Total Impact</div>
              <PriceDisplay
                value={totalUserContribution}
                className="text-xl font-bold text-goodgreen"
                prefix="$"
              />
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-1">Partnership Share</div>
              <div className="text-xl font-bold text-white">
                {totalPartnershipShare}%
              </div>
            </div>
          </div>
        </div>

        {/* All Partners */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Verified Partners</h3>
          <div className="space-y-3">
            {partnerships.map((partnership) => (
              <div
                key={partnership.id}
                className="bg-dark-50 rounded-lg p-4 hover:bg-dark-50/80 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-white">{partnership.name}</h4>
                      {partnership.verified && (
                        <Badge className="bg-goodgreen/10 text-goodgreen border-goodgreen/20">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 mb-3 leading-relaxed">
                      {partnership.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="text-xs text-gray-400">Impact Share</div>
                          <div className="font-semibold text-white">
                            {partnership.impactShare}%
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Your Contribution</div>
                          <PriceDisplay
                            value={partnership.userContribution}
                            className="font-semibold text-goodgreen"
                            prefix="$"
                          />
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-gray-600 hover:border-goodgreen/50 hover:bg-goodgreen/10"
                        onClick={() => window.open(partnership.website, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Visit
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Info */}
        <div className="bg-goodgreen/5 border border-goodgreen/20 rounded-lg p-4">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Heart className="w-4 h-4 text-goodgreen" />
            Automatic Impact Distribution
          </h3>
          <p className="text-sm text-gray-300 leading-relaxed">
            Every time you trade on GoodDollar, a portion of your fees automatically goes to these verified
            organizations. No additional action required - your trading activity directly funds global impact initiatives.
          </p>
        </div>
      </div>
    </>
  )
}