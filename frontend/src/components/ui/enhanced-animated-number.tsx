'use client'

import { useEffect, useRef, useState } from 'react'
import { useSpring, useMotionValue, useTransform, motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/cn'

interface EnhancedAnimatedNumberProps {
  value: number
  /** decimal places to show, default 2 */
  decimals?: number
  /** prefix (e.g. '$', '+', '-') */
  prefix?: string
  /** suffix (e.g. '%', 'USD') */
  suffix?: string
  /** animation type */
  variant?: 'smooth' | 'bounce' | 'elastic' | 'spring'
  /** animation duration in milliseconds */
  duration?: number
  /** highlight positive/negative changes with color */
  highlightChange?: boolean
  /** custom formatting function */
  formatter?: (value: number) => string
  className?: string
}

const animationConfigs = {
  smooth: { stiffness: 60, damping: 20 },
  bounce: { stiffness: 120, damping: 10 },
  elastic: { stiffness: 200, damping: 12 },
  spring: { stiffness: 80, damping: 20 },
}

export function EnhancedAnimatedNumber({
  value,
  decimals = 2,
  prefix = '',
  suffix = '',
  variant = 'spring',
  duration = 1000,
  highlightChange = false,
  formatter,
  className
}: EnhancedAnimatedNumberProps) {
  const motionValue = useMotionValue(value)
  const prevValueRef = useRef(value)
  const config = animationConfigs[variant]
  const [displayValue, setDisplayValue] = useState(() => {
    if (formatter) {
      return formatter(value)
    }
    return value.toFixed(decimals)
  })

  // Create spring animation with custom config
  const spring = useSpring(motionValue, {
    ...config,
    restDelta: 0.01 // Smaller rest delta for smoother stopping
  })

  // Detect value changes for highlight effect
  const isPositiveChange = highlightChange && value > prevValueRef.current
  const isNegativeChange = highlightChange && value < prevValueRef.current

  useEffect(() => {
    motionValue.set(value)
    prevValueRef.current = value
  }, [value, motionValue])

  useEffect(() => {
    const unsubscribe = spring.on('change', (latest) => {
      if (formatter) {
        setDisplayValue(formatter(latest))
      } else {
        setDisplayValue(latest.toFixed(decimals))
      }
    })

    return () => unsubscribe()
  }, [spring, formatter, decimals])

  const changeColor = isPositiveChange
    ? 'text-green-400'
    : isNegativeChange
    ? 'text-red-400'
    : ''

  return (
    <AnimatePresence mode="wait">
      <motion.span
        className={cn('tabular-nums', changeColor, className)}
        initial={highlightChange ? { scale: 1 } : false}
        animate={highlightChange && (isPositiveChange || isNegativeChange) ? {
          scale: [1, 1.05, 1],
          transition: { duration: 0.3, ease: 'easeOut' }
        } : { scale: 1 }}
        key={value} // Re-trigger animation on value change
      >
        {prefix}
        {displayValue}
        {suffix}
      </motion.span>
    </AnimatePresence>
  )
}

// Utility component for currency formatting
export function AnimatedCurrency({
  value,
  currency = 'USD',
  locale = 'en-US',
  ...props
}: Omit<EnhancedAnimatedNumberProps, 'formatter'> & {
  currency?: string
  locale?: string
}) {
  const formatter = (num: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: props.decimals ?? 2,
      maximumFractionDigits: props.decimals ?? 2,
    }).format(num)

  return (
    <EnhancedAnimatedNumber
      {...props}
      value={value}
      formatter={formatter}
    />
  )
}

// Utility component for percentage formatting
export function AnimatedPercentage({
  value,
  showSign = true,
  ...props
}: Omit<EnhancedAnimatedNumberProps, 'suffix' | 'prefix'> & {
  showSign?: boolean
}) {
  const prefix = showSign && value > 0 ? '+' : ''

  return (
    <EnhancedAnimatedNumber
      {...props}
      value={value}
      prefix={prefix}
      suffix="%"
      highlightChange={true}
    />
  )
}

// Component for large number formatting (K, M, B suffixes)
export function AnimatedLargeNumber({
  value,
  ...props
}: Omit<EnhancedAnimatedNumberProps, 'formatter'>) {
  const formatter = (num: number) => {
    const absNum = Math.abs(num)
    if (absNum >= 1e9) {
      return (num / 1e9).toFixed(1) + 'B'
    } else if (absNum >= 1e6) {
      return (num / 1e6).toFixed(1) + 'M'
    } else if (absNum >= 1e3) {
      return (num / 1e3).toFixed(1) + 'K'
    }
    return num.toFixed(props.decimals ?? 0)
  }

  return (
    <EnhancedAnimatedNumber
      {...props}
      value={value}
      formatter={formatter}
    />
  )
}