'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ChartErrorBoundaryProps {
  children: ReactNode
}

interface ChartErrorBoundaryState {
  hasError: boolean
  retryKey: number
}

export class ChartErrorBoundary extends Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  state: ChartErrorBoundaryState = {
    hasError: false,
    retryKey: 0,
  }

  static getDerivedStateFromError(): Partial<ChartErrorBoundaryState> {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Chart or dynamic import failure — inline fallback only
  }

  handleRetry = () => {
    this.setState(prev => ({
      hasError: false,
      retryKey: prev.retryKey + 1,
    }))
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center rounded-xl border border-gray-700/20 bg-dark-100 px-4 py-8 text-center"
          style={{ minHeight: 200 }}
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-gray-700/20 bg-dark-50/50">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="mb-4 text-sm text-gray-400">Chart unavailable</p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-xl bg-goodgreen px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-goodgreen-600 active:scale-[0.98]"
          >
            Retry
          </button>
        </div>
      )
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>
  }
}
