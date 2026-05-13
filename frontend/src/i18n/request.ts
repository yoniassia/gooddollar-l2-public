// next-intl configuration for request-based internationalization

import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, locales, type Locale } from './config'

export default getRequestConfig(async ({ locale }) => {
  // Pages are not nested under /[locale], so locale may be undefined on the root
  // route. Fall back to English instead of throwing notFound(), which made the
  // whole app return HTTP 404 in production.
  const effectiveLocale: Locale = locales.includes(locale as Locale)
    ? (locale as Locale)
    : defaultLocale

  return {
    locale: effectiveLocale,
    messages: (await import(`../messages/${effectiveLocale}.json`)).default,
    timeZone: 'UTC', // Use UTC for crypto/trading timestamps
    formats: {
      dateTime: {
        short: {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        },
        long: {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
        },
      },
      number: {
        precise: {
          maximumFractionDigits: 8, // For crypto precision
        },
        currency: {
          style: 'currency',
          currency: 'USD',
        },
        percentage: {
          style: 'percent',
          maximumFractionDigits: 2,
        },
      },
    },
  }
})