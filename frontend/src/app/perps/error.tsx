'use client'

import Link from 'next/link'

interface PerpsErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function PerpsError({ reset }: PerpsErrorProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
        <svg className="h-10 w-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
          />
        </svg>
      </div>

      <h1 className="mb-3 text-3xl font-bold text-white">Something Went Wrong</h1>
      <p className="mb-8 max-w-xs text-sm text-gray-400">Unable to load trading terminal</p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-goodgreen px-6 py-3 font-semibold text-white transition-colors hover:bg-goodgreen-600 active:scale-[0.98]"
        >
          Try Again
        </button>
        <Link
          href="/perps"
          className="rounded-xl border border-gray-700/30 bg-dark-50 px-6 py-3 font-semibold text-white transition-colors hover:border-gray-600"
        >
          Perpetual Futures
        </Link>
      </div>
    </div>
  )
}
