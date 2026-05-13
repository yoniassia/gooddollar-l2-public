// Internationalization utility functions for GoodDollar L2
// Provides helpers for common i18n patterns in DeFi applications

import { useTranslations, useFormatter } from 'next-intl'
import { localeConfigs, type Locale } from '@/i18n/config'

// Translation hooks for different sections
export function useNavTranslations() {
  return useTranslations('navigation')
}

export function useCommonTranslations() {
  return useTranslations('common')
}

export function useWalletTranslations() {
  return useTranslations('wallet')
}

export function useSwapTranslations() {
  return useTranslations('swap')
}

export function useTradingTranslations() {
  return useTranslations('trading')
}

export function usePortfolioTranslations() {
  return useTranslations('portfolio')
}

export function useBridgeTranslations() {
  return useTranslations('bridge')
}

export function useErrorTranslations() {
  return useTranslations('errors')
}

export function useUBITranslations() {
  return useTranslations('ubi')
}

// Specialized formatting hooks for DeFi applications
export function useDeFiFormatter() {
  const format = useFormatter()

  return {
    // Format cryptocurrency amounts with appropriate precision
    formatCryptoAmount: (amount: number, symbol?: string, options?: {
      minimumFractionDigits?: number
      maximumFractionDigits?: number
      notation?: 'standard' | 'compact'
    }) => {
      const defaultOptions = {
        minimumFractionDigits: 0,
        maximumFractionDigits: symbol === 'BTC' ? 8 : 6,
        notation: 'standard' as const,
        ...options,
      }

      const formatted = format.number(amount, defaultOptions)
      return symbol ? `${formatted} ${symbol}` : formatted
    },

    // Format fiat currency amounts
    formatCurrency: (amount: number, currency = 'USD') => {
      return format.number(amount, {
        style: 'currency',
        currency,
      })
    },

    // Format percentage changes with colors
    formatPercentage: (value: number, options?: {
      showSign?: boolean
      precision?: number
    }) => {
      const { showSign = true, precision = 2 } = options || {}

      const formatted = format.number(value / 100, {
        style: 'percent',
        maximumFractionDigits: precision,
        signDisplay: showSign ? 'exceptZero' : 'auto',
      })

      return formatted
    },

    // Format large numbers with K/M/B notation
    formatCompactNumber: (value: number, options?: {
      currency?: string
      precision?: number
    }) => {
      const { currency, precision = 2 } = options || {}

      const baseOptions = {
        notation: 'compact' as const,
        maximumFractionDigits: precision,
      }

      const formatOptions = currency
        ? { ...baseOptions, style: 'currency' as const, currency }
        : baseOptions

      return format.number(value, formatOptions)
    },

    // Format gas prices and fees
    formatGasPrice: (gweiAmount: number) => {
      return `${format.number(gweiAmount, { maximumFractionDigits: 2 })} Gwei`
    },

    // Format time durations
    formatDuration: (seconds: number) => {
      const minutes = Math.floor(seconds / 60)
      const hours = Math.floor(minutes / 60)
      const days = Math.floor(hours / 24)

      if (days > 0) {
        return `${days} day${days !== 1 ? 's' : ''}`
      } else if (hours > 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''}`
      } else if (minutes > 0) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`
      } else {
        return `${seconds} second${seconds !== 1 ? 's' : ''}`
      }
    },

    // Format blockchain timestamps
    formatTimestamp: (timestamp: number, style: 'short' | 'long' = 'short') => {
      const date = new Date(timestamp * 1000)

      return format.dateTime(date, style)
    },

    // Format addresses with truncation
    formatAddress: (address: string, options?: {
      startChars?: number
      endChars?: number
    }) => {
      const { startChars = 6, endChars = 4 } = options || {}

      if (address.length <= startChars + endChars + 3) {
        return address
      }

      return `${address.slice(0, startChars)}...${address.slice(-endChars)}`
    },

    // Format transaction hashes
    formatTxHash: (hash: string) => {
      return `${hash.slice(0, 10)}...${hash.slice(-8)}`
    },
  }
}

// Error message translation with fallbacks
export function useErrorMessage() {
  const t = useErrorTranslations()

  return (errorKey: string, fallback?: string) => {
    try {
      return t(errorKey as any)
    } catch {
      return fallback || 'An error occurred'
    }
  }
}

// Dynamic translation for user-generated content
export function useDynamicTranslation() {
  const format = useFormatter()

  return {
    // Translate token names and symbols
    translateToken: (symbol: string, name: string) => {
      // For major tokens, we might have translations
      // For now, return as-is but this could be expanded
      return { symbol, name }
    },

    // Translate network names
    translateNetwork: (networkName: string) => {
      const networkTranslations: Record<string, string> = {
        'Ethereum': 'Ethereum',
        'Polygon': 'Polygon',
        'Arbitrum': 'Arbitrum',
        'Optimism': 'Optimism',
        'GoodDollar L2': 'GoodDollar L2',
      }

      return networkTranslations[networkName] || networkName
    },

    // Format numbers according to locale
    formatLocaleNumber: (number: number, locale: Locale) => {
      const config = localeConfigs[locale]
      return new Intl.NumberFormat(locale, config.numberFormat).format(number)
    },
  }
}

// Color-coded percentage changes
export function usePercentageDisplay() {
  const { formatPercentage } = useDeFiFormatter()

  return (value: number) => {
    const formatted = formatPercentage(value)
    const colorClass = value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-gray-400'

    return {
      formatted,
      colorClass,
      isPositive: value > 0,
      isNegative: value < 0,
      isNeutral: value === 0,
    }
  }
}

// URL localization helpers
export function useLocalizedRouting() {
  return {
    // Create localized URLs
    localizeUrl: (path: string, locale: Locale) => {
      return `/${locale}${path}`
    },

    // Extract locale from URL
    extractLocaleFromUrl: (url: string): Locale | null => {
      const segments = url.split('/')
      const potentialLocale = segments[1] as Locale

      return potentialLocale && localeConfigs[potentialLocale]
        ? potentialLocale
        : null
    },

    // Remove locale from path
    delocalizeUrl: (url: string): string => {
      const segments = url.split('/')
      const potentialLocale = segments[1] as Locale

      if (potentialLocale && localeConfigs[potentialLocale]) {
        segments.splice(1, 1)
      }

      return segments.join('/') || '/'
    },
  }
}

// Validation helpers for i18n content
export function validateTranslationKey(key: string, section: string): boolean {
  try {
    // This would check if a translation key exists
    // For now, just validate format
    return key.length > 0 && !key.includes('..')
  } catch {
    return false
  }
}

// Helper to get browser language preference
export function getBrowserLanguage(): Locale {
  if (typeof window === 'undefined') return 'en'

  const browserLang = navigator.language.split('-')[0] as Locale
  const supportedLang = localeConfigs[browserLang] ? browserLang : 'en'

  return supportedLang
}

// RTL text direction helper
export function useTextDirection() {
  return {
    isRTL: (locale: Locale): boolean => {
      return ['ar', 'he', 'fa'].includes(locale)
    },

    getTextDirection: (locale: Locale): 'ltr' | 'rtl' => {
      return ['ar', 'he', 'fa'].includes(locale) ? 'rtl' : 'ltr'
    },
  }
}