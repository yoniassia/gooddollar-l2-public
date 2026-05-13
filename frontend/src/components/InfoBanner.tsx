'use client'

import { useState, useEffect } from 'react'

interface InfoBannerProps {
  title: string
  description: string
  storageKey: string
}

export function InfoBanner({ title, description, storageKey }: InfoBannerProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) !== 'true') {
        setVisible(true)
      }
    } catch {
      setVisible(true)
    }
  }, [storageKey])

  if (!visible) return null

  const handleDismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(storageKey, 'true')
    } catch {}
  }

  return (
    <div className="w-full mb-4 p-3 sm:p-4 rounded-xl bg-goodgreen/5 border border-goodgreen/20 flex items-start gap-3">
      <div className="w-5 h-5 mt-0.5 shrink-0 text-goodgreen">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-goodgreen mb-0.5">{title}</p>
        <p className="text-xs text-gray-400 leading-relaxed">{description}</p>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-dark-50 transition-colors shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
