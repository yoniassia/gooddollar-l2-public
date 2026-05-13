// Centralized error handling utilities for GoodDollar L2
// Provides consistent error reporting and user feedback across the app

'use client'

export type ErrorCategory = 'web3' | 'api' | 'validation' | 'runtime' | 'network' | 'auth'

export interface AppError {
  category: ErrorCategory
  code?: string
  message: string
  details?: unknown
  timestamp: number
  url: string
  userId?: string
}

export interface UserFriendlyError {
  title: string
  message: string
  action?: string
  canRetry?: boolean
}

// Error classification and user-friendly messaging
export class ErrorHandler {
  private static readonly WEB3_ERROR_PATTERNS = [
    // MetaMask/Wallet errors
    { pattern: /user rejected/i, code: 'USER_REJECTED', message: 'Transaction cancelled by user' },
    { pattern: /insufficient funds/i, code: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance for transaction' },
    { pattern: /gas required exceeds allowance/i, code: 'GAS_LIMIT', message: 'Transaction gas limit too low' },
    { pattern: /transaction underpriced/i, code: 'GAS_PRICE_LOW', message: 'Gas price too low, try increasing' },
    { pattern: /network changed/i, code: 'NETWORK_CHANGED', message: 'Please switch to the correct network' },
    { pattern: /wallet_requestPermissions/i, code: 'PERMISSION_DENIED', message: 'Wallet permission required' },

    // Contract errors
    { pattern: /execution reverted/i, code: 'CONTRACT_REVERT', message: 'Transaction failed - contract error' },
    { pattern: /invalid opcode/i, code: 'INVALID_OPCODE', message: 'Smart contract execution error' },
    { pattern: /out of gas/i, code: 'OUT_OF_GAS', message: 'Transaction ran out of gas' },

    // Network errors
    { pattern: /network error/i, code: 'NETWORK_ERROR', message: 'Network connection issue' },
    { pattern: /timeout/i, code: 'TIMEOUT', message: 'Transaction timeout - please try again' },
    { pattern: /nonce too low/i, code: 'NONCE_ERROR', message: 'Transaction nonce error - please refresh wallet' },
  ]

  private static readonly API_ERROR_PATTERNS = [
    { pattern: /fetch.*failed/i, code: 'FETCH_FAILED', message: 'Failed to load data - check connection' },
    { pattern: /cors/i, code: 'CORS_ERROR', message: 'Cross-origin request blocked' },
    { pattern: /rate limit/i, code: 'RATE_LIMITED', message: 'Too many requests - please wait' },
    { pattern: /unauthorized/i, code: 'UNAUTHORIZED', message: 'Authentication required' },
    { pattern: /forbidden/i, code: 'FORBIDDEN', message: 'Access denied' },
    { pattern: /not found/i, code: 'NOT_FOUND', message: 'Requested data not found' },
    { pattern: /server error/i, code: 'SERVER_ERROR', message: 'Server error - our team is investigating' },
  ]

  static categorizeError(error: Error | unknown): ErrorCategory {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    const stack = error instanceof Error ? error.stack?.toLowerCase() || '' : ''

    // Web3 errors
    if (this.WEB3_ERROR_PATTERNS.some(p => p.pattern.test(message)) ||
        stack.includes('wagmi') || stack.includes('viem') || stack.includes('metamask')) {
      return 'web3'
    }

    // API errors
    if (this.API_ERROR_PATTERNS.some(p => p.pattern.test(message)) ||
        message.includes('fetch') || message.includes('api')) {
      return 'api'
    }

    // Network errors
    if (message.includes('network') || message.includes('offline') ||
        message.includes('connection') || message.includes('dns')) {
      return 'network'
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid') ||
        message.includes('required') || message.includes('format')) {
      return 'validation'
    }

    // Auth errors
    if (message.includes('auth') || message.includes('login') ||
        message.includes('token') || message.includes('session')) {
      return 'auth'
    }

    return 'runtime'
  }

  static getErrorCode(error: Error | unknown): string | undefined {
    const message = error instanceof Error ? error.message : String(error)

    // Web3 error codes
    for (const pattern of this.WEB3_ERROR_PATTERNS) {
      if (pattern.pattern.test(message)) {
        return pattern.code
      }
    }

    // API error codes
    for (const pattern of this.API_ERROR_PATTERNS) {
      if (pattern.pattern.test(message)) {
        return pattern.code
      }
    }

    return undefined
  }

  static getUserFriendlyMessage(error: Error | unknown): UserFriendlyError {
    const category = this.categorizeError(error)
    const message = error instanceof Error ? error.message : String(error)

    // Check for specific Web3 error patterns
    for (const pattern of this.WEB3_ERROR_PATTERNS) {
      if (pattern.pattern.test(message)) {
        return {
          title: 'Transaction Error',
          message: pattern.message,
          canRetry: pattern.code !== 'USER_REJECTED',
          action: this.getActionForErrorCode(pattern.code),
        }
      }
    }

    // Check for specific API error patterns
    for (const pattern of this.API_ERROR_PATTERNS) {
      if (pattern.pattern.test(message)) {
        return {
          title: 'Connection Error',
          message: pattern.message,
          canRetry: !['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(pattern.code),
          action: this.getActionForErrorCode(pattern.code),
        }
      }
    }

    // Fallback messages by category
    switch (category) {
      case 'web3':
        return {
          title: 'Wallet Error',
          message: 'There was an issue with your wallet connection. Please check your wallet and try again.',
          canRetry: true,
          action: 'Check wallet connection',
        }

      case 'api':
        return {
          title: 'Connection Error',
          message: 'Unable to load data. Please check your internet connection and try again.',
          canRetry: true,
          action: 'Check connection',
        }

      case 'network':
        return {
          title: 'Network Error',
          message: 'Network connection issue. Please check your internet and try again.',
          canRetry: true,
          action: 'Check network',
        }

      case 'validation':
        return {
          title: 'Input Error',
          message: 'Please check your input and try again.',
          canRetry: false,
          action: 'Correct input',
        }

      case 'auth':
        return {
          title: 'Authentication Error',
          message: 'Please reconnect your wallet to continue.',
          canRetry: true,
          action: 'Reconnect wallet',
        }

      default:
        return {
          title: 'Unexpected Error',
          message: 'Something unexpected happened. Our team has been notified.',
          canRetry: true,
        }
    }
  }

  private static getActionForErrorCode(code: string): string | undefined {
    const actions: Record<string, string> = {
      'USER_REJECTED': 'Try transaction again',
      'INSUFFICIENT_FUNDS': 'Add more funds',
      'GAS_LIMIT': 'Increase gas limit',
      'GAS_PRICE_LOW': 'Increase gas price',
      'NETWORK_CHANGED': 'Switch network',
      'RATE_LIMITED': 'Wait and retry',
      'UNAUTHORIZED': 'Connect wallet',
      'NONCE_ERROR': 'Refresh wallet',
    }

    return actions[code]
  }

  static createError(
    category: ErrorCategory,
    message: string,
    code?: string,
    details?: unknown
  ): AppError {
    return {
      category,
      code,
      message,
      details,
      timestamp: Date.now(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      userId: this.getUserId(),
    }
  }

  static logError(error: AppError): void {
    // Console logging in development
    if (process.env.NODE_ENV === 'development') {
      console.group(`🚨 Error [${error.category.toUpperCase()}]`)
      console.error('Message:', error.message)
      console.error('Code:', error.code)
      console.error('Details:', error.details)
      console.error('URL:', error.url)
      console.groupEnd()
    }

    // Store in localStorage for debugging
    this.storeErrorLocally(error)

    // Report to external services
    this.reportToServices(error)
  }

  private static storeErrorLocally(error: AppError): void {
    try {
      const errors = JSON.parse(localStorage.getItem('app_errors') || '[]')
      errors.unshift(error)

      // Keep last 20 errors
      const recentErrors = errors.slice(0, 20)
      localStorage.setItem('app_errors', JSON.stringify(recentErrors))
    } catch {
      // Silently fail if localStorage unavailable
    }
  }

  private static reportToServices(error: AppError): void {
    // Sentry integration
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(new Error(error.message), {
        tags: {
          category: error.category,
          code: error.code,
        },
        contexts: {
          error: error,
        },
      })
    }

    // Custom error reporting API
    if (typeof window !== 'undefined') {
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(error),
      }).catch(() => {
        // Silently fail if error reporting fails
      })
    }
  }

  private static getUserId(): string | undefined {
    // Get user ID from wallet address or session if available
    try {
      const walletAddress = localStorage.getItem('wallet_address')
      return walletAddress || undefined
    } catch {
      return undefined
    }
  }

  // React hook for error handling
  static useErrorHandler() {
    return {
      handleError: (error: Error | unknown, context?: string) => {
        const appError = this.createError(
          this.categorizeError(error),
          error instanceof Error ? error.message : String(error),
          this.getErrorCode(error),
          { context, error }
        )

        this.logError(appError)
        return this.getUserFriendlyMessage(error)
      },

      handleWeb3Error: (error: Error | unknown, action: string) => {
        const appError = this.createError(
          'web3',
          error instanceof Error ? error.message : String(error),
          this.getErrorCode(error),
          { action, error }
        )

        this.logError(appError)
        return this.getUserFriendlyMessage(error)
      },

      handleApiError: (error: Error | unknown, endpoint: string) => {
        const appError = this.createError(
          'api',
          error instanceof Error ? error.message : String(error),
          this.getErrorCode(error),
          { endpoint, error }
        )

        this.logError(appError)
        return this.getUserFriendlyMessage(error)
      },
    }
  }
}

// React hook for error handling
export function useErrorHandler() {
  return ErrorHandler.useErrorHandler()
}

// Specific error handlers for common patterns
export class Web3ErrorHandler {
  static handleTransactionError(error: Error | unknown): UserFriendlyError {
    return ErrorHandler.getUserFriendlyMessage(error)
  }

  static handleWalletConnectionError(error: Error | unknown): UserFriendlyError {
    const userError = ErrorHandler.getUserFriendlyMessage(error)

    if (userError.title === 'Wallet Error') {
      return {
        ...userError,
        title: 'Wallet Connection Failed',
        message: 'Could not connect to your wallet. Please ensure it is unlocked and try again.',
        action: 'Unlock wallet and retry',
      }
    }

    return userError
  }

  static handleContractError(error: Error | unknown, contractName: string): UserFriendlyError {
    const userError = ErrorHandler.getUserFriendlyMessage(error)

    return {
      ...userError,
      title: `${contractName} Contract Error`,
      message: `Transaction failed on ${contractName} contract. ${userError.message}`,
    }
  }
}

export class ApiErrorHandler {
  static handlePriceFeedError(error: Error | unknown): UserFriendlyError {
    return {
      title: 'Price Data Unavailable',
      message: 'Unable to load current prices. Trading may be impacted.',
      canRetry: true,
      action: 'Refresh price data',
    }
  }

  static handleQuoteError(error: Error | unknown): UserFriendlyError {
    return {
      title: 'Quote Unavailable',
      message: 'Unable to get swap quote. Please try again in a moment.',
      canRetry: true,
      action: 'Retry quote',
    }
  }

  static handleBalanceError(error: Error | unknown): UserFriendlyError {
    return {
      title: 'Balance Data Unavailable',
      message: 'Unable to load wallet balance. Please refresh to try again.',
      canRetry: true,
      action: 'Refresh balance',
    }
  }
}