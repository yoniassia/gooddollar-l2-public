'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface PredictErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function PredictError({ reset }: PredictErrorProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
        <svg className="h-10 w-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      <h1 className="mb-3 text-3xl font-bold text-white">Something Went Wrong</h1>
      <p className="mb-8 max-w-xs text-sm text-gray-400">Unable to load prediction markets</p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset} size="lg">
          Try Again
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href="/predict">
            Prediction Markets
          </Link>
        </Button>
      </div>
    </div>
  )
}
