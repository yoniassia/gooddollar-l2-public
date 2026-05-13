// Internationalization configuration for GoodDollar L2
// Supports multiple languages for global DeFi platform expansion

export const locales = [
  'en', // English (default)
  'es', // Spanish
  'fr', // French
  'pt', // Portuguese
  'zh', // Chinese (Simplified)
  'ja', // Japanese
  'ko', // Korean
  'de', // German
  'it', // Italian
  'ru', // Russian
  'ar', // Arabic
  'hi', // Hindi
] as const

export type Locale = (typeof locales)[number]

// Default locale (fallback)
export const defaultLocale: Locale = 'en'

// Locale display names for language switcher
export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  it: 'Italiano',
  ru: 'Русский',
  ar: 'العربية',
  hi: 'हिन्दी',
}

// RTL languages
export const rtlLocales: Locale[] = ['ar']

// Number/currency formatting configs
export const localeConfigs: Record<Locale, {
  currency: string
  numberFormat: Intl.NumberFormatOptions
  dateFormat: Intl.DateTimeFormatOptions
}> = {
  en: {
    currency: 'USD',
    numberFormat: { notation: 'compact', maximumFractionDigits: 2 },
    dateFormat: { year: 'numeric', month: 'short', day: 'numeric' },
  },
  es: {
    currency: 'EUR',
    numberFormat: { notation: 'compact', maximumFractionDigits: 2 },
    dateFormat: { year: 'numeric', month: 'short', day: 'numeric' },
  },
  fr: {
    currency: 'EUR',
    numberFormat: { notation: 'compact', maximumFractionDigits: 2 },
    dateFormat: { year: 'numeric', month: 'short', day: 'numeric' },
  },
  pt: {
    currency: 'BRL',
    numberFormat: { notation: 'compact', maximumFractionDigits: 2 },
    dateFormat: { year: 'numeric', month: 'short', day: 'numeric' },
  },
  zh: {
    currency: 'CNY',
    numberFormat: { notation: 'compact', maximumFractionDigits: 2 },
    dateFormat: { year: 'numeric', month: 'long', day: 'numeric' },
  },
  ja: {
    currency: 'JPY',
    numberFormat: { notation: 'compact', maximumFractionDigits: 0 },
    dateFormat: { year: 'numeric', month: 'long', day: 'numeric' },
  },
  ko: {
    currency: 'KRW',
    numberFormat: { notation: 'compact', maximumFractionDigits: 0 },
    dateFormat: { year: 'numeric', month: 'long', day: 'numeric' },
  },
  de: {
    currency: 'EUR',
    numberFormat: { notation: 'compact', maximumFractionDigits: 2 },
    dateFormat: { year: 'numeric', month: 'short', day: 'numeric' },
  },
  it: {
    currency: 'EUR',
    numberFormat: { notation: 'compact', maximumFractionDigits: 2 },
    dateFormat: { year: 'numeric', month: 'short', day: 'numeric' },
  },
  ru: {
    currency: 'RUB',
    numberFormat: { notation: 'compact', maximumFractionDigits: 2 },
    dateFormat: { year: 'numeric', month: 'short', day: 'numeric' },
  },
  ar: {
    currency: 'AED',
    numberFormat: { notation: 'compact', maximumFractionDigits: 2 },
    dateFormat: { year: 'numeric', month: 'short', day: 'numeric' },
  },
  hi: {
    currency: 'INR',
    numberFormat: { notation: 'compact', maximumFractionDigits: 2 },
    dateFormat: { year: 'numeric', month: 'short', day: 'numeric' },
  },
}

// Priority languages for initial launch
export const launchLocales: Locale[] = ['en', 'es', 'pt', 'zh', 'fr']

// Detect browser locale and map to supported locale
export function detectLocale(): Locale {
  if (typeof window === 'undefined') return defaultLocale

  const browserLang = navigator.language.split('-')[0] as Locale
  return locales.includes(browserLang) ? browserLang : defaultLocale
}