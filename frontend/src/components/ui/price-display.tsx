'use client'

import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { AnimatedNumber } from './animated-number'

const priceDisplayVariants = cva(
  'font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'text-foreground',
        positive: 'text-green-400',
        negative: 'text-red-400',
        muted: 'text-muted-foreground',
        accent: 'text-goodgreen',
      },
      size: {
        xs: 'text-xs',
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
        xl: 'text-xl',
        '2xl': 'text-2xl',
        '3xl': 'text-3xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

interface PriceDisplayProps extends VariantProps<typeof priceDisplayVariants> {
  value: number
  symbol?: string
  prefix?: string
  decimals?: number
  showSign?: boolean
  animated?: boolean
  compact?: boolean
  contextLabel?: string  // e.g., "vs 24h ago", "since yesterday", "this week"
  showContext?: boolean  // Whether to show contextual timing information
  className?: string
}

/**
 * Standardized price display component for financial data across all dApps.
 *
 * Features:
 * - Automatic positive/negative variant detection
 * - Configurable decimal precision
 * - Optional animation for live price updates
 * - Compact formatting for large numbers
 * - Contextual timing labels (e.g., "vs 24h ago", "since yesterday")
 * - Consistent styling with design system
 *
 * Used across: GoodSwap, GoodStocks, GoodPredict, GoodPerps
 */
const PriceDisplay = forwardRef<HTMLSpanElement, PriceDisplayProps>(
  ({
    value,
    symbol = '',
    prefix = '',
    decimals = 2,
    showSign = false,
    animated = false,
    compact = false,
    contextLabel,
    showContext = false,
    variant,
    size,
    className,
    ...props
  }, ref) => {
    // Auto-detect positive/negative variant if not specified
    const finalVariant = variant || (value > 0 ? 'positive' : value < 0 ? 'negative' : 'default')

    // Format the number
    const formatNumber = (num: number): string => {
      if (compact && Math.abs(num) >= 1000) {
        if (Math.abs(num) >= 1_000_000_000) {
          return (num / 1_000_000_000).toFixed(1) + 'B'
        } else if (Math.abs(num) >= 1_000_000) {
          return (num / 1_000_000).toFixed(1) + 'M'
        } else if (Math.abs(num) >= 1_000) {
          return (num / 1_000).toFixed(1) + 'K'
        }
      }
      return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    }

    const formattedValue = formatNumber(Math.abs(value))
    const sign = showSign && value !== 0 ? (value > 0 ? '+' : '-') : ''

    // Determine contextual label text and styling
    const getContextLabel = () => {
      if (!showContext) return null

      // Use provided contextLabel or smart defaults based on value
      const labelText = contextLabel || (
        showSign ? 'vs 24h ago' : 'current'
      )

      return labelText
    }

    const contextLabelText = getContextLabel()

    return (
      <span
        ref={ref}
        className={cn(priceDisplayVariants({ variant: finalVariant, size }), className)}
        {...props}
      >
        {prefix}
        {sign}
        {animated ? (
          <AnimatedNumber
            value={Math.abs(value)}
            decimals={decimals}
            className="inline"
          />
        ) : (
          formattedValue
        )}
        {symbol && (
          <span className="ml-1 text-muted-foreground text-[0.85em]">
            {symbol}
          </span>
        )}
        {contextLabelText && (
          <span className="ml-1.5 text-muted-foreground text-[0.75em] opacity-70">
            {contextLabelText}
          </span>
        )}
      </span>
    )
  }
)

PriceDisplay.displayName = 'PriceDisplay'

export { PriceDisplay, priceDisplayVariants }
export type { PriceDisplayProps }