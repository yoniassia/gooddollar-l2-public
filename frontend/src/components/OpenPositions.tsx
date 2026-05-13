'use client'

import { useState } from 'react'
import { formatPerpsPrice, type OpenPosition } from '@/lib/perpsData'
import { useOnChainPositions } from '@/lib/useOnChainPerps'

function PositionRow({ pos }: { pos: OpenPosition }) {
  const [showClose, setShowClose] = useState(false)
  const [closing, setClosing] = useState(false)

  const handleClose = () => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      setShowClose(false)
    }, 2000)
  }

  return (
    <div className="px-3 py-2.5 border-b border-gray-700/10 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{pos.pair}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${pos.side === 'long' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
            {pos.side.toUpperCase()} {pos.leverage}x
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] text-gray-500 bg-dark-50/50">{pos.marginMode}</span>
        </div>
        <div className={`text-sm font-medium ${pos.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {pos.unrealizedPnl >= 0 ? '+' : ''}{formatPerpsPrice(pos.unrealizedPnl)}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
        <div>
          <span className="text-gray-500">Size</span>
          <span className="text-gray-300 ml-1">{pos.size}</span>
        </div>
        <div>
          <span className="text-gray-500">Entry</span>
          <span className="text-gray-300 ml-1">{formatPerpsPrice(pos.entryPrice)}</span>
        </div>
        <div>
          <span className="text-gray-500">Mark</span>
          <span className="text-gray-300 ml-1">{formatPerpsPrice(pos.markPrice)}</span>
        </div>
        <div>
          <span className="text-gray-500">Liq.</span>
          <span className="text-yellow-400 ml-1">{formatPerpsPrice(pos.liquidationPrice)}</span>
        </div>
      </div>

      <div className="flex justify-end mt-1.5">
        {showClose ? (
          <div className="flex gap-2">
            <button onClick={handleClose} disabled={closing}
              className="px-3 py-1 text-xs rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50">
              {closing ? 'Closing...' : 'Confirm Close'}
            </button>
            <button onClick={() => setShowClose(false)} className="px-3 py-1 text-xs rounded-lg text-gray-400 hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setShowClose(true)} className="px-3 py-1 text-xs rounded-lg text-gray-400 hover:text-red-400 transition-colors">
            Close
          </button>
        )}
      </div>
    </div>
  )
}

export function OpenPositions() {
  const { positions } = useOnChainPositions()

  if (positions.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 text-xs">
        No open positions
      </div>
    )
  }

  return (
    <div>
      {positions.map((pos, i) => (
        <PositionRow key={`${pos.pair}-${i}`} pos={pos} />
      ))}
    </div>
  )
}
