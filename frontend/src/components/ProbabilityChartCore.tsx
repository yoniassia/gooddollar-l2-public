'use client'

import { useEffect, useRef } from 'react'
import { createChart, AreaSeries, type IChartApi, ColorType } from 'lightweight-charts'
import { type ProbabilityPoint } from '@/lib/chartData'

interface ProbabilityChartCoreProps {
  data: ProbabilityPoint[]
  height?: number
}

export function ProbabilityChartCore({ data, height = 300 }: ProbabilityChartCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ReturnType<IChartApi['addSeries']> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'rgba(107, 114, 128, 0.1)' },
      },
      rightPriceScale: {
        visible: false,
      },
      leftPriceScale: {
        borderColor: 'rgba(107, 114, 128, 0.2)',
        textColor: '#9CA3AF',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: 'rgba(107, 114, 128, 0.2)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(16, 185, 129, 0.5)',
          width: 1,
          style: 3,
        },
        horzLine: {
          color: 'rgba(16, 185, 129, 0.5)',
          width: 1,
          style: 3,
        },
      },
      height,
    })

    chartRef.current = chart

    // Add area series for probability
    const areaSeries = chart.addSeries(AreaSeries, {
      topColor: 'rgba(16, 185, 129, 0.4)',
      bottomColor: 'rgba(16, 185, 129, 0.0)',
      lineColor: '#10B981',
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#10B981',
      crosshairMarkerBackgroundColor: '#ffffff',
    })

    seriesRef.current = areaSeries

    // Format left price scale as percentage
    chart.priceScale('left').applyOptions({
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
    })

    // Handle resize
    const handleResize = () => {
      if (chart && containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [height])

  useEffect(() => {
    if (!seriesRef.current || !data.length) return

    // Transform data for chart
    const chartData = data.map(point => ({
      time: point.time,
      value: point.value,
    }))

    seriesRef.current.setData(chartData)

    // Fit content
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent()
    }
  }, [data])

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full" style={{ height: `${height}px` }} />
    </div>
  )
}