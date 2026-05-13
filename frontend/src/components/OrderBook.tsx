'use client'

import { useMemo } from 'react'
import { formatPerpsPrice } from '@/lib/perpsData'

interface OrderBookEntry {
  price: number
  size: number
  total: number
}

function generateOrderBook(midPrice: number, levels: number = 12): { bids: OrderBookEntry[]; asks: OrderBookEntry[]; spread: number } {
  const bids: OrderBookEntry[] = []
  const asks: OrderBookEntry[] = []
  let bidTotal = 0
  let askTotal = 0

  const tickSize = midPrice > 1000 ? 1 : midPrice > 10 ? 0.01 : 0.0001

  for (let i = 1; i <= levels; i++) {
    const bidPrice = midPrice - i * tickSize * (1 + Math.random() * 0.5)
    const askPrice = midPrice + i * tickSize * (1 + Math.random() * 0.5)
    const bidSize = parseFloat((0.5 + Math.random() * 5).toFixed(3))
    const askSize = parseFloat((0.5 + Math.random() * 5).toFixed(3))
    bidTotal += bidSize
    askTotal += askSize
    bids.push({ price: bidPrice, size: bidSize, total: bidTotal })
    asks.push({ price: askPrice, size: askSize, total: askTotal })
  }

  const spread = asks[0].price - bids[0].price
  return { bids, asks: asks.reverse(), spread }
}

interface OrderBookProps {
  markPrice: number
}

export function OrderBook({ markPrice }: OrderBookProps) {
  const { bids, asks, spread } = useMemo(() => generateOrderBook(markPrice), [markPrice])
  const maxTotal = Math.max(bids[bids.length - 1]?.total ?? 0, asks[0]?.total ?? 0)

  return (
    <div className="text-xs">
      <div className="flex justify-between text-gray-500 px-2 py-1.5 border-b border-gray-700/20">
        <span>Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      <div className="max-h-[130px] overflow-y-auto scrollbar-none divide-y divide-gray-700/5">
        {asks.map((a, i) => (
          <div key={`a-${i}`} className="flex justify-between px-2 py-1 relative">
            <div className="absolute inset-y-0 right-0 bg-red-500/8 transition-all" style={{ width: `${(a.total / maxTotal) * 100}%` }} />
            <span className="text-red-400 z-10">{formatPerpsPrice(a.price)}</span>
            <span className="text-gray-300 z-10">{a.size.toFixed(3)}</span>
            <span className="text-gray-500 z-10">{a.total.toFixed(3)}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center py-2 border-y border-gray-700/20 bg-dark-50/30">
        <span className="text-white font-semibold mr-2">{formatPerpsPrice(markPrice)}</span>
        <span className="text-gray-500 text-[10px]">Spread: {formatPerpsPrice(spread)}</span>
      </div>

      <div className="max-h-[130px] overflow-y-auto scrollbar-none divide-y divide-gray-700/5">
        {bids.map((b, i) => (
          <div key={`b-${i}`} className="flex justify-between px-2 py-1 relative">
            <div className="absolute inset-y-0 right-0 bg-green-500/8 transition-all" style={{ width: `${(b.total / maxTotal) * 100}%` }} />
            <span className="text-green-400 z-10">{formatPerpsPrice(b.price)}</span>
            <span className="text-gray-300 z-10">{b.size.toFixed(3)}</span>
            <span className="text-gray-500 z-10">{b.total.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
