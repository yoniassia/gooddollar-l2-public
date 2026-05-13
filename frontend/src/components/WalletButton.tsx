'use client'

import { useState } from 'react'

export function WalletButton() {
  const [showToast, setShowToast] = useState(false)

  const handleClick = () => {
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  return (
    <>
      <button
        onClick={handleClick}
        aria-label="Connect Wallet"
        className="px-2.5 sm:px-4 py-2 rounded-xl bg-goodgreen/20 border border-goodgreen/40 text-goodgreen text-sm font-medium hover:bg-goodgreen/30 transition-colors whitespace-nowrap"
      >
        <span className="inline-flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <span className="hidden sm:inline">Connect Wallet</span>
        </span>
      </button>
      {showToast && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-xl bg-dark-50 border border-goodgreen/30 text-sm text-gray-200 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200"
          role="status"
          aria-live="polite"
        >
          🚀 L2 testnet launching soon — wallet connect coming!
        </div>
      )}
    </>
  )
}
