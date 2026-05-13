'use client'

import { useState } from 'react'

interface SwapDetailsProps {
  priceImpact: number
  minimumReceived: string
  outputSymbol: string
  networkFee: string
  visible: boolean
}

function getPriceImpactColor(impact: number): string {
  if (impact < 1) return 'text-goodgreen'
  if (impact < 5) return 'text-yellow-400'
  return 'text-red-400'
}

export function SwapDetails({ priceImpact, minimumReceived, outputSymbol, networkFee, visible }: SwapDetailsProps) {
  const [expanded, setExpanded] = useState(true)

  if (!visible) return null

  return (
    <div className="mx-4 mt-2">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between py-2 px-1 text-xs text-gray-400 hover:text-gray-300 transition-colors rounded-lg focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none"
      >
        <span>Swap Details</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="space-y-2 pb-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Price Impact</span>
            <span
              data-testid="price-impact"
              className={`font-medium ${getPriceImpactColor(priceImpact)}`}
            >
              {priceImpact.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Minimum Received</span>
            <span className="text-white">{minimumReceived} {outputSymbol}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Network Fee</span>
            <span className="text-white">{networkFee}</span>
          </div>
        </div>
      )}
    </div>
  )
}
