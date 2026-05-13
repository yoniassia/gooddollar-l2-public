'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowUpDown, ChevronDown } from 'lucide-react'
import { TokenSelector } from './TokenSelector'
import { TOKENS, type Token } from '@/lib/tokens'
import { UBIBreakdown } from './UBIBreakdown'
import { SwapSettings } from './SwapSettings'
import { SwapDetails } from './SwapDetails'
import { PriceImpactWarning } from './PriceImpactWarning'
import { FeeBreakdownBadge } from './FeeBreakdownBadge'
import { formatAmount, compactAmount, sanitizeNumericInput, formatUsdValue } from '@/lib/format'
import { useSwapSettings } from '@/lib/useSwapSettings'
import { SwapWalletActions } from './SwapWalletActions'
import { usePriceFeeds, getPrice } from '@/lib/usePriceFeeds'
import { useSwapQuote } from '@/lib/useOnChainSwap'
import { AnimatedNumber } from './ui/animated-number'

function getLiveRate(prices: Record<string, number>, from: string, to: string): number {
  if (from === to) return 1
  const fromPrice = getPrice(prices, from)
  const toPrice = getPrice(prices, to)
  if (!fromPrice || !toPrice) return 0
  return fromPrice / toPrice
}

const SWAP_FEE_BPS = 30
const UBI_FEE_BPS = 3333

export function SwapCard() {
  const { slippage } = useSwapSettings()
  const searchParams = useSearchParams()
  const [inputToken, setInputToken] = useState<Token>(TOKENS[1])
  const [outputToken, setOutputToken] = useState<Token>(TOKENS[0])
  const [inputAmount, setInputAmount] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Live price feeds — falls back to static prices when CoinGecko is unreachable
  const { prices, isLive } = usePriceFeeds(TOKENS.map(t => t.symbol))

  useEffect(() => {
    const buyParam = searchParams.get('buy')
    if (buyParam) {
      const found = TOKENS.find(t => t.symbol.toUpperCase() === buyParam.toUpperCase())
      if (found) {
        setOutputToken(prev => {
          if (prev.symbol === found.symbol) return prev
          setInputToken(inp => inp.symbol === found.symbol ? (TOKENS.find(t => t.symbol !== found.symbol) ?? TOKENS[1]) : inp)
          return found
        })
      }
      return
    }

    const tokenParam = searchParams.get('token')
    if (!tokenParam) return
    const found = TOKENS.find(t => t.symbol.toUpperCase() === tokenParam.toUpperCase())
    if (!found) return
    setInputToken(prev => {
      if (prev.symbol === found.symbol) return prev
      setOutputToken(out => out.symbol === found.symbol ? (TOKENS.find(t => t.symbol !== found.symbol) ?? TOKENS[0]) : out)
      return found
    })
  }, [searchParams])

  // On-chain quote from GoodSwapRouter (supported pairs: G$, WETH/ETH, USDC)
  const { amountOutFormatted: onChainAmountOut, amountOut: onChainAmountOutWei, isSupported: pairOnChain } =
    useSwapQuote(inputAmount, inputToken.symbol, outputToken.symbol)

  const rawOutputAmount = useMemo(() => {
    if (pairOnChain && onChainAmountOut) return parseFloat(onChainAmountOut)
    const amt = parseFloat(inputAmount)
    if (!amt || isNaN(amt)) return 0
    const rate = getLiveRate(prices, inputToken.symbol, outputToken.symbol)
    const gross = amt * rate
    const fee = gross * (SWAP_FEE_BPS / 10000)
    return gross - fee
  }, [inputAmount, inputToken.symbol, outputToken.symbol, prices, pairOnChain, onChainAmountOut])

  const outputAmount = useMemo(() => {
    if (!rawOutputAmount) return ''
    return formatAmount(rawOutputAmount, outputToken.symbol === 'USDC' ? 2 : 6)
  }, [rawOutputAmount, outputToken.symbol])

  const compactOutputAmount = useMemo(() => {
    if (!rawOutputAmount) return ''
    return compactAmount(rawOutputAmount, 6)
  }, [rawOutputAmount])

  const ubiFee = useMemo(() => {
    const amt = parseFloat(inputAmount)
    if (!amt || isNaN(amt)) return 0
    const rate = getLiveRate(prices, inputToken.symbol, outputToken.symbol)
    const gross = amt * rate
    const swapFee = gross * (SWAP_FEE_BPS / 10000)
    return swapFee * (UBI_FEE_BPS / 10000)
  }, [inputAmount, inputToken.symbol, outputToken.symbol, prices])

  const priceImpact = useMemo(() => {
    const amt = parseFloat(inputAmount)
    if (!amt || isNaN(amt)) return 0
    if (amt < 1) return 0.01
    if (amt < 10) return 0.1 + (amt / 10) * 0.2
    if (amt < 100) return 0.3 + (amt / 100) * 1.5
    return Math.min(0.3 + (amt / 100) * 1.5, 15)
  }, [inputAmount])

  const minimumReceived = useMemo(() => {
    if (!rawOutputAmount) return ''
    const min = rawOutputAmount * (1 - slippage / 100)
    return formatAmount(min, outputToken.symbol === 'USDC' ? 2 : 6)
  }, [rawOutputAmount, slippage, outputToken.symbol])

  const exchangeRate = useMemo(() => {
    const rate = getLiveRate(prices, inputToken.symbol, outputToken.symbol)
    if (rate >= 1000) return `1 ${inputToken.symbol} = ${rate.toLocaleString()} ${outputToken.symbol}`
    if (rate >= 1) return `1 ${inputToken.symbol} = ${rate.toFixed(2)} ${outputToken.symbol}`
    return `1 ${inputToken.symbol} = ${rate.toFixed(6)} ${outputToken.symbol}`
  }, [inputToken.symbol, outputToken.symbol, prices])

  const inputUsd = useMemo(() => {
    const amt = parseFloat(inputAmount)
    if (!amt || isNaN(amt)) return ''
    return formatUsdValue(amt * getPrice(prices, inputToken.symbol))
  }, [inputAmount, inputToken.symbol, prices])

  const outputUsd = useMemo(() => {
    if (!rawOutputAmount) return ''
    return formatUsdValue(rawOutputAmount * getPrice(prices, outputToken.symbol))
  }, [rawOutputAmount, outputToken.symbol, prices])

  const inputFontSize = useMemo(() => {
    const len = inputAmount.length
    if (len <= 8) return undefined
    const size = Math.max(16, 30 - (len - 8) * 1.5)
    return `${size}px`
  }, [inputAmount])

  const [inputShake, setInputShake] = useState(0)

  const [flipRotation, setFlipRotation] = useState(0)

  const handleFlip = useCallback(() => {
    setInputToken(outputToken)
    setOutputToken(inputToken)
    setFlipRotation(r => r + 180)
  }, [inputToken, outputToken])

  const handleInputSelect = useCallback((t: Token) => {
    if (t.symbol === outputToken.symbol) setOutputToken(inputToken)
    setInputToken(t)
  }, [inputToken, outputToken])

  const handleOutputSelect = useCallback((t: Token) => {
    if (t.symbol === inputToken.symbol) setInputToken(outputToken)
    setOutputToken(t)
  }, [inputToken, outputToken])

  const hasAmount = !!inputAmount && parseFloat(inputAmount) > 0

  return (
    <div id="swap-card" className="w-full max-w-[460px]">
      <div className="bg-dark-100 rounded-2xl border border-gray-700/30 shadow-xl overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Swap</h2>
            <div className="flex items-center gap-2">
              <FeeBreakdownBadge />
              {showAdvanced && <SwapSettings />}
            </div>
          </div>

          {/* Advanced Toggle */}
          <div className="mt-3 flex justify-center">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none rounded-lg"
              aria-label={showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
            >
              <span>Advanced</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Input */}
        <motion.div
          className="mx-4 p-4 rounded-xl bg-dark/80 border border-gray-700/20"
          animate={inputShake ? { x: [0, 8, -8, 6, -6, 0] } : {}}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          key={inputShake}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">You pay</span>
            <SwapWalletActions
              variant="balance"
              inputToken={inputToken}
              onSetAmount={setInputAmount}
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              aria-label={`Amount to swap (${inputToken?.symbol ?? 'token'})`}
              value={inputAmount}
              onChange={e => setInputAmount(sanitizeNumericInput(e.target.value))}
              style={inputFontSize ? { fontSize: inputFontSize } : undefined}
              className={`flex-1 bg-transparent font-medium text-white outline-none placeholder:text-gray-500 min-w-0 focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:ring-offset-1 focus-visible:ring-offset-dark rounded-lg transition-[font-size] duration-100 ${inputFontSize ? '' : 'text-3xl'}`}
            />
            <TokenSelector
              selected={inputToken}
              onSelect={handleInputSelect}
              exclude={outputToken.symbol}
            />
          </div>
          {inputUsd && (
            <p className="text-xs text-gray-500 mt-1.5" data-testid="input-usd">{inputUsd}</p>
          )}
        </motion.div>

        {/* Flip */}
        <div className="flex justify-center -my-3 relative z-[60]">
          <button
            onClick={handleFlip}
            className="w-10 h-10 rounded-xl bg-dark-100 border border-gray-700/50 flex items-center justify-center hover:border-goodgreen/50 hover:text-goodgreen transition-colors text-gray-400 focus-visible:ring-2 focus-visible:ring-goodgreen/50 focus-visible:outline-none"
          >
            <ArrowUpDown
              className="w-5 h-5 transition-transform duration-200"
              style={{ transform: `rotate(${flipRotation}deg)` }}
            />
          </button>
        </div>

        {/* Output */}
        <div className="mx-4 p-4 rounded-xl bg-dark/80 border border-gray-700/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">You receive</span>
          </div>
          <div className="flex items-center gap-3">
            <span
              title={rawOutputAmount ? rawOutputAmount.toString() : ''}
              className="flex-1 text-3xl sm:text-3xl font-medium min-w-0 cursor-default select-text"
              style={{ fontSize: outputAmount.length > 10 ? 'clamp(1.125rem, 5vw, 1.875rem)' : undefined }}
            >
              <span className="text-white sm:hidden">{compactOutputAmount || <span className="text-gray-600">0</span>}</span>
              {rawOutputAmount
                ? <AnimatedNumber value={rawOutputAmount} decimals={outputToken.symbol === 'USDC' ? 2 : 6} className="text-white hidden sm:inline" />
                : <span className="text-gray-600 hidden sm:inline">0</span>
              }
            </span>
            <TokenSelector
              selected={outputToken}
              onSelect={handleOutputSelect}
              exclude={inputToken.symbol}
            />
          </div>
          {outputUsd && (
            <p className="text-xs text-gray-500 mt-1.5" data-testid="output-usd">{outputUsd}</p>
          )}
        </div>

        {/* Rate */}
        {hasAmount && showAdvanced && (
          <div className="mx-4 mt-3 px-4 py-2 text-xs text-gray-400 flex justify-between items-center">
            <span className="flex items-center gap-1.5">
              Rate
              {isLive && (
                <span className="inline-flex items-center gap-1 text-[10px] text-goodgreen/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-goodgreen animate-pulse inline-block" />
                  live
                </span>
              )}
            </span>
            <span>{exchangeRate}</span>
          </div>
        )}

        {/* UBI - Always show to emphasize mission */}
        <UBIBreakdown
          ubiFeeAmount={ubiFee}
          outputToken={outputToken}
          visible={hasAmount}
        />

        {/* Advanced Swap Details */}
        {showAdvanced && (
          <>
            <SwapDetails
              priceImpact={priceImpact}
              minimumReceived={minimumReceived}
              outputSymbol={outputToken.symbol}
              networkFee="< $0.01"
              visible={hasAmount}
            />
            <PriceImpactWarning priceImpact={priceImpact} visible={hasAmount} />
          </>
        )}

        {/* Simple mode: Show only critical warnings */}
        {!showAdvanced && (
          <PriceImpactWarning priceImpact={priceImpact} visible={hasAmount && priceImpact > 5} />
        )}

        {/* Swap button */}
        <div className="p-4 pt-3">
          <SwapWalletActions
            variant="swap-button"
            inputToken={inputToken}
            outputToken={outputToken}
            inputAmount={inputAmount}
            hasAmount={hasAmount}
            priceImpact={priceImpact}
            outputAmount={outputAmount}
            inputUsd={inputUsd}
            outputUsd={outputUsd}
            exchangeRate={exchangeRate}
            minimumReceived={`${minimumReceived} ${outputToken.symbol}`}
            networkFee="< $0.01"
            ubiFee={ubiFee > 0 ? `${formatAmount(ubiFee)} ${outputToken.symbol}` : ''}
            onChainAmountOutMin={onChainAmountOutWei !== undefined && slippage > 0
              ? onChainAmountOutWei * BigInt(Math.floor((1 - slippage / 100) * 10000)) / BigInt(10000)
              : onChainAmountOutWei}
            pairOnChain={pairOnChain}
            onInvalidSubmit={() => setInputShake(p => p + 1)}
          />
        </div>
      </div>

    </div>
  )
}
