'use client'

import { useEffect, useRef, useCallback } from 'react'
import { TokenIcon } from './TokenIcon'

interface SwapConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  inputAmount: string
  outputAmount: string
  inputSymbol: string
  outputSymbol: string
  inputUsd: string
  outputUsd: string
  exchangeRate: string
  priceImpact: number
  minimumReceived: string
  networkFee: string
  ubiFee: string
}

function getPriceImpactColor(impact: number): string {
  if (impact < 1) return 'text-goodgreen'
  if (impact < 5) return 'text-yellow-400'
  return 'text-red-400'
}

export function SwapConfirmModal({
  open,
  onClose,
  onConfirm,
  inputAmount,
  outputAmount,
  inputSymbol,
  outputSymbol,
  inputUsd,
  outputUsd,
  exchangeRate,
  priceImpact,
  minimumReceived,
  networkFee,
  ubiFee,
}: SwapConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Review Swap"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full max-w-[420px] mx-4 bg-dark-100 border border-gray-700/40 rounded-2xl shadow-2xl outline-none animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-lg font-semibold text-white">Review Swap</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-dark-50 transition-colors focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Trade Summary */}
        <div className="px-5 space-y-3">
          {/* You pay */}
          <div className="p-3 rounded-xl bg-dark/80 border border-gray-700/20">
            <p className="text-xs text-gray-400 mb-1">You pay</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-semibold text-white">{inputAmount}</p>
                <p className="text-xs text-gray-500">{inputUsd}</p>
              </div>
              <div className="flex items-center gap-2">
                <TokenIcon symbol={inputSymbol} size={24} />
                <span className="font-semibold text-white">{inputSymbol}</span>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center -my-1">
            <div className="w-8 h-8 rounded-lg bg-dark-100 border border-gray-700/50 flex items-center justify-center text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>

          {/* You receive */}
          <div className="p-3 rounded-xl bg-dark/80 border border-gray-700/20">
            <p className="text-xs text-gray-400 mb-1">You receive</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-semibold text-white">{outputAmount}</p>
                <p className="text-xs text-gray-500">{outputUsd}</p>
              </div>
              <div className="flex items-center gap-2">
                <TokenIcon symbol={outputSymbol} size={24} />
                <span className="font-semibold text-white">{outputSymbol}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="px-5 mt-4 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Rate</span>
            <span className="text-white">{exchangeRate}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Price Impact</span>
            <span className={`font-medium ${getPriceImpactColor(priceImpact)}`}>
              {priceImpact.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Minimum Received</span>
            <span className="text-white">{minimumReceived}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Network Fee</span>
            <span className="text-white">{networkFee}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">UBI Contribution</span>
            <span className="text-goodgreen">{ubiFee} funds UBI</span>
          </div>
        </div>

        {/* Confirm */}
        <div className="p-5 pt-4">
          <button
            onClick={onConfirm}
            className={`w-full py-4 rounded-xl font-semibold text-base transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:outline-none ${
              priceImpact >= 10
                ? 'bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500/50'
                : 'bg-goodgreen text-white hover:bg-goodgreen-600 focus-visible:ring-goodgreen/50'
            }`}
          >
            Confirm Swap
          </button>
        </div>
      </div>
    </div>
  )
}
