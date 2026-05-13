'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { type Token } from '@/lib/tokens'
import { SwapConfirmModal } from './SwapConfirmModal'
import { useSwapExecute } from '@/lib/useOnChainSwap'
import { toastPending, toastSuccess, toastError } from '@/components/ui/toast'

type BalanceProps = {
  variant: 'balance'
  inputToken: Token
  onSetAmount: (amount: string) => void
}

type SwapButtonProps = {
  variant: 'swap-button'
  inputToken: Token
  outputToken: Token
  inputAmount: string
  hasAmount: boolean
  priceImpact?: number
  outputAmount?: string
  inputUsd?: string
  outputUsd?: string
  exchangeRate?: string
  minimumReceived?: string
  networkFee?: string
  ubiFee?: string
  /** On-chain amountOut * (1 - slippage) — used as amountOutMin for the real swap */
  onChainAmountOutMin?: bigint
  /** True when the selected pair is supported by GoodSwapRouter on devnet */
  pairOnChain?: boolean
  /** Called when user clicks swap with no amount entered — triggers input shake */
  onInvalidSubmit?: () => void
}

type SwapWalletActionsProps = BalanceProps | SwapButtonProps

export function SwapWalletActions(props: SwapWalletActionsProps) {
  if (props.variant === 'balance') {
    return null
  }
  return (
    <SwapButton
      inputToken={props.inputToken}
      outputToken={props.outputToken}
      inputAmount={props.inputAmount}
      hasAmount={props.hasAmount}
      priceImpact={props.priceImpact}
      outputAmount={props.outputAmount}
      inputUsd={props.inputUsd}
      outputUsd={props.outputUsd}
      exchangeRate={props.exchangeRate}
      minimumReceived={props.minimumReceived}
      networkFee={props.networkFee}
      ubiFee={props.ubiFee}
      onChainAmountOutMin={props.onChainAmountOutMin}
      pairOnChain={props.pairOnChain}
      onInvalidSubmit={props.onInvalidSubmit}
    />
  )
}

function SwapButton({
  inputToken,
  outputToken,
  inputAmount,
  hasAmount,
  priceImpact = 0,
  outputAmount = '',
  inputUsd = '',
  outputUsd = '',
  exchangeRate = '',
  minimumReceived = '',
  networkFee = '< $0.01',
  ubiFee = '',
  onChainAmountOutMin,
  pairOnChain = false,
  onInvalidSubmit,
}: {
  inputToken: Token
  outputToken: Token
  inputAmount: string
  hasAmount: boolean
  priceImpact?: number
  outputAmount?: string
  inputUsd?: string
  outputUsd?: string
  exchangeRate?: string
  minimumReceived?: string
  networkFee?: string
  ubiFee?: string
  onChainAmountOutMin?: bigint
  pairOnChain?: boolean
  onInvalidSubmit?: () => void
}) {
  const [showReview, setShowReview] = useState(false)
  const { swap, phase, error, reset, isConnected } = useSwapExecute()
  const prevPhase = useRef(phase)

  // Fire toasts on phase transitions
  useEffect(() => {
    const prev = prevPhase.current
    prevPhase.current = phase
    if (phase === prev) return
    if (phase === 'approving') {
      toastPending('Awaiting approval…', 'Please confirm the token approval in your wallet.')
    } else if (phase === 'swapping') {
      toastPending('Swap submitted', 'Waiting for transaction confirmation…')
    } else if (phase === 'done') {
      toastSuccess('Swap complete!', `${inputToken.symbol} → ${outputToken.symbol} transaction confirmed.`)
    }
  }, [phase, inputToken.symbol, outputToken.symbol])

  // Fire error toast
  useEffect(() => {
    if (error) {
      toastError('Swap failed', error)
    }
  }, [error])

  const handleSwapClick = useCallback(() => {
    setShowReview(true)
  }, [])

  const handleConfirm = useCallback(async () => {
    setShowReview(false)
    if (pairOnChain && isConnected) {
      await swap(
        inputToken.symbol,
        outputToken.symbol,
        inputAmount,
        onChainAmountOutMin ?? BigInt(0),
      )
    }
  }, [pairOnChain, isConnected, swap, inputToken.symbol, outputToken.symbol, inputAmount, onChainAmountOutMin])

  const handleClose = useCallback(() => {
    setShowReview(false)
    reset()
  }, [reset])

  const isExecuting = phase === 'approving' || phase === 'swapping'

  const buttonLabel = () => {
    if (phase === 'approving') return 'Approving…'
    if (phase === 'swapping') return 'Swapping…'
    if (phase === 'done') return `Swapped!`
    if (priceImpact >= 10) return `Swap Anyway — High Price Impact`
    return `Swap ${inputToken.symbol} for ${outputToken.symbol}`
  }

  return (
    <>
      {!hasAmount ? (
        <>
          <button
            onClick={onInvalidSubmit}
            className="w-full py-4 rounded-xl font-semibold text-base bg-dark-50 text-gray-400 cursor-not-allowed"
          >
            Enter an Amount
          </button>
          <p className="text-xs text-gray-500 text-center mt-3">
            Try swapping {inputToken.symbol} → {outputToken.symbol} — 0.1% of fees fund basic income for 640K+ people
          </p>
        </>
      ) : (
        <>
          <button
            onClick={handleSwapClick}
            disabled={isExecuting}
            className={`w-full py-4 rounded-xl font-semibold text-base transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:outline-none disabled:opacity-70 disabled:cursor-not-allowed ${
              priceImpact >= 10
                ? 'bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500/50'
                : 'bg-goodgreen text-white hover:bg-goodgreen-600 focus-visible:ring-goodgreen/50'
            }`}
          >
            {buttonLabel()}
          </button>
          {/* errors are surfaced via the global Toast notification */}
        </>
      )}

      <SwapConfirmModal
        open={showReview}
        onClose={handleClose}
        onConfirm={handleConfirm}
        inputAmount={inputAmount}
        outputAmount={outputAmount}
        inputSymbol={inputToken.symbol}
        outputSymbol={outputToken.symbol}
        inputUsd={inputUsd}
        outputUsd={outputUsd}
        exchangeRate={exchangeRate}
        priceImpact={priceImpact}
        minimumReceived={minimumReceived}
        networkFee={networkFee}
        ubiFee={ubiFee}
      />
    </>
  )
}
