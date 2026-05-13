'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Loader2, Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface TransactionStep {
  id: string
  label: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
  txHash?: string
  gasEstimate?: string
  estimatedTime?: number // seconds
  errorMessage?: string
}

interface TransactionProgressProps {
  steps: TransactionStep[]
  currentStepId?: string
  onRetry?: (stepId: string) => void
  onSkip?: (stepId: string) => void
  className?: string
}

const statusIcons = {
  pending: Clock,
  in_progress: Loader2,
  completed: Check,
  failed: X,
  skipped: AlertTriangle,
}

const statusColors = {
  pending: 'text-gray-400',
  in_progress: 'text-blue-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  skipped: 'text-yellow-400',
}

const statusBorderColors = {
  pending: 'border-gray-400',
  in_progress: 'border-blue-400',
  completed: 'border-green-400',
  failed: 'border-red-400',
  skipped: 'border-yellow-400',
}

export function TransactionProgress({
  steps,
  currentStepId,
  onRetry,
  onSkip,
  className
}: TransactionProgressProps) {
  const currentStepIndex = currentStepId
    ? steps.findIndex(step => step.id === currentStepId)
    : -1

  const completedSteps = steps.filter(step => step.status === 'completed').length
  const totalSteps = steps.length
  const progressPercentage = (completedSteps / totalSteps) * 100

  return (
    <div className={cn('space-y-4', className)}>
      {/* Progress Bar */}
      <div className="relative">
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-goodgreen to-green-400"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
          <span>{completedSteps} of {totalSteps} completed</span>
          <span>{Math.round(progressPercentage)}%</span>
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const Icon = statusIcons[step.status]
          const isActive = step.id === currentStepId
          const isPastStep = index < currentStepIndex

          return (
            <motion.div
              key={step.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border transition-colors',
                isActive
                  ? 'bg-blue-500/10 border-blue-500/30'
                  : step.status === 'completed'
                  ? 'bg-green-500/10 border-green-500/30'
                  : step.status === 'failed'
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-gray-500/10 border-gray-700/30'
              )}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              {/* Step Icon */}
              <div
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full border-2 flex-shrink-0 mt-0.5',
                  statusBorderColors[step.status]
                )}
              >
                <Icon
                  className={cn(
                    'w-3 h-3',
                    statusColors[step.status],
                    step.status === 'in_progress' && 'animate-spin'
                  )}
                />
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className={cn(
                      'text-sm font-medium',
                      isActive ? 'text-white' : 'text-gray-300'
                    )}>
                      {step.label}
                    </h4>
                    {step.description && (
                      <p className="text-xs text-gray-400 mt-1">
                        {step.description}
                      </p>
                    )}
                  </div>

                  {/* Gas Estimate */}
                  {step.gasEstimate && step.status !== 'completed' && (
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Est. Gas</p>
                      <p className="text-xs font-mono text-gray-300">
                        {step.gasEstimate}
                      </p>
                    </div>
                  )}
                </div>

                {/* Transaction Hash */}
                {step.txHash && (
                  <div className="mt-2">
                    <a
                      href={`https://etherscan.io/tx/${step.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 font-mono break-all"
                    >
                      {step.txHash}
                    </a>
                  </div>
                )}

                {/* Error Message */}
                {step.status === 'failed' && step.errorMessage && (
                  <div className="mt-2">
                    <p className="text-xs text-red-400">{step.errorMessage}</p>
                  </div>
                )}

                {/* Estimated Time */}
                {step.estimatedTime && step.status === 'in_progress' && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400">
                      Est. {step.estimatedTime}s remaining
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                {step.status === 'failed' && (onRetry || onSkip) && (
                  <div className="flex gap-2 mt-3">
                    {onRetry && (
                      <button
                        onClick={() => onRetry(step.id)}
                        className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                      >
                        Retry
                      </button>
                    )}
                    {onSkip && (
                      <button
                        onClick={() => onSkip(step.id)}
                        className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                      >
                        Skip
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Overall Status */}
      <AnimatePresence>
        {completedSteps === totalSteps && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center"
          >
            <Check className="w-6 h-6 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-green-400 font-medium">
              All transactions completed successfully!
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Failed State */}
      <AnimatePresence>
        {steps.some(step => step.status === 'failed') && completedSteps < totalSteps && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center"
          >
            <X className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-400 font-medium">
              Transaction failed. Please retry or contact support.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Utility component for common DeFi transaction flows
export function SwapTransactionProgress({
  approveStatus,
  swapStatus,
  onRetryApprove,
  onRetrySwap,
  className
}: {
  approveStatus?: TransactionStep['status']
  swapStatus?: TransactionStep['status']
  onRetryApprove?: () => void
  onRetrySwap?: () => void
  className?: string
}) {
  const steps: TransactionStep[] = [
    {
      id: 'approve',
      label: 'Token Approval',
      description: 'Approve spending of input token',
      status: approveStatus || 'pending',
      gasEstimate: '0.003 ETH',
    },
    {
      id: 'swap',
      label: 'Execute Swap',
      description: 'Complete the token exchange',
      status: swapStatus || 'pending',
      gasEstimate: '0.015 ETH',
    },
  ]

  const handleRetry = (stepId: string) => {
    if (stepId === 'approve' && onRetryApprove) {
      onRetryApprove()
    } else if (stepId === 'swap' && onRetrySwap) {
      onRetrySwap()
    }
  }

  return (
    <TransactionProgress
      steps={steps}
      onRetry={handleRetry}
      className={className}
    />
  )
}