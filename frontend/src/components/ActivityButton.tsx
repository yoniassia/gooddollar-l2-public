'use client'

import { useState, useRef, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { useTransactionContext } from '@/lib/TransactionContext'
import { TransactionPanel } from './TransactionPanel'

export function ActivityButton() {
  const [open, setOpen] = useState(false)
  const { pendingCount } = useTransactionContext()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Recent activity"
        className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-50 transition-colors focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none"
      >
        <Clock className="w-5 h-5" />
        {pendingCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-goodgreen text-[10px] font-bold text-dark flex items-center justify-center animate-pulse">
            {pendingCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <TransactionPanel onClose={() => setOpen(false)} />
        </>
      )}
    </div>
  )
}
