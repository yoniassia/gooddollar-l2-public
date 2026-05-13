'use client'

import { useState, useMemo, memo } from 'react'
import { getChartData, type Timeframe } from '@/lib/chartData'
import { usePriceFeeds, getPrice } from '@/lib/usePriceFeeds'

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M']

interface SwapPriceChartProps {
  inputSymbol: string
  outputSymbol: string
}

function formatRate(rate: number): string {
  if (rate >= 1_000_000) return rate.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (rate >= 1000) return rate.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (rate >= 1) return rate.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (rate >= 0.01) return rate.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return rate.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export const SwapPriceChart = memo(function SwapPriceChart({
  inputSymbol,
  outputSymbol,
}: SwapPriceChartProps) {
  const { prices } = usePriceFeeds([inputSymbol, outputSymbol])
  const inputPrice = getPrice(prices, inputSymbol)
  const outputPrice = getPrice(prices, outputSymbol)
  const [timeframe, setTimeframe] = useState<Timeframe>('1W')

  const exchangeRate = outputPrice > 0 ? inputPrice / outputPrice : 0

  const chartData = useMemo(
    () => getChartData(inputSymbol, timeframe, inputPrice),
    [inputSymbol, timeframe, inputPrice],
  )

  const closePrices = useMemo(
    () => chartData.map(d => d.close / (outputPrice || 1)),
    [chartData, outputPrice],
  )

  const changePercent = useMemo(() => {
    if (closePrices.length < 2) return 0
    const first = closePrices[0]
    const last = closePrices[closePrices.length - 1]
    return first > 0 ? ((last - first) / first) * 100 : 0
  }, [closePrices])

  const isPositive = changePercent >= 0
  const color = isPositive ? '#4ade80' : '#f87171'

  const w = 400
  const h = 100
  const pad = 2

  const { linePoints, areaPoints } = useMemo(() => {
    if (closePrices.length < 2) return { linePoints: '', areaPoints: '' }
    const min = Math.min(...closePrices)
    const max = Math.max(...closePrices)
    const range = max - min || 1

    const coords = closePrices.map((v, i) => ({
      x: pad + (i / (closePrices.length - 1)) * (w - pad * 2),
      y: pad + (1 - (v - min) / range) * (h - pad * 2),
    }))

    const line = coords.map(c => `${c.x},${c.y}`).join(' ')
    const area = `${coords[0].x},${h} ${line} ${coords[coords.length - 1].x},${h}`
    return { linePoints: line, areaPoints: area }
  }, [closePrices])

  if (!exchangeRate) return null

  return (
    <div className="w-full max-w-[460px] mb-4">
      <div className="flex items-baseline justify-between mb-2 px-1">
        <div>
          <div className="text-sm text-gray-400 mb-0.5">
            1 {inputSymbol} = <span className="text-white font-medium">{formatRate(exchangeRate)} {outputSymbol}</span>
          </div>
          <span className={`text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '▲' : '▼'} {Math.abs(changePercent).toFixed(2)}%
          </span>
        </div>
        <div className="flex gap-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-goodgreen/15 text-goodgreen border border-goodgreen/20'
                  : 'text-gray-500 hover:text-gray-300 bg-dark-100 border border-gray-700/20'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-dark-100/50 rounded-xl border border-gray-700/15 p-3">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full"
          preserveAspectRatio="none"
          aria-label={`${inputSymbol}/${outputSymbol} price chart`}
        >
          {areaPoints && (
            <>
              <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <polygon points={areaPoints} fill="url(#chartFill)" />
              <polyline
                points={linePoints}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </svg>
      </div>
    </div>
  )
})
