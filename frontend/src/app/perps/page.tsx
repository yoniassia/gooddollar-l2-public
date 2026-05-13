'use client'

import { useState, useMemo, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'

import { formatPerpsPrice, formatLargeValue, formatFundingRate, getFundingCountdown, type PerpPair, type AccountSummaryData } from '@/lib/perpsData'
import { useOnChainPairs, useOnChainAccountSummary } from '@/lib/useOnChainPerps'
import { sanitizeNumericInput } from '@/lib/format'
import { getChartData, type Timeframe } from '@/lib/chartData'
import { useWalletReady } from '@/lib/WalletReadyContext'
import { useOpenPosition } from '@/lib/usePerps'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { PercentageChange } from '@/components/ui/percentage-change'
import { PriceDisplay } from '@/components/ui/price-display'
import { AmountInput } from '@/components/ui/amount-input'

function WalletGatedTradeButton({ hasSize, exceedsMargin, children }: { hasSize: boolean; exceedsMargin: boolean; children: React.ReactNode }) {
  const { isConnected } = useAccount()
  if (!isConnected) {
    return (
      <ConnectButton.Custom>
        {({ openConnectModal }) => (
          <button type="button" onClick={openConnectModal}
            className="w-full py-2.5 rounded-xl font-semibold text-sm bg-goodgreen text-white hover:bg-goodgreen/90 transition-colors">
            Connect Wallet to Trade
          </button>
        )}
      </ConnectButton.Custom>
    )
  }
  if (!hasSize) {
    return (
      <button type="button" disabled
        className="w-full py-2.5 rounded-xl font-semibold text-sm bg-dark-50 text-gray-400 cursor-not-allowed">
        Enter Size
      </button>
    )
  }
  return <>{children}</>
}

const PriceChart = dynamic(
  () => import('@/components/PriceChart').then(m => ({ default: m.PriceChart })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full bg-dark-50/30 rounded-xl animate-pulse" style={{ height: 400 }} />
    ),
  }
)
import { ChartErrorBoundary } from '@/components/ChartErrorBoundary'

const OrderBook = dynamic(
  () => import('@/components/OrderBook').then(m => ({ default: m.OrderBook })),
  {
    ssr: false,
    loading: () => (
      <div className="text-xs">
        <div className="flex justify-between text-gray-500 px-2 py-1.5 border-b border-gray-700/20">
          <span>Price</span><span>Size</span><span>Total</span>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex justify-between px-2 py-1">
            <div className="h-3 w-16 bg-dark-50/40 rounded animate-pulse" />
            <div className="h-3 w-10 bg-dark-50/40 rounded animate-pulse" />
            <div className="h-3 w-10 bg-dark-50/40 rounded animate-pulse" />
          </div>
        ))}
      </div>
    ),
  }
)

const RecentTrades = dynamic(
  () => import('@/components/RecentTrades').then(m => ({ default: m.RecentTrades })),
  {
    ssr: false,
    loading: () => (
      <div className="text-xs">
        <div className="flex justify-between text-gray-500 px-2 py-1.5 border-b border-gray-700/20">
          <span>Price</span><span>Size</span><span>Time</span>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex justify-between px-2 py-1">
            <div className="h-3 w-16 bg-dark-50/40 rounded animate-pulse" />
            <div className="h-3 w-10 bg-dark-50/40 rounded animate-pulse" />
            <div className="h-3 w-14 bg-dark-50/40 rounded animate-pulse" />
          </div>
        ))}
      </div>
    ),
  }
)

const OpenPositions = dynamic(
  () => import('@/components/OpenPositions').then(m => ({ default: m.OpenPositions })),
  {
    ssr: false,
    loading: () => (
      <div className="px-3 py-6 text-center">
        <div className="h-4 w-32 bg-dark-50/40 rounded animate-pulse mx-auto" />
      </div>
    ),
  }
)

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '1Y']

function PairSelector({ pairs, selected, onSelect }: { pairs: PerpPair[]; selected: string; onSelect: (s: string) => void }) {
  return (
    <div className="relative">
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {pairs.map(p => (
          <button key={p.symbol} onClick={() => onSelect(p.symbol)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selected === p.symbol ? 'bg-goodgreen/15 text-goodgreen border border-goodgreen/20' : 'text-gray-400 hover:text-white bg-dark-50/50 border border-transparent'}`}>
            {p.symbol}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#0f1117] to-transparent" aria-hidden="true" />
    </div>
  )
}

function PairInfoBar({ pair }: { pair: PerpPair }) {
  return (
    <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-3 sm:gap-6 text-xs py-2">
      <div>
        <span className="text-gray-500">Mark</span>
        <span className="text-white font-medium ml-1.5">{formatPerpsPrice(pair.markPrice)}</span>
      </div>
      <div>
        <span className="text-gray-500">24h</span>
        <span className="font-medium ml-1.5">
          <PercentageChange value={pair.change24h} decimals={2} showSign size="sm" />
        </span>
      </div>
      <div>
        <span className="text-gray-500">Vol</span>
        <span className="text-white font-medium ml-1.5">{formatLargeValue(pair.volume24h)}</span>
      </div>
      <div>
        <span className="text-gray-500">Funding</span>
        <span className={`font-medium ml-1.5 ${pair.fundingRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {formatFundingRate(pair.fundingRate)}
        </span>
      </div>
      <div>
        <span className="text-gray-500">Funding in</span>
        <span className="text-gray-300 ml-1.5">{getFundingCountdown(pair.nextFundingTime)}</span>
      </div>
      <div>
        <span className="text-gray-500">OI</span>
        <span className="text-white font-medium ml-1.5">{formatLargeValue(pair.openInterest)}</span>
      </div>
    </div>
  )
}

function LeverageSlider({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  const presets = [1, 2, 5, 10, 25, max].filter((v, i, a) => v <= max && a.indexOf(v) === i).sort((a, b) => a - b)
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-gray-400">Leverage</label>
        <span className="text-sm font-bold text-goodgreen">{value}x</span>
      </div>
      <input type="range" min={1} max={max} step={1} value={value} onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 bg-dark-50 rounded-full appearance-none cursor-pointer accent-goodgreen" />
      <div className="flex justify-between mt-1">
        {presets.map(p => (
          <button key={p} onClick={() => onChange(p)}
            className={`text-xs min-h-[44px] flex-1 rounded transition-colors ${value === p ? 'text-goodgreen font-medium' : 'text-gray-500 hover:text-gray-300'}`}>
            {p}x
          </button>
        ))}
      </div>
    </div>
  )
}

type OrderType = 'market' | 'limit' | 'stop-limit'


function OrderForm({ pair, account, marketId }: { pair: PerpPair; account: AccountSummaryData; marketId: number }) {
  const [side, setSide] = useState<'long' | 'short'>('long')
  const [orderType, setOrderType] = useState<OrderType>('market')
  const [size, setSize] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [triggerPrice, setTriggerPrice] = useState('')
  const [leverage, setLeverage] = useState(10)
  const [marginMode, setMarginMode] = useState<'cross' | 'isolated'>('cross')
  const [submitted, setSubmitted] = useState(false)
  const [showTpSl, setShowTpSl] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [tp, setTp] = useState('')
  const [sl, setSl] = useState('')
  const walletReady = useWalletReady()
  const { openPosition, phase: perpPhase, error: perpError, isDeployed } = useOpenPosition()

  useEffect(() => {
    if (leverage > pair.maxLeverage) {
      setLeverage(pair.maxLeverage)
    }
  }, [pair.maxLeverage, leverage])

  const sizeNum = parseFloat(size) || 0
  const parsedLimitPrice = parseFloat(limitPrice)
  const limitPriceInvalid = orderType !== 'market' && limitPrice !== '' && (isNaN(parsedLimitPrice) || parsedLimitPrice <= 0)
  const parsedTriggerPrice = parseFloat(triggerPrice)
  const triggerPriceInvalid = orderType === 'stop-limit' && triggerPrice !== '' && (isNaN(parsedTriggerPrice) || parsedTriggerPrice <= 0)
  const hasValidPrice = orderType === 'market' || (parsedLimitPrice > 0 && (orderType !== 'stop-limit' || parsedTriggerPrice > 0))
  const effectivePrice = orderType === 'market' ? pair.markPrice : (parsedLimitPrice > 0 ? parsedLimitPrice : 0)
  const notional = sizeNum * effectivePrice
  const marginRequired = effectivePrice > 0 ? notional / leverage : 0
  const feeRate = orderType === 'market' ? 0.0005 : 0.0002
  const fee = notional * feeRate
  const ubiFee = fee * 0.33
  const liqPrice = effectivePrice > 0
    ? side === 'long'
      ? effectivePrice * (1 - 0.9 / leverage)
      : effectivePrice * (1 + 0.9 / leverage)
    : 0

  const parsedTp = parseFloat(tp)
  const parsedSl = parseFloat(sl)
  const tpInvalid = tp !== '' && (isNaN(parsedTp) || parsedTp <= 0 ||
    (side === 'long' && effectivePrice > 0 && parsedTp <= effectivePrice) ||
    (side === 'short' && effectivePrice > 0 && parsedTp >= effectivePrice))
  const slInvalid = sl !== '' && (isNaN(parsedSl) || parsedSl <= 0 ||
    (side === 'long' && effectivePrice > 0 && parsedSl >= effectivePrice) ||
    (side === 'short' && effectivePrice > 0 && parsedSl <= effectivePrice))
  const tpPnl = !isNaN(parsedTp) && parsedTp > 0 && sizeNum > 0
    ? (side === 'long' ? (parsedTp - effectivePrice) * sizeNum : (effectivePrice - parsedTp) * sizeNum)
    : 0
  const slPnl = !isNaN(parsedSl) && parsedSl > 0 && sizeNum > 0
    ? (side === 'long' ? (parsedSl - effectivePrice) * sizeNum : (effectivePrice - parsedSl) * sizeNum)
    : 0

  const exceedsMargin = sizeNum > 0 && marginRequired > account.availableMargin

  // Calculate max size based on available margin
  const maxSize = effectivePrice > 0 ? (account.availableMargin * leverage) / effectivePrice : 0
  const notionalValue = sizeNum * effectivePrice

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sizeNum <= 0 || exceedsMargin || !hasValidPrice || limitPriceInvalid || triggerPriceInvalid) return

    if (isDeployed && orderType === 'market') {
      // Convert to G$ wei (18 decimals). Assume G$ ≈ $0.01 on devnet.
      const GD_PRICE_USD = 0.01
      const notionalGD = notional / GD_PRICE_USD
      const marginGD = marginRequired / GD_PRICE_USD
      const sizeWei = BigInt(Math.round(notionalGD * 1e18))
      const marginWei = BigInt(Math.round(marginGD * 1e18))
      await openPosition(BigInt(marketId), marginWei, sizeWei, side === 'long')
    } else {
      // Limit/stop orders or contracts not deployed: UI-only preview
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 3000)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <button type="button" onClick={() => setSide('long')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${side === 'long' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-dark-50/50 text-gray-400 border border-transparent'}`}>
          Long
        </button>
        <button type="button" onClick={() => setSide('short')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${side === 'short' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-dark-50/50 text-gray-400 border border-transparent'}`}>
          Short
        </button>
      </div>

      <div className="flex gap-1">
        {(['market', 'limit', 'stop-limit'] as OrderType[]).map(ot => (
          <button key={ot} type="button" onClick={() => setOrderType(ot)}
            className={`flex-1 px-2 min-h-[44px] rounded-lg text-xs font-medium capitalize transition-colors ${orderType === ot ? 'bg-goodgreen/15 text-goodgreen' : 'text-gray-400 hover:text-white'}`}>
            {ot}
          </button>
        ))}
      </div>

      <LeverageSlider value={leverage} onChange={setLeverage} max={pair.maxLeverage} />

      <div>
        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1">
          {showAdvanced ? '▾' : '▸'} Advanced Options
          {marginMode === 'isolated' && !showAdvanced && (
            <span className="text-[10px] text-gray-600 ml-1">Isolated</span>
          )}
        </button>
        {showAdvanced && (
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Margin Mode</label>
              <div className="flex gap-1">
                <button type="button" onClick={() => setMarginMode('cross')}
                  className={`flex-1 min-h-[44px] rounded text-xs font-medium transition-colors ${marginMode === 'cross' ? 'bg-dark-50 text-white' : 'text-gray-500'}`}>
                  Cross
                </button>
                <button type="button" onClick={() => setMarginMode('isolated')}
                  className={`flex-1 min-h-[44px] rounded text-xs font-medium transition-colors ${marginMode === 'isolated' ? 'bg-dark-50 text-white' : 'text-gray-500'}`}>
                  Isolated
                </button>
              </div>
            </div>
            {effectivePrice > 0 && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Quick Size</label>
                <div className="flex gap-1">
                  {[0.25, 0.5, 0.75, 1].map(pct => {
                    const maxSize = (account.availableMargin * leverage) / effectivePrice
                    const targetSize = maxSize * pct
                    const decimals = effectivePrice >= 10000 ? 4 : effectivePrice >= 100 ? 3 : effectivePrice >= 1 ? 2 : 0
                    const rounded = parseFloat(targetSize.toFixed(decimals))
                    const isActive = sizeNum > 0 && Math.abs(sizeNum - rounded) < 10 ** (-decimals) * 0.6
                    return (
                      <button key={pct} type="button" onClick={() => setSize(rounded.toString())}
                        className={`flex-1 min-h-[44px] rounded text-xs font-medium transition-colors ${isActive ? 'bg-goodgreen/15 text-goodgreen' : 'text-gray-500 hover:text-gray-300 bg-dark-50/30'}`}>
                        {pct * 100}%
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {orderType === 'stop-limit' && (
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Trigger Price</label>
          <input type="text" inputMode="decimal" placeholder={formatPerpsPrice(pair.markPrice)}
            value={triggerPrice} onChange={e => setTriggerPrice(sanitizeNumericInput(e.target.value))}
            className={`w-full px-3 py-2 rounded-xl bg-dark-50 border text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-goodgreen/50 ${triggerPriceInvalid ? 'border-red-500/50' : 'border-gray-700/30'}`} />
          {triggerPriceInvalid && (
            <p className="text-red-400 text-[10px] mt-1">Price must be greater than 0</p>
          )}
        </div>
      )}

      {orderType !== 'market' && (
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Limit Price</label>
          <input type="text" inputMode="decimal" placeholder={formatPerpsPrice(pair.markPrice)}
            value={limitPrice} onChange={e => setLimitPrice(sanitizeNumericInput(e.target.value))}
            className={`w-full px-3 py-2 rounded-xl bg-dark-50 border text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-goodgreen/50 ${limitPriceInvalid ? 'border-red-500/50' : 'border-gray-700/30'}`} />
          {limitPriceInvalid && (
            <p className="text-red-400 text-[10px] mt-1">Price must be greater than 0</p>
          )}
        </div>
      )}

      <div>
        <label className="text-xs text-gray-400 mb-1 block">Size ({pair.baseAsset})</label>
        <AmountInput
          value={size}
          onChange={setSize}
          maxValue={maxSize}
          maxValueLabel="max size"
          symbol={pair.baseAsset}
          usdValue={notionalValue}
          error={exceedsMargin ? `Exceeds available margin (${formatPerpsPrice(account.availableMargin)})` : false}
          placeholder="0.00"
        />
      </div>

      <div>
        <button type="button" onClick={() => setShowTpSl(!showTpSl)}
          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1">
          {showTpSl ? '▾' : '▸'} TP / SL
          {(tp || sl) && !showTpSl && (
            <span className="text-[10px] text-gray-600 ml-1">
              {tp ? `TP ${formatPerpsPrice(parsedTp)}` : ''}{tp && sl ? ' / ' : ''}{sl ? `SL ${formatPerpsPrice(parsedSl)}` : ''}
            </span>
          )}
        </button>
        {showTpSl && (
          <div className="space-y-2 mt-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Take Profit</label>
              <AmountInput
                value={tp}
                onChange={setTp}
                symbol="USD"
                showMaxButton={false}
                error={tpInvalid && tp !== '' ? (side === 'long' ? 'TP must be above entry price' : 'TP must be below entry price') : false}
                placeholder={side === 'long' ? `Above ${formatPerpsPrice(effectivePrice)}` : `Below ${formatPerpsPrice(effectivePrice)}`}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Stop Loss</label>
              <AmountInput
                value={sl}
                onChange={setSl}
                symbol="USD"
                showMaxButton={false}
                error={slInvalid && sl !== '' ? (side === 'long' ? 'SL must be below entry price' : 'SL must be above entry price') : false}
                placeholder={side === 'long' ? `Below ${formatPerpsPrice(effectivePrice)}` : `Above ${formatPerpsPrice(effectivePrice)}`}
              />
            </div>
          </div>
        )}
      </div>

      {sizeNum > 0 && hasValidPrice && effectivePrice > 0 && (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between text-gray-400"><span>Notional</span><span className="text-white truncate ml-2">{formatPerpsPrice(notional)}</span></div>
          <div className="flex justify-between text-gray-400"><span>Margin</span><span className="text-white truncate ml-2">{formatPerpsPrice(marginRequired)}</span></div>
          <div className="flex justify-between text-gray-400"><span>Liq. Price</span><span className="text-yellow-400 truncate ml-2">{formatPerpsPrice(liqPrice)}</span></div>
          <div className="flex justify-between text-gray-400"><span>Fee ({orderType === 'market' ? '0.05%' : '0.02%'})</span><span className="text-white truncate ml-2">{formatLargeValue(fee)}</span></div>
          <div className="flex justify-between text-goodgreen/80"><span>→ UBI (33%)</span><span className="truncate ml-2">{formatLargeValue(ubiFee)}</span></div>
          {tpPnl !== 0 && !tpInvalid && (
            <div className="flex justify-between text-gray-400"><span>TP P&L</span><span className="truncate ml-2"><PriceDisplay value={tpPnl} prefix="$" showSign size="xs" showContext contextLabel="if hit" /></span></div>
          )}
          {slPnl !== 0 && !slInvalid && (
            <div className="flex justify-between text-gray-400"><span>SL P&L</span><span className="truncate ml-2"><PriceDisplay value={slPnl} prefix="$" showSign size="xs" showContext contextLabel="if hit" /></span></div>
          )}
        </div>
      )}

      {perpError && (
        <p className="text-[10px] text-red-400 text-center truncate">{perpError}</p>
      )}
      {walletReady ? (
        <WalletGatedTradeButton hasSize={sizeNum > 0} exceedsMargin={exceedsMargin}>
          <button type="submit"
            disabled={exceedsMargin || limitPriceInvalid || triggerPriceInvalid || !hasValidPrice || perpPhase === 'approving' || perpPhase === 'pending'}
            className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              side === 'long' ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
            }`}>
            {perpPhase === 'approving' ? 'Approving…' : perpPhase === 'pending' ? 'Confirming…' : perpPhase === 'done' ? 'Order Placed!' : submitted ? 'Order Placed!' : `${side === 'long' ? 'Long' : 'Short'} ${pair.baseAsset}`}
          </button>
        </WalletGatedTradeButton>
      ) : (
        <button type="submit" disabled={sizeNum <= 0 || exceedsMargin || limitPriceInvalid || triggerPriceInvalid || !hasValidPrice}
          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            side === 'long' ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
          }`}>
          {submitted ? 'Order Placed!' : `${side === 'long' ? 'Long' : 'Short'} ${pair.baseAsset}`}
        </button>
      )}

      {sizeNum <= 0 && size !== '' && (
        <p className="text-center text-[10px] text-gray-500">Enter a valid size to place order</p>
      )}

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-goodgreen/60">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
        <span>Fees → 33% funds UBI</span>
      </div>
    </form>
  )
}

function AccountPanel() {
  const { summary: account } = useOnChainAccountSummary()
  return (
    <div className="space-y-2.5 text-xs">
      <h3 className="text-sm font-semibold text-white mb-3">Account</h3>
      <div className="flex justify-between">
        <span className="text-gray-400">Balance</span>
        <span className="text-white font-medium">{formatPerpsPrice(account.balance)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Equity</span>
        <span className="text-white font-medium">{formatPerpsPrice(account.equity)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Unrealized P&L</span>
        <span className="font-medium">
          <PriceDisplay value={account.unrealizedPnl} prefix="$" showSign size="sm" showContext contextLabel="open positions" />
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Margin Used</span>
        <span className="text-white font-medium">{formatPerpsPrice(account.marginUsed)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Available</span>
        <span className="text-goodgreen font-medium">{formatPerpsPrice(account.availableMargin)}</span>
      </div>
      <div className="pt-1">
        <div className="flex justify-between mb-1">
          <span className="text-gray-400">Margin Ratio</span>
          <span className="text-white font-medium">{(account.marginRatio * 100).toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-dark-50 rounded-full overflow-hidden">
          <div className="h-full bg-goodgreen rounded-full transition-all" style={{ width: `${account.marginRatio * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

type MobileTab = 'chart' | 'book' | 'trade'

export default function PerpsPage() {
  const { pairs } = useOnChainPairs()
  const { summary: account } = useOnChainAccountSummary()
  const [selectedSymbol, setSelectedSymbol] = useState('BTC-USD')
  const [timeframe, setTimeframe] = useState<Timeframe>('1M')
  const [mobileTab, setMobileTab] = useState<MobileTab>('trade')

  const pair = pairs.find(p => p.symbol === selectedSymbol) ?? pairs[0]

  const chartData = useMemo(() => {
    if (!pair) return []
    return getChartData(pair.symbol, timeframe, pair.markPrice)
  }, [pair, timeframe])

  if (!pair) return null

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-goodgreen/10 border border-goodgreen/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-goodgreen" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Perpetual Futures</h1>
            <p className="text-xs text-gray-400">Trade with up to {pair.maxLeverage}x leverage. Every fee funds UBI.</p>
          </div>
        </div>
      </div>

      <PairSelector pairs={pairs} selected={selectedSymbol} onSelect={setSelectedSymbol} />

      <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-3 mt-3 mb-3">
        <PairInfoBar pair={pair} />
        <div className="flex items-center gap-3 pt-1 text-xs">
          <Link href={`/explore/${pair.baseAsset === 'BTC' ? 'WBTC' : pair.baseAsset}`}
            className="text-gray-500 hover:text-goodgreen transition-colors inline-flex items-center gap-1">
            Spot {pair.baseAsset} on Explore
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </Link>
          <Link href={`/?buy=${pair.baseAsset === 'BTC' ? 'WBTC' : pair.baseAsset}`}
            className="text-gray-500 hover:text-goodgreen transition-colors inline-flex items-center gap-1">
            Swap {pair.baseAsset}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </div>

      {/* Mobile tab strip — Chart / Book / Trade */}
      <div className="lg:hidden flex gap-1 mb-3">
        {(['chart', 'book', 'trade'] as MobileTab[]).map(tab => (
          <button key={tab} onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize transition-colors ${
              mobileTab === tab
                ? 'bg-goodgreen/15 text-goodgreen border border-goodgreen/20'
                : 'text-gray-400 bg-dark-50/50 border border-transparent hover:text-white'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Chart panel — always visible on desktop; on mobile only when chart tab active */}
        <div className={`flex-1 min-w-0 ${mobileTab !== 'chart' ? 'hidden lg:block' : ''}`}>
          <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-4">
            <div className="flex gap-1 mb-3">
              {TIMEFRAMES.map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${timeframe === tf ? 'bg-goodgreen/15 text-goodgreen' : 'text-gray-400 hover:text-white'}`}>
                  {tf}
                </button>
              ))}
            </div>
            <ChartErrorBoundary>
              <PriceChart data={chartData} height={400} />
            </ChartErrorBoundary>
          </div>
        </div>

        {/* Trade panel — always visible on desktop; on mobile only when trade tab active */}
        <div className={`lg:w-80 shrink-0 space-y-4 ${mobileTab !== 'trade' ? 'hidden lg:block' : ''}`}>
          <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-5">
            <OrderForm pair={pair} account={account} marketId={pairs.findIndex(p => p.symbol === pair.symbol)} />
          </div>

          <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-5">
            <AccountPanel />
          </div>
        </div>
      </div>

      {/* Order book / trades / positions grid */}
      {/* On mobile: visible when book tab active; on desktop: always visible */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4 ${mobileTab !== 'book' ? 'hidden lg:grid' : ''}`}>
        <div className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700/20">
            <h3 className="text-xs font-semibold text-white">Order Book</h3>
          </div>
          <OrderBook markPrice={pair.markPrice} />
        </div>

        <div className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700/20">
            <h3 className="text-xs font-semibold text-white">Recent Trades</h3>
          </div>
          <RecentTrades markPrice={pair.markPrice} />
        </div>

        <div className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-700/20">
            <h3 className="text-xs font-semibold text-white">Open Positions</h3>
          </div>
          <OpenPositions />
        </div>
      </div>
    </div>
  )
}
