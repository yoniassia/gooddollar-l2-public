'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/cn'

interface CalculatorOverlayProps {
  isOpen: boolean
  onClose: () => void
  onValueSelect: (value: string) => void
  currentValue: string
  maxValue?: number
  maxValueLabel?: string
  className?: string
}

const CALCULATOR_BUTTONS = [
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['0', '.', '=', '+']
] as const

const PRESET_PERCENTAGES = [25, 50, 75, 100] as const
const PRESET_AMOUNTS = [10, 100, 1000, 5000] as const

/**
 * Calculator overlay for amount input fields across trading interfaces.
 *
 * Features:
 * - Basic arithmetic operations (+ - * /)
 * - Percentage calculations based on max available amount
 * - Preset round number shortcuts
 * - Real-time expression evaluation
 * - Keyboard accessible
 * - Mobile-friendly touch interface
 */
export function CalculatorOverlay({
  isOpen,
  onClose,
  onValueSelect,
  currentValue,
  maxValue,
  maxValueLabel = 'max',
  className
}: CalculatorOverlayProps) {
  const [expression, setExpression] = useState('')
  const [result, setResult] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setExpression(currentValue || '')
      setResult('')
    }
  }, [isOpen, currentValue])

  // Close overlay when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])


  const evaluateExpression = (expr: string): string => {
    try {
      // Replace common percentage patterns
      let cleanExpr = expr
        .replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)')  // Convert percentages
        .replace(/[^0-9+\-*/.() ]/g, '')  // Remove invalid characters

      if (!cleanExpr || cleanExpr === '') return ''

      // Use Function constructor for safer evaluation than eval
      const result = new Function(`return ${cleanExpr}`)()

      if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
        return result.toString()
      }
      return ''
    } catch {
      return ''
    }
  }

  const handleButtonClick = useCallback((value: string) => {
    if (value === '=') {
      const evaluated = evaluateExpression(expression)
      if (evaluated) {
        onValueSelect(evaluated)
        onClose()
      }
    } else {
      const newExpression = expression + value
      setExpression(newExpression)

      // Real-time evaluation for immediate feedback
      const evaluated = evaluateExpression(newExpression)
      setResult(evaluated)
    }
  }, [expression, onValueSelect, onClose])

  const handleCalculate = useCallback(() => {
    const evaluated = evaluateExpression(expression)
    if (evaluated) {
      onValueSelect(evaluated)
      onClose()
    }
  }, [expression, onValueSelect, onClose])

  const handleBackspace = useCallback(() => {
    const newExpression = expression.slice(0, -1)
    setExpression(newExpression)

    const evaluated = evaluateExpression(newExpression)
    setResult(evaluated)
  }, [expression])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return

    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleCalculate()
    } else if (/[0-9+\-*/.=]/.test(e.key)) {
      e.preventDefault()
      handleButtonClick(e.key)
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      handleBackspace()
    }
  }, [isOpen, onClose, handleCalculate, handleButtonClick, handleBackspace])

  // Keyboard support
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleClear = () => {
    setExpression('')
    setResult('')
  }

  const handlePercentage = (percent: number) => {
    if (maxValue !== undefined) {
      const value = ((maxValue * percent) / 100).toString()
      onValueSelect(value)
      onClose()
    }
  }

  const handlePresetAmount = (amount: number) => {
    onValueSelect(amount.toString())
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calculator-title"
        aria-describedby="calculator-description"
        className={cn(
          'bg-dark-100 rounded-2xl border border-gray-700/20 p-4 w-full max-w-sm shadow-2xl',
          className
        )}
      >
        <div id="calculator-description" className="sr-only">
          Interactive calculator for amount inputs with basic arithmetic operations, percentage calculations, and preset amounts
        </div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 id="calculator-title" className="text-sm font-semibold text-white">Calculator</h3>
          <button
            onClick={onClose}
            aria-label="Close calculator"
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/30 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Display */}
        <div className="bg-dark-50 rounded-xl p-3 mb-4" role="region" aria-labelledby="calculator-display">
          <div id="calculator-display" className="text-xs text-gray-400 mb-1">Expression:</div>
          <div className="text-white font-mono text-sm min-h-[20px]" aria-label={`Current expression: ${expression || '0'}`}>
            {expression || '0'}
          </div>
          {result && result !== expression && (
            <>
              <div className="text-xs text-gray-400 mt-2 mb-1">Result:</div>
              <div
                className="text-goodgreen font-mono text-sm"
                aria-live="polite"
                aria-label={`Calculation result: ${result}`}
              >
                = {result}
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {/* Percentage buttons */}
          {maxValue !== undefined && (
            <div className="col-span-2">
              <div className="text-xs text-gray-400 mb-2">% of {maxValueLabel}:</div>
              <div className="grid grid-cols-4 gap-1">
                {PRESET_PERCENTAGES.map(percent => (
                  <button
                    key={percent}
                    onClick={() => handlePercentage(percent)}
                    aria-label={`Use ${percent}% of ${maxValueLabel}`}
                    className="py-2 px-2 rounded-lg bg-gray-700/30 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-600/40 transition-colors"
                  >
                    {percent}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preset amounts */}
          <div className="col-span-2">
            <div className="text-xs text-gray-400 mb-2">Quick amounts:</div>
            <div className="grid grid-cols-4 gap-1">
              {PRESET_AMOUNTS.map(amount => (
                <button
                  key={amount}
                  onClick={() => handlePresetAmount(amount)}
                  aria-label={`Use preset amount ${amount}`}
                  className="py-2 px-2 rounded-lg bg-gray-700/30 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-600/40 transition-colors"
                >
                  {amount >= 1000 ? `${amount / 1000}K` : amount}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calculator Grid */}
        <div className="grid grid-cols-4 gap-2 mb-4" role="grid" aria-labelledby="calculator-grid-label">
          <div id="calculator-grid-label" className="sr-only">Calculator number pad and operations</div>
          {CALCULATOR_BUTTONS.flat().map((btn, index) => {
            let ariaLabel = ''
            if (btn === '=') ariaLabel = 'Calculate result'
            else if (btn === '+') ariaLabel = 'Add'
            else if (btn === '-') ariaLabel = 'Subtract'
            else if (btn === '*') ariaLabel = 'Multiply'
            else if (btn === '/') ariaLabel = 'Divide'
            else if (btn === '.') ariaLabel = 'Decimal point'
            else ariaLabel = `Number ${btn}`

            return (
              <button
                key={`${btn}-${index}`}
                onClick={() => handleButtonClick(btn)}
                aria-label={ariaLabel}
                className={cn(
                  'aspect-square rounded-lg font-medium transition-colors text-sm',
                  btn === '='
                    ? 'bg-goodgreen text-white hover:bg-goodgreen/80'
                    : ['+', '-', '*', '/'].includes(btn)
                    ? 'bg-gray-600/40 text-gray-200 hover:text-white hover:bg-gray-500/50'
                    : 'bg-gray-700/30 text-gray-300 hover:text-white hover:bg-gray-600/40'
                )}
              >
                {btn}
              </button>
            )
          })}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleClear}
            aria-label="Clear all input"
            className="py-2 px-3 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 hover:text-red-300 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={handleBackspace}
            aria-label="Delete last character"
            className="py-2 px-3 rounded-lg bg-gray-700/30 text-gray-300 text-xs font-medium hover:text-white hover:bg-gray-600/40 transition-colors"
          >
            ⌫
          </button>
          <button
            onClick={handleCalculate}
            aria-label="Apply calculated result to input field"
            className="py-2 px-3 rounded-lg bg-goodgreen text-white text-xs font-medium hover:bg-goodgreen/80 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}