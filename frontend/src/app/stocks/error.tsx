'use client'

import Link from 'next/link'

interface StocksErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function StocksError({ reset }: StocksErrorProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
        <svg className="h-10 w-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          />
        </svg>
      </div>

      <h1 className="mb-3 text-3xl font-bold text-white">Something Went Wrong</h1>
      <p className="mb-8 max-w-xs text-sm text-gray-400">Unable to load stock data</p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-goodgreen px-6 py-3 font-semibold text-white transition-colors hover:bg-goodgreen-600 active:scale-[0.98]"
        >
          Try Again
        </button>
        <Link
          href="/stocks"
          className="rounded-xl border border-gray-700/30 bg-dark-50 px-6 py-3 font-semibold text-white transition-colors hover:border-gray-600"
        >
          Stocks
        </Link>
      </div>
    </div>
  )
}
