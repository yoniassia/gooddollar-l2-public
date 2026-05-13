'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useAccount, useWriteContract } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ALL_CATEGORIES, type MarketCategory } from '@/lib/predictData'
import { CONTRACTS } from '@/lib/chain'
import { MarketFactoryABI } from '@/lib/abi'

const QUESTION_MAX = 200
const CRITERIA_MAX = 500
const LIQUIDITY_MIN = 100
const LIQUIDITY_MAX = 100_000

function CharCounter({ current, max }: { current: number; max: number }) {
  const ratio = max > 0 ? current / max : 0
  const colorClass =
    ratio >= 1 ? 'text-red-400' : ratio >= 0.8 ? 'text-amber-500' : 'text-gray-600'
  return (
    <span className={`text-xs shrink-0 ${colorClass}`} aria-live="polite">
      {current}/{max}
    </span>
  )
}

function sanitizeLiquidityInput(raw: string): string {
  let out = ''
  let dotSeen = false
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      out += ch
    } else if (ch === '.' && !dotSeen) {
      dotSeen = true
      out += ch
    }
  }
  return out
}

export default function CreateMarketPage() {
  const [question, setQuestion] = useState('')
  const [criteria, setCriteria] = useState('')
  const [endDate, setEndDate] = useState('')
  const [category, setCategory] = useState<MarketCategory>('Crypto')
  const [liquidity, setLiquidity] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [txPhase, setTxPhase] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')
  const [txError, setTxError] = useState<string | null>(null)
  const { isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!question.trim()) errs.question = 'Question is required'
    if (!criteria.trim()) errs.criteria = 'Resolution criteria is required'
    if (!endDate) errs.endDate = 'End date is required'
    else if (new Date(endDate) <= new Date()) errs.endDate = 'End date must be in the future'

    const liq = liquidity.trim()
    if (!liq) {
      errs.liquidity = 'Initial liquidity is required'
    } else {
      const n = parseFloat(liq)
      if (Number.isNaN(n)) {
        errs.liquidity = 'Initial liquidity is required'
      } else if (n < LIQUIDITY_MIN) {
        errs.liquidity = 'Minimum $100 initial liquidity'
      } else if (n > LIQUIDITY_MAX) {
        errs.liquidity = 'Maximum $100,000 initial liquidity'
      }
    }
    return errs
  }

  const liquidityTrimmed = liquidity.trim()
  const liquidityNum = liquidityTrimmed === '' ? NaN : parseFloat(liquidityTrimmed)
  const liquidityInline =
    liquidityTrimmed === '' || Number.isNaN(liquidityNum)
      ? null
      : liquidityNum < LIQUIDITY_MIN
        ? 'Minimum $100 initial liquidity'
        : liquidityNum > LIQUIDITY_MAX
          ? 'Maximum $100,000 initial liquidity'
          : null

  const handleLiquidityChange = (raw: string) => {
    setLiquidity(sanitizeLiquidityInput(raw))
    if (errors.liquidity) {
      setErrors(prev => {
        const next = { ...prev }
        delete next.liquidity
        return next
      })
    }
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    if (isConnected && CONTRACTS.MarketFactory) {
      try {
        setTxPhase('pending')
        setTxError(null)
        const endTimestamp = BigInt(Math.floor(new Date(endDate).getTime() / 1000))
        await writeContractAsync({
          address: CONTRACTS.MarketFactory,
          abi: MarketFactoryABI,
          functionName: 'createMarket',
          args: [question.trim(), endTimestamp, '0x0000000000000000000000000000000000000000'],
        })
        setTxPhase('done')
        setSubmitted(true)
      } catch (err: unknown) {
        const e = err as { shortMessage?: string; message?: string }
        setTxError(e?.shortMessage ?? e?.message ?? 'Transaction failed')
        setTxPhase('error')
      }
    } else {
      setSubmitted(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, question, endDate, writeContractAsync])

  const liquidityDisplayError = errors.liquidity ?? liquidityInline

  if (submitted) {
    return (
      <div className="w-full max-w-lg mx-auto">
        <div className="bg-dark-100 rounded-2xl border border-goodgreen/30 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-goodgreen/15 border border-goodgreen/25 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-goodgreen" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Market Created!</h2>
          <p className="text-sm text-gray-400 mb-6">&quot;{question}&quot;</p>
          <div className="flex gap-3 justify-center">
            <Link href="/predict" className="px-5 py-2.5 rounded-xl bg-goodgreen text-white font-semibold text-sm hover:bg-goodgreen-600 transition-colors">
              View Markets
            </Link>
            <button onClick={() => { setSubmitted(false); setQuestion(''); setCriteria(''); setEndDate(''); setLiquidity(''); setErrors({}) }}
              className="px-5 py-2.5 rounded-xl bg-dark-50 text-gray-300 font-semibold text-sm hover:bg-dark-50/80 transition-colors border border-gray-700/30">
              Create Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Create Market</h1>

      <form onSubmit={handleSubmit} className="bg-dark-100 rounded-2xl border border-gray-700/20 p-6 space-y-4">
        <div>
          <label htmlFor="create-market-question" className="text-xs text-gray-400 mb-1 block font-medium">Question *</label>
          <input id="create-market-question" type="text" maxLength={QUESTION_MAX} placeholder="Will X happen by Y?" value={question} onChange={e => setQuestion(e.target.value)}
            className={`w-full px-3 py-2.5 rounded-xl bg-dark-50 border text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-goodgreen/50 ${errors.question ? 'border-red-500/50' : 'border-gray-700/30'}`} />
          <div className="flex justify-between items-start gap-2 mt-1">
            <div className="flex-1 min-w-0">
              {errors.question && <p className="text-red-400 text-xs">{errors.question}</p>}
            </div>
            <CharCounter current={question.length} max={QUESTION_MAX} />
          </div>
        </div>

        <div>
          <label htmlFor="create-market-criteria" className="text-xs text-gray-400 mb-1 block font-medium">Resolution Criteria *</label>
          <textarea id="create-market-criteria" placeholder="How will this market be resolved?" value={criteria} onChange={e => setCriteria(e.target.value)} rows={3} maxLength={CRITERIA_MAX}
            className={`w-full px-3 py-2.5 rounded-xl bg-dark-50 border text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-goodgreen/50 resize-none ${errors.criteria ? 'border-red-500/50' : 'border-gray-700/30'}`} />
          <div className="flex justify-between items-start gap-2 mt-1">
            <div className="flex-1 min-w-0">
              {errors.criteria && <p className="text-red-400 text-xs">{errors.criteria}</p>}
            </div>
            <CharCounter current={criteria.length} max={CRITERIA_MAX} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="create-market-end-date" className="text-xs text-gray-400 mb-1 block font-medium">End Date *</label>
            <input id="create-market-end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className={`w-full px-3 py-2.5 rounded-xl bg-dark-50 border text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-goodgreen/50 ${errors.endDate ? 'border-red-500/50' : 'border-gray-700/30'}`} />
            {errors.endDate && <p className="text-red-400 text-xs mt-1">{errors.endDate}</p>}
          </div>
          <div>
            <label htmlFor="create-market-category" className="text-xs text-gray-400 mb-1 block font-medium">Category</label>
            <select id="create-market-category" value={category} onChange={e => setCategory(e.target.value as MarketCategory)}
              className="w-full px-3 py-2.5 rounded-xl bg-dark-50 border border-gray-700/30 text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-goodgreen/50">
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="create-market-liquidity" className="text-xs text-gray-400 mb-1 block font-medium">Initial Liquidity (USD) *</label>
          <input
            id="create-market-liquidity"
            type="text"
            inputMode="decimal"
            placeholder="Min $100"
            value={liquidity}
            onChange={e => handleLiquidityChange(e.target.value)}
            className={`w-full px-3 py-2.5 rounded-xl bg-dark-50 border text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-goodgreen/50 ${liquidityDisplayError ? 'border-red-500/50' : 'border-gray-700/30'}`}
          />
          {liquidityDisplayError && <p className="text-red-400 text-xs mt-1">{liquidityDisplayError}</p>}
          <p className="text-gray-600 text-xs mt-1">Min $100 · Max $100,000</p>
        </div>

        {txError && (
          <p className="text-red-400 text-xs text-center">{txError}</p>
        )}
        {!isConnected ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button type="button" onClick={openConnectModal}
                className="w-full py-3 rounded-xl bg-goodgreen text-white font-semibold text-sm hover:bg-goodgreen/90 transition-colors">
                Connect Wallet to Create Market
              </button>
            )}
          </ConnectButton.Custom>
        ) : (
          <button type="submit" disabled={txPhase === 'pending'}
            className="w-full py-3 rounded-xl bg-goodgreen text-white font-semibold text-sm hover:bg-goodgreen/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]">
            {txPhase === 'pending' ? 'Creating Market…' : 'Create Market'}
          </button>
        )}
        {isConnected && (
          <p className="text-[10px] text-gray-600 text-center">Requires admin wallet. Non-admin tx will revert.</p>
        )}
      </form>
    </div>
  )
}
