'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'ubi-banner-dismissed'

export function UBIBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) !== 'true') {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem(STORAGE_KEY, 'true')
  }

  return (
    <div className="w-full bg-goodgreen/[0.06] border-b border-goodgreen/10">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-1.5">
        <p className="text-xs text-gray-300 flex-1 text-center">
          <span className="text-goodgreen mr-1.5">&#9829;</span>
          <span className="text-goodgreen font-medium">$2.4M</span>
          {' '}distributed to{' '}
          <span className="text-goodgreen font-medium">640K+</span>
          {' '}people through UBI — funded by your trades
        </p>
        <button
          onClick={dismiss}
          aria-label="Dismiss UBI banner"
          className="ml-3 shrink-0 p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
