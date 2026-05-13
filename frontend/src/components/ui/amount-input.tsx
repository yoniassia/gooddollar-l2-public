'use client'

import { useState, forwardRef } from 'react'
import { cn } from '@/lib/cn'
import { CalculatorOverlay } from './calculator-overlay'
import { sanitizeNumericInput } from '@/lib/format'

interface AmountInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
  maxValue?: number
  maxValueLabel?: string
  showCalculator?: boolean
  showMaxButton?: boolean
  symbol?: string
  usdValue?: number
  error?: string | boolean
  className?: string
}

/**
 * Enhanced amount input component with integrated calculator overlay.
 *
 * Features:
 * - Built-in calculator overlay with arithmetic operations
 * - Percentage calculations based on max available amount
 * - Quick preset amounts and max button
 * - USD value display for context
 * - Input validation and sanitization
 * - Consistent styling across all trading interfaces
 * - Accessibility support with keyboard navigation
 *
 * Used across: SwapCard, Perps, Lending, Bridge, Yield farming
 */
const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  ({
    value,
    onChange,
    maxValue,
    maxValueLabel = 'balance',
    showCalculator = true,
    showMaxButton = true,
    symbol,
    usdValue,
    error,
    className,
    placeholder = '0.00',
    ...props
  }, ref) => {
    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false)

    const handleCalculatorValue = (calculatedValue: string) => {
      onChange(calculatedValue)
    }

    const handleMaxClick = () => {
      if (maxValue !== undefined) {
        onChange(maxValue.toString())
      }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(sanitizeNumericInput(e.target.value))
    }

    const hasError = !!error

    return (
      <div className={cn('relative', className)}>
        <div className={cn(
          'relative flex items-center',
          'bg-dark-50 border rounded-xl',
          'focus-within:ring-2 focus-within:ring-goodgreen/50',
          hasError
            ? 'border-red-500/50 focus-within:border-red-500/50'
            : 'border-gray-700/30 focus-within:border-goodgreen/30'
        )}>
          {/* Main Input */}
          <input
            ref={ref}
            type="text"
            inputMode="decimal"
            value={value}
            onChange={handleInputChange}
            placeholder={placeholder}
            className="flex-1 px-3 py-2.5 bg-transparent text-white text-sm outline-none placeholder:text-gray-500"
            {...props}
          />

          {/* Action Buttons */}
          <div className="flex items-center gap-1 px-2">
            {/* Symbol Display */}
            {symbol && (
              <span className="text-xs text-gray-400 mr-1">
                {symbol}
              </span>
            )}

            {/* Max Button */}
            {showMaxButton && maxValue !== undefined && (
              <button
                type="button"
                onClick={handleMaxClick}
                className="px-2 py-1 rounded-md text-xs font-medium text-goodgreen hover:text-goodgreen-400 hover:bg-goodgreen/10 transition-colors"
              >
                MAX
              </button>
            )}

            {/* Calculator Button */}
            {showCalculator && (
              <button
                type="button"
                onClick={() => setIsCalculatorOpen(true)}
                className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700/30 transition-colors"
                title="Open calculator"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Additional Information Row */}
        <div className="flex items-center justify-between mt-1 px-1">
          {/* USD Value */}
          {usdValue !== undefined && value && parseFloat(value) > 0 && (
            <span className="text-xs text-gray-500">
              ≈ ${usdValue.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </span>
          )}

          {/* Max Balance Display */}
          {maxValue !== undefined && (
            <span className="text-xs text-gray-500">
              {maxValueLabel}: {maxValue.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4
              })}
              {symbol && ` ${symbol}`}
            </span>
          )}
        </div>

        {/* Error Message */}
        {error && typeof error === 'string' && (
          <div className="text-red-400 text-xs mt-1 px-1">
            {error}
          </div>
        )}

        {/* Calculator Overlay */}
        <CalculatorOverlay
          isOpen={isCalculatorOpen}
          onClose={() => setIsCalculatorOpen(false)}
          onValueSelect={handleCalculatorValue}
          currentValue={value}
          maxValue={maxValue}
          maxValueLabel={maxValueLabel}
        />
      </div>
    )
  }
)

AmountInput.displayName = 'AmountInput'

export { AmountInput }
export type { AmountInputProps }