'use client'

import { useState, useMemo } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { InfoBanner } from '@/components/InfoBanner'
import {
  getReserves,
  getReserveBySymbol,
  getUserAccountData,
  getAvailableLiquidity,
  getUtilizationRate,
  formatAPY,
  formatUSD,
  formatHealthFactor,
  healthFactorColor,
  type LendReserve,
} from '@/lib/lendData'
import { sanitizeNumericInput } from '@/lib/format'
import {
  useLendAction,
  useReserveData,
  useUserAccountData as useOnChainAccountData,
  useConnectedAccount,
  useTokenBalance,
  parseTokenAmount,
  formatTokenAmount,
} from '@/lib/useGoodLend'
import { CONTRACTS } from '@/lib/chain'

// Map reserve symbols to devnet contract addresses
const DEVNET_RESERVE_ADDRESSES: Record<string, `0x${string}`> = {
  USDC: CONTRACTS.MockUSDC,
  WETH: CONTRACTS.MockWETH,
}

// Real devnet decimals
const DEVNET_DECIMALS: Record<string, number> = {
  USDC: 6,
  WETH: 18,
}

// ─── Health Factor Gauge ──────────────────────────────────────────────────────

function HealthFactorGauge({ hf }: { hf: number }) {
  const color = healthFactorColor(hf)
  const isWarning = isFinite(hf) && hf < 1.2
  const isDanger  = isFinite(hf) && hf < 1.0
  const pct = isFinite(hf) ? Math.min(100, (hf / 3) * 100) : 100

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-400">Health Factor</span>
        <span className={`text-sm font-bold ${color}`}>{formatHealthFactor(hf)}</span>
      </div>
      <div className="h-2 bg-dark-50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isDanger ? 'bg-red-500' : isWarning ? 'bg-yellow-400' : 'bg-goodgreen'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isWarning && (
        <p className={`text-[10px] mt-1 ${isDanger ? 'text-red-400' : 'text-yellow-400'}`}>
          {isDanger
            ? 'Position at risk of liquidation!'
            : 'Warning: health factor below 1.2 — consider repaying debt.'}
        </p>
      )}
    </div>
  )
}

// ─── Portfolio Dashboard ──────────────────────────────────────────────────────

function Dashboard() {
  const { address, isConnected } = useConnectedAccount()
  const { data: onChainAccount, isLoading } = useOnChainAccountData(address)
  const mockAccount = useMemo(() => getUserAccountData(), [])

  // Use on-chain data when available, fall back to mock
  const account = useMemo(() => {
    if (onChainAccount && isConnected) {
      return {
        ...mockAccount,
        totalCollateralUSD: onChainAccount.totalCollateralFloat,
        totalBorrowedUSD: onChainAccount.totalDebtFloat,
        healthFactor: onChainAccount.healthFactorFloat,
        availableToBorrowUSD: Math.max(0, onChainAccount.totalCollateralFloat * 0.75 - onChainAccount.totalDebtFloat),
      }
    }
    return mockAccount
  }, [onChainAccount, isConnected, mockAccount])

  if (!isConnected) {
    return (
      <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-10 text-center">
        <p className="text-gray-400 text-sm mb-4">Connect your wallet to view your lending positions.</p>
        <ConnectButton />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-10 text-center">
        <p className="text-gray-400 text-sm">Loading positions…</p>
      </div>
    )
  }

  const { healthFactor: hf } = account

  return (
    <div className="space-y-4">
      {/* Liquidation alert banner */}
      {isFinite(hf) && hf < 1.2 && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${
          hf < 1.0
            ? 'bg-red-500/10 border-red-500/30 text-red-300'
            : 'bg-yellow-400/10 border-yellow-400/30 text-yellow-300'
        }`}>
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-sm font-semibold">
              {hf < 1.0 ? 'Liquidation Risk — Act Now' : 'Low Health Factor Warning'}
            </p>
            <p className="text-xs mt-0.5 opacity-80">
              {hf < 1.0
                ? 'Your health factor is below 1.0. Your position can be liquidated. Repay debt or supply more collateral immediately.'
                : 'Health factor is below 1.2. Add collateral or repay debt to avoid liquidation.'}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-4">
          <p className="text-xs text-gray-400 mb-1">Total Supplied</p>
          <p className="text-lg font-bold text-white">{formatUSD(account.totalCollateralUSD)}</p>
        </div>
        <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-4">
          <p className="text-xs text-gray-400 mb-1">Total Borrowed</p>
          <p className="text-lg font-bold text-white">{formatUSD(account.totalBorrowedUSD)}</p>
        </div>
        <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-4">
          <p className="text-xs text-gray-400 mb-1">Net APY</p>
          <p className={`text-lg font-bold ${account.netAPY >= 0 ? 'text-goodgreen' : 'text-red-400'}`}>
            {account.netAPY >= 0 ? '+' : ''}{formatAPY(account.netAPY)}
          </p>
        </div>
        <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-4">
          <p className="text-xs text-gray-400 mb-1">Available to Borrow</p>
          <p className="text-lg font-bold text-white">{formatUSD(account.availableToBorrowUSD)}</p>
        </div>
      </div>

      {/* Health factor */}
      <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-5">
        <HealthFactorGauge hf={hf} />
        <p className="text-[10px] text-gray-500 mt-2">
          Liquidation threshold: your position is liquidatable when HF &lt; 1.0.
          Keep HF above 1.5 to stay safe.
        </p>
      </div>

      {/* Positions */}
      {account.positions.length > 0 && (
        <div className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-700/20">
            <h3 className="text-sm font-semibold text-white">Your Positions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700/10">
                  <th className="text-left px-5 py-2.5 font-medium">Asset</th>
                  <th className="text-right px-4 py-2.5 font-medium">Supplied</th>
                  <th className="text-right px-4 py-2.5 font-medium">Supply APY</th>
                  <th className="text-right px-4 py-2.5 font-medium">Borrowed</th>
                  <th className="text-right px-4 py-2.5 font-medium">Borrow APY</th>
                  <th className="text-right px-5 py-2.5 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {account.positions.map(pos => (
                  <tr key={pos.asset} className="border-b border-gray-700/10 last:border-0 hover:bg-dark-50/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-goodgreen/10 border border-goodgreen/20 flex items-center justify-center text-[10px] font-bold text-goodgreen">
                          {pos.asset.slice(0, 2)}
                        </div>
                        <span className="font-medium text-white">{pos.asset}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-white">
                      {pos.supplied > 0 ? pos.supplied.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-goodgreen">
                      {pos.supplied > 0 ? formatAPY(pos.supplyAPY) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-white">
                      {pos.borrowed > 0 ? pos.borrowed.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-red-400">
                      {pos.borrowed > 0 ? formatAPY(pos.borrowAPY) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-300">
                      {formatUSD((pos.supplied - pos.borrowed) * pos.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {account.positions.length === 0 && (
        <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-10 text-center">
          <p className="text-gray-400 text-sm">No active positions.</p>
          <p className="text-gray-500 text-xs mt-1">Switch to Markets to supply or borrow assets.</p>
        </div>
      )}
    </div>
  )
}

// ─── Action Panel (Supply / Borrow / Withdraw / Repay) ───────────────────────

type ActionTab = 'supply' | 'withdraw' | 'borrow' | 'repay'

function ActionPanel({ reserve, onClose }: { reserve: LendReserve; onClose: () => void }) {
  const [amount, setAmount] = useState('')

  const { address, isConnected } = useConnectedAccount()
  const { execute, phase, error: txError, reset: resetTx } = useLendAction()

  // Resolve devnet address for this reserve
  const reserveAddress = DEVNET_RESERVE_ADDRESSES[reserve.symbol]
  const decimals = DEVNET_DECIMALS[reserve.symbol] ?? reserve.decimals

  // User's token balance (for supply max)
  const { balance: tokenBalance } = useTokenBalance(reserveAddress, address)
  const tokenBalanceFloat = formatTokenAmount(tokenBalance, decimals)

  const parsedAmount = parseFloat(amount) || 0
  const valueUSD = parsedAmount * reserve.price

  const available = getAvailableLiquidity(reserve)
  const maxSupply = reserveAddress ? tokenBalanceFloat : Infinity
  const maxBorrow = available * 0.9

  const maxAmount = (currentTab: ActionTab) => currentTab === 'supply' ? maxSupply
    : currentTab === 'borrow' ? maxBorrow
    : Infinity  // withdraw/repay: let contract validate

  const isOverMax = (currentTab: ActionTab) => maxAmount(currentTab) !== Infinity && parsedAmount > maxAmount(currentTab)
  const hasAmount = parsedAmount > 0

  const isPending = phase === 'approving' || phase === 'pending'
  const isDone = phase === 'done'

  const tabLabels: { id: ActionTab; label: string }[] = [
    { id: 'supply', label: 'Supply' },
    { id: 'withdraw', label: 'Withdraw' },
    { id: 'borrow', label: 'Borrow' },
    { id: 'repay', label: 'Repay' },
  ]

  const getApy = (currentTab: ActionTab) => currentTab === 'supply' || currentTab === 'withdraw' ? reserve.supplyAPY : reserve.borrowAPY
  const getApyColor = (currentTab: ActionTab) => currentTab === 'supply' ? 'text-goodgreen' : currentTab === 'borrow' ? 'text-red-400' : 'text-gray-400'

  const handleSubmit = async (e: React.FormEvent, currentTab: ActionTab) => {
    e.preventDefault()
    if (!hasAmount || isOverMax(currentTab) || isPending) return
    if (!reserveAddress) return  // reserve not on devnet yet

    const amountBigInt = parseTokenAmount(amount, decimals)
    await execute(currentTab, reserveAddress, amountBigInt)
    if (phase !== 'error') setAmount('')
  }

  // Reset tx state when tab changes
  const handleTabChange = () => {
    setAmount('')
    resetTx()
  }

  return (
    <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-goodgreen/10 border border-goodgreen/20 flex items-center justify-center text-xs font-bold text-goodgreen">
            {reserve.symbol.slice(0, 2)}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{reserve.symbol}</p>
            <p className="text-[10px] text-gray-500">{reserve.name}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-dark-50 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="supply" onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-4 gap-1 mb-4 p-0">
          {tabLabels.map(t => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors data-[state=active]:bg-goodgreen/15 data-[state=active]:text-goodgreen data-[state=active]:border data-[state=active]:border-goodgreen/20 data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-white data-[state=inactive]:bg-dark-50/50 data-[state=active]:shadow-none"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

      {!isConnected ? (
        <div className="text-center py-6 space-y-3">
          <p className="text-gray-400 text-sm">Connect your wallet to interact with lending markets.</p>
          <ConnectButton />
        </div>
      ) : !reserveAddress ? (
        <div className="text-center py-6">
          <p className="text-gray-500 text-sm">This reserve is not yet deployed on devnet.</p>
        </div>
      ) : (
        <>
          {/* Tab Content */}
          {tabLabels.map(({ id: currentTab, label }) => (
            <TabsContent key={currentTab} value={currentTab} className="mt-0">
              <form onSubmit={(e) => handleSubmit(e, currentTab)} className="space-y-4">
                {/* Amount input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-400">Amount</label>
                    {currentTab === 'supply' && tokenBalanceFloat > 0 && (
                      <button type="button" onClick={() => setAmount(tokenBalanceFloat.toString())}
                        className="text-[10px] text-goodgreen/70 hover:text-goodgreen transition-colors">
                        MAX {tokenBalanceFloat.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      onChange={e => setAmount(sanitizeNumericInput(e.target.value))}
                      disabled={isPending}
                      className={`w-full px-3 py-2.5 rounded-xl bg-dark-50 border text-white text-sm outline-none focus-visible:ring-2 focus-visible:ring-goodgreen/50 pr-16 disabled:opacity-50 ${
                        isOverMax(currentTab) ? 'border-red-500/50' : 'border-gray-700/30'
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">
                      {reserve.symbol}
                    </span>
                  </div>
                  {isOverMax(currentTab) && (
                    <p className="text-red-400 text-[10px] mt-1">Exceeds available amount</p>
                  )}
                  {parsedAmount > 0 && (
                    <p className="text-[10px] text-gray-500 mt-1">≈ {formatUSD(valueUSD)}</p>
                  )}
                </div>

                {/* Info rows */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">
                      {currentTab === 'supply' ? 'Supply APY' : currentTab === 'withdraw' ? 'Current APY' : currentTab === 'borrow' ? 'Borrow APY' : 'Borrow APY'}
                    </span>
                    <span className={getApyColor(currentTab)}>{formatAPY(getApy(currentTab))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">
                      {currentTab === 'supply' ? 'You receive' : currentTab === 'withdraw' ? 'You burn' : currentTab === 'borrow' ? 'Debt token' : 'Debt repaid'}
                    </span>
                    <span className="text-gray-300">
                      {hasAmount
                        ? `${parsedAmount.toLocaleString()} g${reserve.symbol}`
                        : '—'}
                    </span>
                  </div>
                  {(currentTab === 'borrow' || currentTab === 'supply') && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Protocol fee → UBI</span>
                      <span className="text-goodgreen/70">
                        {hasAmount ? formatUSD(valueUSD * (reserve.reserveFactorBPS / 10_000) * 0.33) + '/yr' : '—'}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-400">LTV</span>
                    <span className="text-gray-300">{(reserve.ltvBPS / 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Liquidation threshold</span>
                    <span className="text-gray-300">{(reserve.liquidationThresholdBPS / 100).toFixed(0)}%</span>
                  </div>
                </div>

                {/* Tx status */}
                {phase === 'approving' && (
                  <p className="text-xs text-yellow-400 text-center">Approving token spend… confirm in wallet</p>
                )}
                {phase === 'pending' && (
                  <p className="text-xs text-blue-400 text-center">Transaction pending… confirm in wallet</p>
                )}
                {isDone && (
                  <p className="text-xs text-goodgreen text-center">Transaction confirmed!</p>
                )}
                {phase === 'error' && txError && (
                  <p className="text-xs text-red-400 text-center">{txError}</p>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!hasAmount || isOverMax(currentTab) || isPending}
                  className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-goodgreen hover:bg-goodgreen/90 text-dark"
                >
                  {isPending
                    ? phase === 'approving' ? 'Approving…' : 'Confirming…'
                    : isDone
                    ? 'Done!'
                    : `${currentTab.charAt(0).toUpperCase() + currentTab.slice(1)} ${reserve.symbol}`}
                </button>

                <div className="flex items-center justify-center gap-1.5 text-[10px] text-goodgreen/60">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Protocol fees fund GoodDollar UBI</span>
                </div>
              </form>
            </TabsContent>
          ))}
        </>
      )}
      </Tabs>
    </div>
  )
}

// ─── Markets Table ────────────────────────────────────────────────────────────

function MarketsTable({
  reserves,
  selectedSymbol,
  onSelect,
}: {
  reserves: LendReserve[]
  selectedSymbol: string | null
  onSelect: (symbol: string) => void
}) {
  return (
    <div className="bg-dark-100 rounded-2xl border border-gray-700/20 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-700/20">
        <h2 className="text-sm font-semibold text-white">Markets</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-700/10">
              <th className="text-left px-5 py-3 font-medium">Asset</th>
              <th className="text-right px-4 py-3 font-medium">Total Supplied</th>
              <th className="text-right px-4 py-3 font-medium">Supply APY</th>
              <th className="text-right px-4 py-3 font-medium">Total Borrowed</th>
              <th className="text-right px-4 py-3 font-medium">Borrow APY</th>
              <th className="text-right px-4 py-3 font-medium">Utilization</th>
              <th className="text-right px-5 py-3 font-medium">Available</th>
            </tr>
          </thead>
          <tbody>
            {reserves.map(r => {
              const utilization = getUtilizationRate(r)
              const available = getAvailableLiquidity(r)
              const isSelected = selectedSymbol === r.symbol
              return (
                <tr
                  key={r.symbol}
                  onClick={() => onSelect(r.symbol)}
                  className={`border-b border-gray-700/10 last:border-0 cursor-pointer transition-colors ${
                    isSelected ? 'bg-goodgreen/5 border-goodgreen/10' : 'hover:bg-dark-50/30'
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-goodgreen/10 border border-goodgreen/20 flex items-center justify-center text-[10px] font-bold text-goodgreen shrink-0">
                        {r.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-medium text-white">{r.symbol}</p>
                        <p className="text-[10px] text-gray-500">{r.gTokenSymbol}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right text-white">
                    {formatUSD(r.totalSupplied * r.price)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-goodgreen font-medium">
                    {formatAPY(r.supplyAPY)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-white">
                    {formatUSD(r.totalBorrowed * r.price)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-red-400">
                    {r.borrowingEnabled ? formatAPY(r.borrowAPY) : <span className="text-gray-500">Disabled</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-14 h-1.5 bg-dark-50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            utilization > 0.9 ? 'bg-red-500' : utilization > 0.7 ? 'bg-yellow-400' : 'bg-goodgreen'
                          }`}
                          style={{ width: `${utilization * 100}%` }}
                        />
                      </div>
                      <span className="text-gray-300 w-10 text-right">
                        {(utilization * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right text-gray-300">
                    {formatUSD(available * r.price)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageTab = 'markets' | 'dashboard'

export default function LendPage() {
  const mockReserves = useMemo(() => getReserves(), [])
  const [pageTab, setPageTab] = useState<PageTab>('markets')
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)

  // On-chain reserve data for the two devnet markets
  const { data: usdcData } = useReserveData(CONTRACTS.MockUSDC)
  const { data: wethData } = useReserveData(CONTRACTS.MockWETH)

  // Blend mock config with on-chain rates
  const reserves = useMemo(() => {
    return mockReserves.map(r => {
      if (r.symbol === 'USDC' && usdcData) {
        return {
          ...r,
          address: CONTRACTS.MockUSDC,
          totalSupplied: formatTokenAmount(usdcData.totalDeposits, 6),
          totalBorrowed: formatTokenAmount(usdcData.totalBorrows, 6),
          supplyAPY: usdcData.supplyAPY,
          borrowAPY: usdcData.borrowAPY,
        }
      }
      if (r.symbol === 'WETH' && wethData) {
        return {
          ...r,
          address: CONTRACTS.MockWETH,
          totalSupplied: formatTokenAmount(wethData.totalDeposits, 18),
          totalBorrowed: formatTokenAmount(wethData.totalBorrows, 18),
          supplyAPY: wethData.supplyAPY,
          borrowAPY: wethData.borrowAPY,
        }
      }
      return r
    })
  }, [mockReserves, usdcData, wethData])

  const { address, isConnected } = useConnectedAccount()
  const { data: onChainAccount } = useOnChainAccountData(address)

  const hfFloat = onChainAccount && isConnected
    ? onChainAccount.healthFactorFloat
    : getUserAccountData().healthFactor
  const hasWarning = isFinite(hfFloat) && hfFloat < 1.2

  const selectedReserve = selectedSymbol ? reserves.find(r => r.symbol === selectedSymbol) ?? null : null

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-goodgreen/10 border border-goodgreen/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-goodgreen" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">GoodLend</h1>
            <p className="text-xs text-gray-400">Supply &amp; borrow assets. 33% of interest funds UBI.</p>
          </div>
        </div>

        {/* Health factor badge in header (mobile-friendly) */}
        {hasWarning && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium ${
            hfFloat < 1.0
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-yellow-400/10 border-yellow-400/30 text-yellow-300'
          }`}>
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            HF {formatHealthFactor(hfFloat)} — {hfFloat < 1.0 ? 'At risk!' : 'Low'}
          </div>
        )}
      </div>

      <InfoBanner
        title="Devnet Preview — Mock Data"
        description="Most market figures (WBTC, DAI, G$) are hardcoded demo values. USDC and WETH supply/borrow rates are live from devnet contracts. Real on-chain data for all markets coming soon."
        storageKey="gd-banner-dismissed-lend"
      />

      {/* Page tabs */}
      <div className="flex gap-1 mb-6">
        {([
          { id: 'markets' as PageTab, label: 'Markets' },
          { id: 'dashboard' as PageTab, label: 'Dashboard' },
        ]).map(t => (
          <button key={t.id} onClick={() => setPageTab(t.id)}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-colors ${
              pageTab === t.id
                ? 'bg-goodgreen/15 text-goodgreen border border-goodgreen/20'
                : 'text-gray-400 hover:text-white bg-dark-50/50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {pageTab === 'dashboard' && <Dashboard />}

      {pageTab === 'markets' && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Markets table */}
          <div className="flex-1 min-w-0">
            <MarketsTable
              reserves={reserves}
              selectedSymbol={selectedSymbol}
              onSelect={sym => setSelectedSymbol(sym === selectedSymbol ? null : sym)}
            />

            {/* Protocol stats */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Total Value Locked</p>
                <p className="text-base font-bold text-white">
                  {formatUSD(reserves.reduce((s, r) => s + r.totalSupplied * r.price, 0))}
                </p>
              </div>
              <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Total Borrowed</p>
                <p className="text-base font-bold text-white">
                  {formatUSD(reserves.reduce((s, r) => s + r.totalBorrowed * r.price, 0))}
                </p>
              </div>
              <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">UBI Revenue / yr</p>
                <p className="text-base font-bold text-goodgreen">
                  {formatUSD(
                    reserves.reduce((s, r) =>
                      s + r.totalBorrowed * r.price * r.borrowAPY * (r.reserveFactorBPS / 10_000) * 0.33,
                      0
                    )
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Action panel */}
          {selectedReserve && (
            <div className="lg:w-80 shrink-0">
              <ActionPanel
                reserve={selectedReserve}
                onClose={() => setSelectedSymbol(null)}
              />

              {/* Reserve details */}
              <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-5 mt-4 space-y-2 text-xs">
                <h3 className="text-sm font-semibold text-white mb-3">Reserve Details</h3>
                <div className="flex justify-between">
                  <span className="text-gray-400">Max LTV</span>
                  <span className="text-white">{(selectedReserve.ltvBPS / 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Liquidation threshold</span>
                  <span className="text-white">{(selectedReserve.liquidationThresholdBPS / 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Liquidation bonus</span>
                  <span className="text-white">{((selectedReserve.liquidationBonusBPS - 10_000) / 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Reserve factor</span>
                  <span className="text-white">{(selectedReserve.reserveFactorBPS / 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">→ UBI (33% of factor)</span>
                  <span className="text-goodgreen">{((selectedReserve.reserveFactorBPS / 100) * 0.33).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">gToken</span>
                  <span className="text-gray-300 font-mono">{selectedReserve.gTokenSymbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Borrowing</span>
                  <span className={selectedReserve.borrowingEnabled ? 'text-goodgreen' : 'text-gray-500'}>
                    {selectedReserve.borrowingEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {!selectedReserve && (
            <div className="lg:w-80 shrink-0">
              <div className="bg-dark-100 rounded-2xl border border-gray-700/20 p-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-goodgreen/10 border border-goodgreen/20 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-goodgreen/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm">Select a market</p>
                <p className="text-gray-500 text-xs mt-1">Click any row to supply or borrow.</p>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-600 text-center mt-4">
        Market figures shown are devnet demo values. Live on-chain data coming soon.
      </p>
    </div>
  )
}
