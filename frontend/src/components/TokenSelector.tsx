'use client'

import { useState, useCallback, lazy, Suspense } from 'react'
import { TokenIcon } from './TokenIcon'
import { TOKENS as ALL_TOKENS, type Token } from '@/lib/tokens'

const TokenSelectorModal = lazy(() => import('./TokenSelectorModal'))

export type { Token }
export const TOKENS = ALL_TOKENS

interface TokenSelectorProps {
  selected: Token
  onSelect: (token: Token) => void
  exclude?: string
}

export function TokenSelector({ selected, onSelect, exclude }: TokenSelectorProps) {
  const [open, setOpen] = useState(false)

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  return (
    <>
      <button
        onClick={handleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-dark-50 hover:bg-dark-50/80 border border-gray-700/50 transition-colors min-w-[120px] focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none"
      >
        <TokenIcon symbol={selected.symbol} size={20} />
        <span className="font-semibold text-white">{selected.symbol}</span>
        <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <Suspense fallback={<div className="fixed inset-0 z-50" />}>
          <TokenSelectorModal
            open={open}
            onClose={handleClose}
            onSelect={onSelect}
            selected={selected}
            exclude={exclude}
          />
        </Suspense>
      )}
    </>
  )
}
