'use client'

import { useState, useEffect, useRef } from 'react'

const feeRows = [
  { label: 'UBI Pool', pct: '33%', color: 'text-goodgreen' },
  { label: 'Protocol', pct: '17%', color: 'text-gray-300' },
  { label: 'Liquidity Providers', pct: '50%', color: 'text-gray-300' },
]

export function FeeBreakdownBadge() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs bg-goodgreen/10 text-goodgreen px-2.5 py-1 rounded-lg hover:bg-goodgreen/20 transition-colors focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none"
        aria-expanded={open}
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
        </svg>
        0.1% funds UBI
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 p-3 rounded-xl bg-dark-50 border border-gray-700/50 shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">
            0.3% total fee split
          </p>
          <div className="space-y-2">
            {feeRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-xs text-gray-300">{row.label}</span>
                <span className={`text-xs font-semibold ${row.color}`}>{row.pct}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 pt-2 border-t border-gray-700/30">
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Every swap automatically funds universal basic income for verified humans worldwide.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
