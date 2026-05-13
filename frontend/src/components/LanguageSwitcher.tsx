'use client'

import { useState } from 'react'
import { useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Globe, Check } from 'lucide-react'
import { locales, localeNames, type Locale } from '@/i18n/config'

interface LanguageSwitcherProps {
  variant?: 'full' | 'compact'
  className?: string
}

export function LanguageSwitcher({
  variant = 'compact',
  className = ''
}: LanguageSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const currentLocale = useLocale() as Locale
  const router = useRouter()
  const pathname = usePathname()

  const handleLanguageChange = (locale: Locale) => {
    setIsOpen(false)

    // Replace current locale in pathname with new locale
    const segments = pathname.split('/')
    segments[1] = locale
    const newPath = segments.join('/')

    router.push(newPath)
  }

  const currentLocaleName = localeNames[currentLocale]

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-100 hover:bg-dark-50 border border-gray-700/20 transition-colors"
        aria-label="Change language"
      >
        <Globe className="w-4 h-4 text-gray-400" />

        {variant === 'full' && (
          <span className="text-sm text-gray-300">
            {currentLocaleName}
          </span>
        )}

        {variant === 'compact' && (
          <span className="text-sm font-medium text-gray-300 uppercase">
            {currentLocale}
          </span>
        )}

        <ChevronDown
          className={`w-3 h-3 text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute top-full right-0 mt-1 w-48 bg-dark-100 border border-gray-700/20 rounded-xl shadow-xl z-50 overflow-hidden"
            >
              <div className="p-1">
                {locales.map((locale) => {
                  const isSelected = locale === currentLocale

                  return (
                    <button
                      key={locale}
                      onClick={() => handleLanguageChange(locale)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        isSelected
                          ? 'bg-goodgreen/10 text-goodgreen'
                          : 'hover:bg-dark-50 text-gray-300'
                      }`}
                    >
                      <span className="text-xs font-mono text-gray-500 uppercase w-6">
                        {locale}
                      </span>

                      <span className="flex-1 text-sm">
                        {localeNames[locale]}
                      </span>

                      {isSelected && (
                        <Check className="w-4 h-4 text-goodgreen" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-700/20 p-3">
                <p className="text-xs text-gray-500 text-center">
                  Help translate GoodDollar
                </p>
                <a
                  href="https://github.com/GoodDollar/gooddollar-l2/tree/main/frontend/src/messages"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-goodgreen hover:text-goodgreen-400 text-center block mt-1 underline"
                >
                  Contribute translations
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// Compact version for mobile header
export function MobileLanguageSwitcher() {
  return (
    <LanguageSwitcher
      variant="compact"
      className="md:hidden"
    />
  )
}

// Full version for desktop header
export function DesktopLanguageSwitcher() {
  return (
    <LanguageSwitcher
      variant="full"
      className="hidden md:block"
    />
  )
}

// Language preference detection and storage
export function useLanguagePreference() {
  const currentLocale = useLocale() as Locale

  const saveLanguagePreference = (locale: Locale) => {
    try {
      localStorage.setItem('preferred-language', locale)
    } catch {
      // Silently fail if localStorage unavailable
    }
  }

  const getLanguagePreference = (): Locale | null => {
    try {
      const saved = localStorage.getItem('preferred-language') as Locale
      return locales.includes(saved) ? saved : null
    } catch {
      return null
    }
  }

  return {
    currentLocale,
    saveLanguagePreference,
    getLanguagePreference,
  }
}