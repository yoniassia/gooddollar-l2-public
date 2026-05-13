import { Suspense } from 'react'
import dynamic from 'next/dynamic'

const SwapCard = dynamic(
  () => import('@/components/SwapCard').then(m => ({ default: m.SwapCard })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full max-w-[460px] bg-dark-100 rounded-2xl border border-gray-700/20 p-6 animate-pulse">
        <div className="flex justify-between mb-6">
          <div className="h-6 w-16 bg-dark-50/50 rounded" />
          <div className="h-6 w-32 bg-dark-50/30 rounded-full" />
        </div>
        <div className="bg-dark-50/30 rounded-xl p-4 mb-2">
          <div className="h-4 w-16 bg-dark-50/40 rounded mb-3" />
          <div className="h-10 w-24 bg-dark-50/40 rounded" />
        </div>
        <div className="flex justify-center py-2">
          <div className="w-8 h-8 rounded-full bg-dark-50/40" />
        </div>
        <div className="bg-dark-50/30 rounded-xl p-4 mb-4">
          <div className="h-4 w-20 bg-dark-50/40 rounded mb-3" />
          <div className="h-10 w-24 bg-dark-50/40 rounded" />
        </div>
        <div className="h-12 w-full bg-dark-50/40 rounded-xl" />
      </div>
    )
  }
)

const SwapPriceChart = dynamic(
  () => import('@/components/SwapPriceChart').then(m => ({ default: m.SwapPriceChart })),
  { ssr: false }
)

const HowItWorks = dynamic(
  () => import('@/components/HowItWorks').then(m => ({ default: m.HowItWorks }))
)
const StartSwappingCTA = dynamic(
  () => import('@/components/StartSwappingCTA').then(m => ({ default: m.StartSwappingCTA }))
)
const StatsRow = dynamic(
  () => import('@/components/StatsRow').then(m => ({ default: m.StatsRow }))
)
const UBIExplainer = dynamic(
  () => import('@/components/UBIExplainer').then(m => ({ default: m.UBIExplainer }))
)
const PlatformShowcase = dynamic(
  () => import('@/components/PlatformShowcase').then(m => ({ default: m.PlatformShowcase }))
)

export default function Home() {
  return (
    <div className="w-full flex flex-col items-center relative overflow-x-hidden">
      {/* Hero glow effect */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[400px] opacity-[0.07] rounded-full blur-[100px]"
        style={{ background: 'radial-gradient(ellipse at center, #00B0A0 0%, transparent 70%)' }}
      />

      <div className="mb-8 text-center max-w-md relative">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Trade. Predict. Invest. Fund{'\u00A0'}UBI.
        </h1>
        <p className="text-sm text-gray-400">
          Every swap, prediction, and trade on GoodDollar automatically funds universal basic income for verified humans worldwide.
        </p>
        <p className="mt-3 text-xs text-gray-500 flex items-center justify-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-goodgreen animate-pulse" />
          <span className="text-goodgreen/80 font-medium">$2.4M</span>
          already distributed to
          <span className="text-goodgreen/80 font-medium">640K+</span>
          people worldwide
        </p>
      </div>

      <SwapPriceChart
        inputSymbol="ETH"
        outputSymbol="G$"
      />

      {/* Swap card wrapper with glow */}
      <div className="relative w-full max-w-[460px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -m-4 opacity-[0.06] rounded-3xl blur-[60px]"
          style={{ background: 'radial-gradient(ellipse at center, #00B0A0 0%, transparent 70%)' }}
        />
        <SwapCard />
      </div>

      <HowItWorks />
      <UBIExplainer />
      <PlatformShowcase />
      <StartSwappingCTA />
      <StatsRow />
    </div>
  )
}
