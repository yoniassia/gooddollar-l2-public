'use client'

interface PriceImpactWarningProps {
  priceImpact: number
  visible?: boolean
}

const WARNING_THRESHOLD = 5
const DANGER_THRESHOLD = 10

export function PriceImpactWarning({ priceImpact, visible = true }: PriceImpactWarningProps) {
  if (!visible || priceImpact < WARNING_THRESHOLD) return null

  const isDanger = priceImpact >= DANGER_THRESHOLD

  return (
    <div
      data-testid="price-impact-warning"
      className={`mx-4 mt-2 p-3 rounded-xl flex items-start gap-2.5 text-sm ${
        isDanger
          ? 'bg-red-500/10 border border-red-500/30'
          : 'bg-yellow-500/10 border border-yellow-500/30'
      }`}
    >
      <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isDanger ? 'text-red-400' : 'text-yellow-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <div>
        <p className={`font-medium ${isDanger ? 'text-red-400' : 'text-yellow-400'}`}>
          Price Impact Warning — {priceImpact.toFixed(2)}%
        </p>
        <p className={`text-xs mt-0.5 ${isDanger ? 'text-red-400/70' : 'text-yellow-400/70'}`}>
          You may receive significantly less than expected due to price impact.
        </p>
      </div>
    </div>
  )
}
