'use client'

import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { type OHLCData } from '@/lib/chartData'

// Chart component with lazy loading
const DynamicChart = dynamic(
  () => import('./PriceChartCore').then(mod => ({ default: mod.PriceChartCore })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-96 bg-dark-50 rounded-lg animate-pulse">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-goodgreen border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-gray-400">Loading chart...</p>
        </div>
      </div>
    )
  }
)

interface PriceChartProps {
  data: OHLCData[]
  height?: number
}

export function PriceChart({ data, height = 400 }: PriceChartProps) {
  return <DynamicChart data={data} height={height} />
}