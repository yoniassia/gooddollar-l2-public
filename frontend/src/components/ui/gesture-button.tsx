'use client'

import { forwardRef, ReactNode, useState, useRef } from 'react'
import { motion, PanInfo, useMotionValue, useTransform } from 'framer-motion'
import { cn } from '@/lib/cn'

interface GestureButtonProps {
  children: ReactNode
  onClick?: () => void
  onLongPress?: () => void
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
  /** Enable haptic feedback (if supported) */
  enableHaptics?: boolean
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Loading state */
  loading?: boolean
  /** Disabled state */
  disabled?: boolean
  /** Long press duration in milliseconds */
  longPressDuration?: number
  /** Swipe threshold in pixels */
  swipeThreshold?: number
  /** Success feedback animation */
  showSuccessFeedback?: boolean
  /** Error shake animation */
  showErrorFeedback?: boolean
  className?: string
}

const variants = {
  primary: 'bg-goodgreen hover:bg-goodgreen/90 text-dark',
  secondary: 'bg-dark-50 hover:bg-dark-100 text-white border border-gray-700',
  danger: 'bg-red-500 hover:bg-red-600 text-white',
  success: 'bg-green-500 hover:bg-green-600 text-white',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
}

// Haptic feedback utility
const triggerHaptic = (pattern: 'light' | 'medium' | 'heavy' = 'light') => {
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [50],
    }
    navigator.vibrate(patterns[pattern])
  }
}

export const GestureButton = forwardRef<HTMLButtonElement, GestureButtonProps>(({
  children,
  onClick,
  onLongPress,
  onSwipeRight,
  onSwipeLeft,
  enableHaptics = false,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  longPressDuration = 800,
  swipeThreshold = 50,
  showSuccessFeedback = false,
  showErrorFeedback = false,
  className,
  ...props
}, ref) => {
  const [isPressed, setIsPressed] = useState(false)
  const [isLongPressing, setIsLongPressing] = useState(false)
  const longPressTimer = useRef<NodeJS.Timeout>()

  const x = useMotionValue(0)
  const opacity = useTransform(x, [-100, 0, 100], [0.6, 1, 0.6])
  const scale = useTransform(x, [-50, 0, 50], [0.95, 1, 0.95])

  const handleTapStart = () => {
    if (disabled || loading) return

    setIsPressed(true)
    if (enableHaptics) triggerHaptic('light')

    // Start long press timer
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        setIsLongPressing(true)
        if (enableHaptics) triggerHaptic('medium')
        onLongPress()
      }, longPressDuration)
    }
  }

  const handleTapEnd = () => {
    setIsPressed(false)
    setIsLongPressing(false)

    // Clear long press timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
    }
  }

  const handleTap = () => {
    if (disabled || loading || isLongPressing) return

    if (enableHaptics) triggerHaptic('medium')
    onClick?.()
  }

  const handlePan = (event: any, info: PanInfo) => {
    if (disabled || loading) return

    const { offset, velocity } = info

    if (Math.abs(offset.x) > swipeThreshold) {
      if (offset.x > 0 && onSwipeRight) {
        if (enableHaptics) triggerHaptic('heavy')
        onSwipeRight()
      } else if (offset.x < 0 && onSwipeLeft) {
        if (enableHaptics) triggerHaptic('heavy')
        onSwipeLeft()
      }
    }
  }

  const handlePanEnd = () => {
    x.set(0) // Reset position
  }

  return (
    <motion.button
      ref={ref}
      className={cn(
        'relative font-semibold rounded-xl transition-all duration-200 focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none overflow-hidden',
        variants[variant],
        sizes[size],
        disabled && 'opacity-50 cursor-not-allowed',
        loading && 'cursor-wait',
        className
      )}
      style={{ x, opacity, scale }}
      disabled={disabled || loading}
      onTapStart={handleTapStart}
      onTap={handleTap}
      onTapCancel={handleTapEnd}
      onPan={handlePan}
      onPanEnd={handlePanEnd}
      whileTap={!disabled && !loading ? { scale: 0.98 } : {}}
      animate={{
        // Success pulse animation
        ...(showSuccessFeedback && {
          scale: [1, 1.05, 1],
          boxShadow: [
            '0 0 0 0px rgba(34, 197, 94, 0)',
            '0 0 0 8px rgba(34, 197, 94, 0.3)',
            '0 0 0 0px rgba(34, 197, 94, 0)',
          ],
          transition: { duration: 0.6, ease: 'easeOut' }
        }),
        // Error shake animation
        ...(showErrorFeedback && {
          x: [-5, 5, -5, 5, 0],
          transition: { duration: 0.4, ease: 'easeOut' }
        }),
      }}
      {...props}
    >
      {/* Long press progress indicator */}
      {onLongPress && isPressed && (
        <motion.div
          className="absolute inset-0 bg-white/20"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: isLongPressing ? 1 : 0 }}
          transition={{ duration: longPressDuration / 1000, ease: 'linear' }}
          style={{ originX: 0 }}
        />
      )}

      {/* Loading spinner */}
      {loading && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center bg-inherit"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>
      )}

      {/* Button content */}
      <motion.div
        className="flex items-center justify-center gap-2"
        animate={{ opacity: loading ? 0 : 1 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>

      {/* Swipe hints */}
      {(onSwipeLeft || onSwipeRight) && !loading && !disabled && (
        <>
          {onSwipeLeft && (
            <motion.div
              className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-50"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 0.5, x: 0 }}
              transition={{ delay: 2, duration: 0.3 }}
            >
              ←
            </motion.div>
          )}
          {onSwipeRight && (
            <motion.div
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs opacity-50"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 0.5, x: 0 }}
              transition={{ delay: 2, duration: 0.3 }}
            >
              →
            </motion.div>
          )}
        </>
      )}

      {/* Ripple effect on tap */}
      {isPressed && !disabled && !loading && (
        <motion.div
          className="absolute inset-0 bg-white/20 rounded-xl"
          initial={{ scale: 0, opacity: 0.6 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      )}
    </motion.button>
  )
})

GestureButton.displayName = 'GestureButton'

// Specialized components for common use cases
export const SwapButton = forwardRef<HTMLButtonElement, Omit<GestureButtonProps, 'variant' | 'onSwipeRight'> & {
  onFlipTokens?: () => void
}>(({ onFlipTokens, ...props }, ref) => (
  <GestureButton
    ref={ref}
    variant="primary"
    onSwipeRight={onFlipTokens}
    enableHaptics
    {...props}
  />
))

SwapButton.displayName = 'SwapButton'

export const DangerButton = forwardRef<HTMLButtonElement, Omit<GestureButtonProps, 'variant' | 'longPressDuration'>>(
  (props, ref) => (
    <GestureButton
      ref={ref}
      variant="danger"
      longPressDuration={1200} // Longer for dangerous actions
      enableHaptics
      {...props}
    />
  )
)

DangerButton.displayName = 'DangerButton'