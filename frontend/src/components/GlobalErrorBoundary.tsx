'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCcw, AlertTriangle, Home, MessageCircle } from 'lucide-react'

interface GlobalErrorBoundaryProps {
  children: ReactNode
}

interface GlobalErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  retryCount: number
}

type ErrorCategory = 'web3' | 'api' | 'runtime' | 'import' | 'unknown'

interface ErrorReport {
  category: ErrorCategory
  message: string
  stack?: string
  url: string
  userAgent: string
  timestamp: number
  retryCount: number
  userId?: string
}

export class GlobalErrorBoundary extends Component<GlobalErrorBoundaryProps, GlobalErrorBoundaryState> {
  private maxRetries = 3
  private retryTimeouts: NodeJS.Timeout[] = []

  constructor(props: GlobalErrorBoundaryProps) {
    super(props)

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<GlobalErrorBoundaryState> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })

    // Log error and report to monitoring service
    this.logError(error, errorInfo)

    // Attempt automatic retry for certain error types
    if (this.shouldAutoRetry(error) && this.state.retryCount < this.maxRetries) {
      this.scheduleRetry()
    }
  }

  componentWillUnmount() {
    // Clean up any pending retry timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout))
  }

  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase()
    const stack = error.stack?.toLowerCase() || ''

    if (message.includes('wallet') || message.includes('web3') ||
        message.includes('transaction') || message.includes('ethereum') ||
        stack.includes('wagmi') || stack.includes('viem')) {
      return 'web3'
    }

    if (message.includes('fetch') || message.includes('network') ||
        message.includes('api') || message.includes('cors')) {
      return 'api'
    }

    if (message.includes('loading chunk') || message.includes('import') ||
        message.includes('module') || stack.includes('webpack')) {
      return 'import'
    }

    if (message.includes('script error') || message.includes('non-error promise rejection')) {
      return 'runtime'
    }

    return 'unknown'
  }

  private logError(error: Error, errorInfo: ErrorInfo) {
    const category = this.categorizeError(error)

    const errorReport: ErrorReport = {
      category,
      message: error.message,
      stack: error.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: Date.now(),
      retryCount: this.state.retryCount,
      // userId could be added if user identification is available
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group(`🚨 Global Error Boundary - ${category.toUpperCase()}`)
      console.error('Error:', error)
      console.error('Component Stack:', errorInfo.componentStack)
      console.error('Error Report:', errorReport)
      console.groupEnd()
    }

    // Report to external error tracking service (Sentry, LogRocket, etc.)
    this.reportToMonitoring(errorReport)

    // Store recent errors in localStorage for debugging
    this.storeErrorLocally(errorReport)
  }

  private reportToMonitoring(errorReport: ErrorReport) {
    // Integration with external error monitoring services

    // Example: Sentry integration
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(this.state.error, {
        tags: {
          category: errorReport.category,
          retryCount: errorReport.retryCount,
        },
        contexts: {
          errorReport,
        },
      })
    }

    // Example: Custom API reporting
    try {
      fetch('/api/error-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorReport),
      }).catch(() => {
        // Silently fail if error reporting fails
      })
    } catch {
      // Silently fail if error reporting fails
    }
  }

  private storeErrorLocally(errorReport: ErrorReport) {
    try {
      const recentErrors = JSON.parse(localStorage.getItem('recentErrors') || '[]')
      recentErrors.unshift(errorReport)

      // Keep only last 10 errors
      const limitedErrors = recentErrors.slice(0, 10)
      localStorage.setItem('recentErrors', JSON.stringify(limitedErrors))
    } catch {
      // Silently fail if localStorage is not available
    }
  }

  private shouldAutoRetry(error: Error): boolean {
    const category = this.categorizeError(error)

    // Auto-retry for network/import errors but not for runtime errors
    return category === 'api' || category === 'import'
  }

  private scheduleRetry() {
    const delay = Math.min(1000 * Math.pow(2, this.state.retryCount), 10000) // Exponential backoff, max 10s

    const timeout = setTimeout(() => {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1,
      }))
    }, delay)

    this.retryTimeouts.push(timeout)
  }

  private handleManualRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    })

    // Reload the page as a last resort
    window.location.reload()
  }

  private handleReportIssue = () => {
    const errorDetails = {
      message: this.state.error?.message,
      stack: this.state.error?.stack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    }

    const issueBody = encodeURIComponent(`
## Error Details
- **Message**: ${errorDetails.message}
- **URL**: ${errorDetails.url}
- **Timestamp**: ${errorDetails.timestamp}

## Additional Context
Please describe what you were doing when this error occurred:

\`\`\`
${errorDetails.stack}
\`\`\`
    `.trim())

    window.open(`https://github.com/GoodDollar/gooddollar-l2/issues/new?title=Frontend%20Error&body=${issueBody}`, '_blank')
  }

  private getErrorDisplayInfo() {
    if (!this.state.error) return null

    const category = this.categorizeError(this.state.error)

    switch (category) {
      case 'web3':
        return {
          title: 'Wallet Connection Issue',
          description: 'There was a problem with your wallet connection. Please check your wallet and try again.',
          icon: <AlertTriangle className="w-8 h-8 text-orange-500" />,
          canRetry: true,
        }

      case 'api':
        return {
          title: 'Network Connection Issue',
          description: 'Unable to connect to the server. Please check your internet connection and try again.',
          icon: <AlertTriangle className="w-8 h-8 text-blue-500" />,
          canRetry: true,
        }

      case 'import':
        return {
          title: 'Loading Issue',
          description: 'Failed to load part of the application. This usually resolves with a refresh.',
          icon: <RefreshCcw className="w-8 h-8 text-purple-500" />,
          canRetry: true,
        }

      default:
        return {
          title: 'Application Error',
          description: 'Something unexpected happened. Our team has been notified.',
          icon: <AlertTriangle className="w-8 h-8 text-red-500" />,
          canRetry: true,
        }
    }
  }

  render() {
    if (this.state.hasError) {
      const errorInfo = this.getErrorDisplayInfo()

      return (
        <div className="min-h-screen flex items-center justify-center bg-dark text-white p-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-6 flex justify-center">
              {errorInfo?.icon}
            </div>

            <h1 className="text-2xl font-bold mb-2 text-white">
              {errorInfo?.title || 'Something went wrong'}
            </h1>

            <p className="text-gray-400 mb-8 leading-relaxed">
              {errorInfo?.description || 'An unexpected error occurred.'}
            </p>

            <div className="space-y-3">
              {errorInfo?.canRetry && (
                <button
                  onClick={this.handleManualRetry}
                  className="w-full flex items-center justify-center gap-2 bg-goodgreen hover:bg-goodgreen-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Try Again
                </button>
              )}

              <button
                onClick={() => window.location.href = '/'}
                className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
              >
                <Home className="w-4 h-4" />
                Go Home
              </button>

              <button
                onClick={this.handleReportIssue}
                className="w-full flex items-center justify-center gap-2 border border-gray-600 hover:bg-gray-800 text-gray-300 px-6 py-3 rounded-xl font-semibold transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Report Issue
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-8 text-left">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-300">
                  Debug Information
                </summary>
                <pre className="mt-2 p-4 bg-gray-900 rounded-lg text-xs text-red-400 overflow-auto max-h-40">
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            {this.state.retryCount > 0 && (
              <p className="mt-4 text-sm text-gray-500">
                Retry attempt: {this.state.retryCount}/{this.maxRetries}
              </p>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}