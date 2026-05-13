'use client'

import { useState, useRef, useEffect } from 'react'
import { useSwapSettings } from '@/lib/useSwapSettings'
import { sanitizeNumericInput } from '@/lib/format'

const PRESETS = [0.1, 0.5, 1.0]

export function SwapSettings() {
  const {
    slippage,
    deadline,
    setSlippage,
    setDeadline,
    suggestion,
    applySuggestion,
    hasLearning
  } = useSwapSettings()
  const [open, setOpen] = useState(false)
  const [customSlippage, setCustomSlippage] = useState('')
  const [showMaxWarning, setShowMaxWarning] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const isPreset = PRESETS.includes(slippage)

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Settings"
        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-dark-50 transition-colors focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-dark-100 border border-gray-700/50 rounded-xl shadow-2xl z-50 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Transaction Settings</h3>

          <div className="mb-4">
            <label htmlFor="slippage-custom" className="text-xs text-gray-400 mb-2 block">Slippage Tolerance</label>
            <div className="flex gap-2">
              {PRESETS.map(p => (
                <button
                  key={p}
                  onClick={() => { setSlippage(p); setCustomSlippage('') }}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none ${
                    slippage === p && isPreset
                      ? 'bg-goodgreen/20 text-goodgreen border border-goodgreen/40'
                      : 'bg-dark-50 text-gray-300 border border-gray-700/50 hover:border-gray-600'
                  }`}
                >
                  {p}%
                </button>
              ))}
              <div className="relative flex-1">
                <input
                  id="slippage-custom"
                  type="text"
                  inputMode="decimal"
                  placeholder="Custom"
                  aria-label="Custom slippage tolerance percentage"
                  value={customSlippage}
                  onChange={e => {
                    const val = sanitizeNumericInput(e.target.value)
                    const num = parseFloat(val)
                    if (!isNaN(num) && num > 50) {
                      setCustomSlippage('50')
                      setShowMaxWarning(true)
                      setSlippage(50)
                    } else {
                      setCustomSlippage(val)
                      setShowMaxWarning(false)
                      if (!isNaN(num) && num > 0) setSlippage(num)
                    }
                  }}
                  onBlur={() => {
                    const num = parseFloat(customSlippage)
                    if (!isNaN(num) && num > 50) {
                      setCustomSlippage('50')
                      setShowMaxWarning(true)
                    } else if (!isNaN(num) && num > 0) {
                      setShowMaxWarning(false)
                    }
                  }}
                  className={`w-full py-1.5 px-2 rounded-lg text-sm text-right bg-dark-50 border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-goodgreen/50 ${
                    !isPreset && slippage > 0
                      ? 'border-goodgreen/40 text-goodgreen'
                      : 'border-gray-700/50 text-gray-300'
                  }`}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">%</span>
              </div>
            </div>

            {/* Smart Suggestion */}
            {suggestion && !showMaxWarning && (
              <div className="mt-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-blue-300 flex-1">{suggestion}</p>
                  <button
                    onClick={applySuggestion}
                    className="ml-2 px-2 py-1 text-xs text-blue-300 hover:text-white border border-blue-500/30 rounded hover:bg-blue-500/20 transition-colors focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:outline-none"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

            {showMaxWarning && (
              <p className="text-xs text-orange-400 mt-1.5">Maximum slippage is 50%</p>
            )}
            {!showMaxWarning && !suggestion && slippage > 5 && (
              <p className="text-xs text-yellow-400 mt-1.5">High slippage increases risk of front-running</p>
            )}
          </div>

          <div>
            <label htmlFor="deadline-minutes" className="text-xs text-gray-400 mb-2 block">Transaction Deadline</label>
            <div className="flex items-center gap-2">
              <input
                id="deadline-minutes"
                type="text"
                inputMode="numeric"
                placeholder="1–180"
                aria-label="Transaction deadline in minutes"
                value={deadline}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  if (!raw) return
                  const num = parseInt(raw, 10)
                  if (!isNaN(num)) setDeadline(num)
                }}
                className="w-16 py-1.5 px-2 rounded-lg text-sm text-center bg-dark-50 border border-gray-700/50 text-white outline-none focus:border-goodgreen/40 focus-visible:ring-2 focus-visible:ring-goodgreen/50 transition-colors"
              />
              <span className="text-xs text-gray-400">minutes</span>
            </div>
            <p className="text-xs text-gray-600 mt-1">Min 1, max 180 minutes</p>
          </div>
        </div>
      )}
    </div>
  )
}
