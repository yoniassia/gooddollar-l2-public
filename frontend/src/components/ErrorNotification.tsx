'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, RefreshCcw, ExternalLink } from 'lucide-react'
import type { UserFriendlyError } from '@/lib/errorHandling'

export interface ErrorNotificationProps {
  error: UserFriendlyError | null
  onDismiss?: () => void
  onRetry?: () => void
  autoHide?: boolean
  autoHideDelay?: number
}

export function ErrorNotification({
  error,
  onDismiss,
  onRetry,
  autoHide = false,
  autoHideDelay = 10000, // 10 seconds
}: ErrorNotificationProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (error) {
      setIsVisible(true)

      if (autoHide) {
        const timer = setTimeout(() => {
          setIsVisible(false)
          setTimeout(() => onDismiss?.(), 300) // Wait for exit animation
        }, autoHideDelay)

        return () => clearTimeout(timer)
      }
    } else {
      setIsVisible(false)
    }
  }, [error, autoHide, autoHideDelay, onDismiss])

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(() => onDismiss?.(), 300) // Wait for exit animation
  }

  const handleRetry = () => {
    setIsVisible(false)
    onRetry?.()
    setTimeout(() => onDismiss?.(), 300)
  }

  if (!error) return null

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -100, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto"
        >
          <div className="bg-red-950/90 backdrop-blur-sm border border-red-800/50 rounded-xl p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-red-100 mb-1">
                  {error.title}
                </h4>
                <p className="text-sm text-red-200/80 leading-relaxed">
                  {error.message}
                </p>

                {(error.action || error.canRetry) && (
                  <div className="flex items-center gap-2 mt-3">
                    {error.canRetry && onRetry && (
                      <button
                        onClick={handleRetry}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-red-100 bg-red-800/50 hover:bg-red-800/70 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <RefreshCcw className="w-3 h-3" />
                        Try Again
                      </button>
                    )}

                    {error.action && (
                      <span className="text-xs text-red-300/70">
                        → {error.action}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={handleDismiss}
                className="flex-shrink-0 text-red-400 hover:text-red-300 transition-colors p-1 -m-1"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Toast-style error notifications
interface ErrorToastProps {
  errors: (UserFriendlyError & { id: string })[]
  onDismiss: (id: string) => void
  onRetry?: (id: string) => void
}

export function ErrorToastStack({ errors, onDismiss, onRetry }: ErrorToastProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      <AnimatePresence>
        {errors.map((error, index) => (
          <motion.div
            key={error.id}
            initial={{ opacity: 0, x: 100, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.95 }}
            transition={{
              duration: 0.3,
              delay: index * 0.1,
              ease: 'easeOut'
            }}
            className="bg-red-950/95 backdrop-blur-sm border border-red-800/50 rounded-lg p-3 shadow-lg min-w-0"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-red-100 mb-1">
                  {error.title}
                </p>
                <p className="text-xs text-red-200/80 line-clamp-2">
                  {error.message}
                </p>

                {error.canRetry && onRetry && (
                  <button
                    onClick={() => onRetry(error.id)}
                    className="mt-2 text-xs text-red-100 hover:text-white underline"
                  >
                    Retry
                  </button>
                )}
              </div>

              <button
                onClick={() => onDismiss(error.id)}
                className="text-red-400 hover:text-red-300 transition-colors p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// Error banner for persistent errors
interface ErrorBannerProps {
  error: UserFriendlyError
  onDismiss?: () => void
  onRetry?: () => void
  className?: string
}

export function ErrorBanner({
  error,
  onDismiss,
  onRetry,
  className = ''
}: ErrorBannerProps) {
  return (
    <div className={`bg-red-950/50 border border-red-800/30 rounded-xl p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-red-100 mb-1">
            {error.title}
          </h4>
          <p className="text-sm text-red-200/80">
            {error.message}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {error.canRetry && onRetry && (
            <button
              onClick={onRetry}
              className="text-sm font-medium text-red-100 hover:text-white underline"
            >
              Try Again
            </button>
          )}

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-red-400 hover:text-red-300 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Hook for managing error notifications
export function useErrorNotifications() {
  const [errors, setErrors] = useState<(UserFriendlyError & { id: string })[]>([])

  const addError = (error: UserFriendlyError) => {
    const id = Math.random().toString(36).substring(2, 15)
    setErrors(prev => [...prev, { ...error, id }])

    // Auto-remove after 10 seconds
    setTimeout(() => {
      setErrors(prev => prev.filter(e => e.id !== id))
    }, 10000)
  }

  const removeError = (id: string) => {
    setErrors(prev => prev.filter(e => e.id !== id))
  }

  const clearAll = () => {
    setErrors([])
  }

  return {
    errors,
    addError,
    removeError,
    clearAll,
  }
}