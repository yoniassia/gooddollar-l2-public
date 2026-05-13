'use client'

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useExpertValidation } from '@/lib/useUserUBIContribution'
import { CheckCircle, Clock, Users, Shield, Star, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import Image from 'next/image'

interface ExpertValidationBadgeProps {
  marketId: string
  className?: string
  showDetails?: boolean
}

interface ExpertProfile {
  address: string
  name: string
  expertise: string[]
  validationCount: number
  accuracy: number
  isVerified: boolean
  avatar?: string
}

const MOCK_EXPERT_PROFILES: Record<string, ExpertProfile> = {
  '0x1234567890123456789012345678901234567890': {
    address: '0x1234567890123456789012345678901234567890',
    name: 'Dr. Sarah Chen',
    expertise: ['Economics', 'Cryptocurrency', 'Market Analysis'],
    validationCount: 127,
    accuracy: 89.3,
    isVerified: true,
    avatar: '/experts/sarah-chen.jpg'
  },
  '0x0987654321098765432109876543210987654321': {
    address: '0x0987654321098765432109876543210987654321',
    name: 'Prof. Michael Rodriguez',
    expertise: ['Political Science', 'Election Analysis', 'Statistics'],
    validationCount: 94,
    accuracy: 92.1,
    isVerified: true,
    avatar: '/experts/michael-rodriguez.jpg'
  }
}

export function ExpertValidationBadge({
  marketId,
  className = '',
  showDetails = true
}: ExpertValidationBadgeProps) {
  const [showDialog, setShowDialog] = useState(false)
  const {
    isValidated,
    validatorCount,
    validatorAddresses,
    consensusReached,
    isLoading
  } = useExpertValidation(marketId)

  if (isLoading) {
    return (
      <Badge variant="secondary" className={`bg-gray-700/50 text-gray-400 animate-pulse ${className}`}>
        <Clock className="w-3 h-3 mr-1" />
        Checking...
      </Badge>
    )
  }

  if (!isValidated) {
    return (
      <Badge variant="secondary" className={`bg-gray-700/50 text-gray-400 ${className}`}>
        <Clock className="w-3 h-3 mr-1" />
        No Expert Validation
      </Badge>
    )
  }

  const badgeContent = consensusReached ? (
    <Badge variant="secondary" className={`bg-goodgreen/10 text-goodgreen border-goodgreen/20 hover:bg-goodgreen/20 transition-colors cursor-pointer ${className}`}>
      <CheckCircle className="w-3 h-3 mr-1" />
      Expert Validated ({validatorCount})
    </Badge>
  ) : (
    <Badge variant="secondary" className={`bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20 transition-colors cursor-pointer ${className}`}>
      <Clock className="w-3 h-3 mr-1" />
      Under Review ({validatorCount})
    </Badge>
  )

  if (!showDetails) {
    return badgeContent
  }

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogTrigger asChild>
        {badgeContent}
      </DialogTrigger>
      <DialogContent className="bg-dark-100 border-gray-700/50 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-goodgreen" />
            Expert Validation Status
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Validation Overview */}
          <div className="bg-dark-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Validation Overview</h3>
              {consensusReached ? (
                <Badge className="bg-goodgreen/10 text-goodgreen border-goodgreen/20">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Consensus Reached
                </Badge>
              ) : (
                <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                  <Clock className="w-4 h-4 mr-1" />
                  Under Review
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-400 mb-1">Validators</div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-goodgreen" />
                  <span className="font-semibold">{validatorCount} experts</span>
                </div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">Status</div>
                <div className="font-semibold">
                  {consensusReached ? 'Validation Complete' : 'Validation Pending'}
                </div>
              </div>
            </div>
          </div>

          {/* Expert Validators */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Validating Experts</h3>
            <div className="space-y-3">
              {validatorAddresses.map((address, index) => {
                const expert = MOCK_EXPERT_PROFILES[address]
                if (!expert) {
                  return (
                    <div key={address} className="bg-dark-50 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">
                          <Users className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-300">Expert Validator</div>
                          <div className="text-xs text-gray-400 font-mono">
                            {address.slice(0, 6)}...{address.slice(-4)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={address} className="bg-dark-50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-goodgreen to-blue-500 flex items-center justify-center">
                          {expert.avatar ? (
                            <Image
                              src={expert.avatar}
                              alt={expert.name}
                              width={48}
                              height={48}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <Users className="w-6 h-6 text-white" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{expert.name}</span>
                            {expert.isVerified && (
                              <CheckCircle className="w-4 h-4 text-goodgreen" />
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
                            <span>{expert.validationCount} validations</span>
                            <span>{expert.accuracy}% accuracy</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {expert.expertise.map((skill) => (
                              <Badge
                                key={skill}
                                variant="secondary"
                                className="bg-gray-700/50 text-gray-300 text-xs"
                              >
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-yellow-400">
                        <Star className="w-4 h-4 fill-current" />
                        <span className="text-sm font-medium">{expert.accuracy}%</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* UBI Impact Enhancement */}
          <div className="bg-goodgreen/5 border border-goodgreen/20 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-goodgreen" />
              Enhanced UBI Impact
            </h3>
            <p className="text-sm text-gray-300 mb-3">
              Expert-validated predictions contribute an additional 5% of fees to specialized impact organizations.
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">
                This market&apos;s validation status:
              </span>
              <Badge className="bg-goodgreen/10 text-goodgreen border-goodgreen/20">
                {consensusReached ? '+5% Impact Bonus' : 'Pending Bonus'}
              </Badge>
            </div>
          </div>

          {/* Learn More */}
          <div className="border-t border-gray-700/50 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full border-gray-600 hover:border-goodgreen/50 hover:bg-goodgreen/10"
              onClick={() => {
                // TODO: Link to expert validation documentation
                window.open('/docs/expert-validation', '_blank')
              }}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Learn About Expert Validation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}