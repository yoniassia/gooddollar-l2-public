'use client'

import { useState, useRef, useEffect, useCallback, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { TokenIcon } from './TokenIcon'
import { TOKENS, POPULAR_TOKENS, type Token } from '@/lib/tokens'

interface TokenSelectorModalProps {
  open: boolean
  onClose: () => void
  onSelect: (token: Token) => void
  selected: Token
  exclude?: string
}

export function TokenSelectorModal({ open, onClose, onSelect, selected, exclude }: TokenSelectorModalProps) {
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const trimmedQuery = query.trim()

  const filtered = useMemo(() => TOKENS.filter(t => {
    if (!trimmedQuery) return true
    const q = trimmedQuery.toLowerCase()
    return t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
  }), [trimmedQuery])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlightedIndex(0)
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  const handleSelect = useCallback((token: Token) => {
    onSelect(token)
    onClose()
  }, [onSelect, onClose])

  const handleKeyDown = useCallback((e: ReactKeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[highlightedIndex]) handleSelect(filtered[highlightedIndex])
        break
    }
  }, [filtered, highlightedIndex, handleSelect])

  useEffect(() => {
    if (!listRef.current) return
    const highlighted = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`)
    highlighted?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  if (!open) return null

  const popularFiltered = POPULAR_TOKENS.filter(t => t.symbol !== exclude)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Select a token">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-[420px] max-h-[85vh] sm:max-h-[600px] bg-dark-100 border border-gray-700/40 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom sm:fade-in duration-200"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-lg font-semibold text-white">Select a token</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-dark-50 transition-colors focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-3">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by name or symbol"
            aria-label="Search tokens by name or symbol"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-dark/80 border border-gray-700/30 text-white placeholder:text-gray-500 text-sm outline-none focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:border-goodgreen/30"
          />
        </div>

        {!trimmedQuery && (
          <div className="px-5 pb-3 flex flex-wrap gap-2">
            {popularFiltered.map(token => (
              <button
                key={token.symbol}
                onClick={() => handleSelect(token)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  token.symbol === selected.symbol
                    ? 'border-goodgreen/50 bg-goodgreen/10 text-goodgreen'
                    : 'border-gray-700/40 bg-dark-50/50 text-white hover:border-gray-600 hover:bg-dark-50'
                }`}
              >
                <TokenIcon symbol={token.symbol} size={18} />
                <span className="font-medium">{token.symbol}</span>
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-gray-700/20" />

        <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 py-2" role="listbox">
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-500 text-sm">No tokens found</div>
          ) : (
            filtered.map((token, index) => {
              const isSelected = token.symbol === selected.symbol
              const isExcluded = token.symbol === exclude
              return (
                <button
                  key={token.symbol}
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  onClick={() => !isExcluded && handleSelect(token)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full flex items-center gap-3 px-5 py-3 transition-colors ${
                    isExcluded
                      ? 'opacity-30 cursor-not-allowed'
                      : index === highlightedIndex
                        ? 'bg-goodgreen/10'
                        : 'hover:bg-dark-50/60'
                  }`}
                  disabled={isExcluded}
                >
                  <TokenIcon symbol={token.symbol} size={36} />
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-semibold text-white text-sm">{token.symbol}</div>
                    <div className="text-xs text-gray-400 truncate">{token.name}</div>
                  </div>
                  {isSelected && (
                    <svg className="w-5 h-5 text-goodgreen shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default TokenSelectorModal
