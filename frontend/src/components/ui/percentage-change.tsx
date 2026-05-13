'use client'

import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const percentageChangeVariants = cva(
  'inline-flex items-center gap-1 font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'text-foreground',
        positive: 'text-green-400',
        negative: 'text-red-400',
        muted: 'text-muted-foreground',
        subtle: 'text-muted-foreground',
      },
      size: {
        xs: 'text-xs',
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
      },
      showIcon: {
        true: '',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
      showIcon: true,
    },
  }
)

interface PercentageChangeProps extends VariantProps<typeof percentageChangeVariants> {
  value: number
  decimals?: number
  showSign?: boolean
  className?: string
}

/**
 * Standardized percentage change component for financial data.
 *
 * Features:
 * - Automatic positive/negative styling and icons
 * - Configurable decimal precision
 * - Optional +/- sign display
 * - Consistent with design system
 * - Triangle icons for visual clarity
 *
 * Used across: GoodSwap, GoodStocks, GoodPredict, GoodPerps
 */
const PercentageChange = forwardRef<HTMLSpanElement, PercentageChangeProps>(
  ({
    value,
    decimals = 2,
    showSign = false,
    showIcon = true,
    variant,
    size,
    className,
    ...props
  }, ref) => {
    // Auto-detect positive/negative variant if not specified
    const isPositive = value > 0
    const isNegative = value < 0
    const finalVariant = variant || (isPositive ? 'positive' : isNegative ? 'negative' : 'muted')

    const formattedValue = Math.abs(value).toFixed(decimals)
    const sign = showSign && value !== 0 ? (isPositive ? '+' : '-') : ''

    const TriangleIcon = ({ direction }: { direction: 'up' | 'down' }) => (
      <svg
        className="w-2.5 h-2.5"
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {direction === 'up' ? (
          <path d="M12 5l8 14H4L12 5z" />
        ) : (
          <path d="M12 19L4 5h16L12 19z" />
        )}
      </svg>
    )

    return (
      <span
        ref={ref}
        className={cn(percentageChangeVariants({ variant: finalVariant, size, showIcon }), className)}
        {...props}
      >
        {showIcon && value !== 0 && (
          <TriangleIcon direction={isPositive ? 'up' : 'down'} />
        )}
        <span>
          {sign}
          {formattedValue}%
        </span>
      </span>
    )
  }
)

PercentageChange.displayName = 'PercentageChange'

export { PercentageChange, percentageChangeVariants }
export type { PercentageChangeProps }