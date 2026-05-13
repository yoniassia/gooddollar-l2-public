'use client'

import { useEffect, useRef } from 'react'
import { createChart, AreaSeries, type IChartApi, ColorType } from 'lightweight-charts'
import { type ProbabilityPoint } from '@/lib/chartData'

interface ProbabilityChartProps {
  data: ProbabilityPoint[]
  height?: number
}

export function ProbabilityChart({ data, height = 300 }: ProbabilityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ReturnType<IChartApi['addSeries']> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: 'rgba(107, 114, 128, 0.1)' },
        horzLines: { color: 'rgba(107, 114, 128, 0.1)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(0, 176, 160, 0.3)', width: 1, style: 2 },
        horzLine: { color: 'rgba(0, 176, 160, 0.3)', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: 'rgba(107, 114, 128, 0.2)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: { borderColor: 'rgba(107, 114, 128, 0.2)', timeVisible: false },
      width: containerRef.current.clientWidth,
      height,
    })

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#00B0A0',
      topColor: 'rgba(0, 176, 160, 0.3)',
      bottomColor: 'rgba(0, 176, 160, 0.02)',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${Math.round(price * 100)}%`,
      },
    })

    chartRef.current = chart
    seriesRef.current = areaSeries

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [height])

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return
    seriesRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()
  }, [data])

  return <div ref={containerRef} className="w-full" />
}
