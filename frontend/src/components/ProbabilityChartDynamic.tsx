'use client'

import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { type ProbabilityPoint } from '@/lib/chartData'

// Chart component with lazy loading
const DynamicChart = dynamic(
  () => import('./ProbabilityChartCore').then(mod => ({ default: mod.ProbabilityChartCore })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-72 bg-dark-50 rounded-lg animate-pulse">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-goodgreen border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs text-gray-400">Loading probability chart...</p>
        </div>
      </div>
    )
  }
)

interface ProbabilityChartProps {
  data: ProbabilityPoint[]
  height?: number
}

export function ProbabilityChart({ data, height = 300 }: ProbabilityChartProps) {
  return <DynamicChart data={data} height={height} />
}