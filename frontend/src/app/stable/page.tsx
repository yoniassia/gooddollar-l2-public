'use client'

import { useState, useMemo } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { WalletButton } from '@/components/WalletButton'
import { sanitizeNumericInput } from '@/lib/format'
import {
  ILKS,
  ILK_ETH,
  ILK_GD,
  ILK_USDC,
  useVault,
  useGUSDBalance,
  useGUSDTotalSupply,
  useCollateralBalance,
  useStableAction,
  useConnectedAccount,
  maxMintable,
  type IlkKey,
  type StableActionKind,
  type VaultState,
} from '@/lib/useGoodStable'
import { usePriceFeeds, getPrice } from '@/lib/usePriceFeeds'

const ILK_CONFIG = {
  [ILK_ETH]:  { label: 'WETH', symbol: 'WETH',  ratio: '150%', fee: '~2% APY',    color: 'text-blue-400',     icon: 'ETH', minRatio: 1.5 },
  [ILK_GD]:   { label: 'G$',   symbol: 'G$',    ratio: '200%', fee: '~3% APY',    color: 'text-goodgreen',    icon: 'G$',  minRatio: 2.0 },
  [ILK_USDC]: { label: 'USDC', symbol: 'USDC',  ratio: '101%', fee: '~0.5% APY',  color: 'text-emerald-400',  icon: '$',   minRatio: 1.01 },
} as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 4) {
  if (!isFinite(n) || isNaN(n)) return '0'
  return n.toFixed(decimals)
}

function fmtUSD(n: number) {
  if (!isFinite(n) || isNaN(n) || n === 0) return '$0'
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return '$' + n.toFixed(2)
}

function fmtHF(hf: number) {
  if (!isFinite(hf)) return '∞'
  return hf.toFixed(2)
}

function hfColor(hf: number) {
  if (!isFinite(hf)) return 'text-goodgreen'
  if (hf >= 2.0) return 'text-goodgreen'
  if (hf >= 1.5) return 'text-yellow-400'
  if (hf >= 1.1) return 'text-orange-400'
  return 'text-red-400'
}

function hfBarColor(hf: number) {
  if (!isFinite(hf)) return 'bg-goodgreen'
  if (hf >= 2.0) return 'bg-goodgreen'
  if (hf >= 1.5) return 'bg-yellow-400'
  if (hf >= 1.1) return 'bg-orange-400'
  return 'bg-red-500'
}

/** Convert health factor to a 0–100 bar fill (clamped, logarithmic feel). */
function hfToBarPct(hf: number, minRatio: number): number {
  if (!isFinite(hf)) return 100
  // liquidation at minRatio*1.0; healthy at minRatio*2.0+ → 100%
  const safe = minRatio * 2
  return Math.min(100, Math.max(2, ((hf - minRatio) / (safe - minRatio)) * 100))
}

// ─── Health Factor Bar ────────────────────────────────────────────────────────

function HealthBar({ hf, minRatio }: { hf: number; minRatio: number }) {
  const pct = hfToBarPct(hf, minRatio)
  return (
    <div className="mt-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-500">Health Factor</span>
        <span className={`text-xs font-semibold ${hfColor(hf)}`}>{fmtHF(hf)}</span>
      </div>
      <div className="h-1.5 bg-dark-50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${hfBarColor(hf)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-red-400/60">Liq.</span>
        <span className="text-[10px] text-goodgreen/60">Safe</span>
      </div>
    </div>
  )
}

// ─── Vault panel ──────────────────────────────────────────────────────────────

const ACTION_TABS: StableActionKind[] = ['deposit', 'withdraw', 'mint', 'repay', 'close']

function VaultPanel({ ilkKey, prices }: { ilkKey: IlkKey; prices: Record<string, number> }) {
  const cfg = ILK_CONFIG[ilkKey]
  const ilkMeta = ILKS.find(i => i.key === ilkKey)!

  const address = useConnectedAccount()
  const price = getPrice(prices, cfg.symbol)
  const liquidationRatio = ilkMeta.minRatio / 100

  const { data: vault, isLoading: vaultLoading } = useVault(
    ilkKey, address, ilkMeta.decimals, price, liquidationRatio,
  )
  const { balanceFloat: collateralBalance } = useCollateralBalance(
    ilkMeta.tokenAddress, ilkMeta.decimals, address,
  )
  const { balanceFloat: gusdBalance } = useGUSDBalance(address)
  const { execute, phase, error, reset } = useStableAction()

  const [amount, setAmount] = useState('')

  const busy = phase !== 'idle' && phase !== 'done' && phase !== 'error'
  const hasPosition = vault?.hasPosition ?? false
  const collateralUSD = (vault?.collateralFloat ?? 0) * price

  const getPhaseLabel = (currentTab: StableActionKind): Record<typeof phase, string> => ({
    idle: (
      currentTab === 'deposit'  ? 'Deposit' :
      currentTab === 'withdraw' ? 'Withdraw' :
      currentTab === 'mint'     ? 'Mint gUSD' :
      currentTab === 'repay'    ? 'Repay gUSD' :
      /* close */                 'Close Vault'
    ),
    approving:  'Approving…',
    submitting: 'Submitting…',
    confirming: 'Confirming…',
    done:       'Done!',
    error:      'Try Again',
  })

  const maxDeposit  = collateralBalance
  const maxWithdraw = vault ? vault.collateralFloat : 0
  const maxMint     = vault ? maxMintable(vault.collateralFloat, price, liquidationRatio, vault.actualDebtFloat) : 0
  const maxRepay    = vault ? Math.min(vault.actualDebtFloat, gusdBalance) : 0

  function handleMax(currentTab: StableActionKind) {
    const maxVal =
      currentTab === 'deposit'  ? maxDeposit :
      currentTab === 'withdraw' ? maxWithdraw :
      currentTab === 'mint'     ? maxMint :
      currentTab === 'repay'    ? maxRepay :
      0
    setAmount(fmt(maxVal, 6))
  }

  function handleSubmit(currentTab: StableActionKind) {
    if (currentTab === 'close') {
      execute('close', ilkKey, '0', ilkMeta.tokenAddress, ilkMeta.decimals)
      return
    }
    if (!amount || !address) return
    execute(currentTab, ilkKey, amount, ilkMeta.tokenAddress, ilkMeta.decimals)
      .then(() => { if (phase === 'done') setAmount('') })
  }

  return (
    <div className="rounded-2xl bg-dark-100 border border-dark-50/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-dark-50/30">
        <div className={`w-10 h-10 rounded-full bg-dark-50 flex items-center justify-center font-bold text-sm ${cfg.color}`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold">{cfg.label} Vault</div>
          <div className="text-xs text-gray-400">Min. ratio {cfg.ratio} · {cfg.fee}</div>
        </div>
        {hasPosition && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-goodgreen/10 text-goodgreen border border-goodgreen/20">Active</span>
        )}
      </div>

      {/* Stats */}
      <div className="px-5 pt-3 pb-2 border-b border-dark-50/30">
        <div className="grid grid-cols-3 gap-2 mb-1">
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">Collateral</div>
            <div className="text-sm font-medium text-white">
              {vaultLoading ? '…' : `${fmt(vault?.collateralFloat ?? 0, 4)} ${cfg.label}`}
            </div>
            {!vaultLoading && collateralUSD > 0 && (
              <div className="text-[11px] text-gray-500">{fmtUSD(collateralUSD)}</div>
            )}
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">Debt</div>
            <div className="text-sm font-medium text-white">
              {vaultLoading ? '…' : `${fmt(vault?.actualDebtFloat ?? 0, 2)} gUSD`}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-0.5">Ratio</div>
            <div className={`text-sm font-medium ${hfColor(vault?.healthFactor ?? Infinity)}`}>
              {vaultLoading ? '…' : (
                isFinite(vault?.healthFactor ?? Infinity)
                  ? `${((vault!.healthFactor) * 100).toFixed(0)}%`
                  : '—'
              )}
            </div>
          </div>
        </div>
        {!vaultLoading && hasPosition && (
          <HealthBar hf={vault!.healthFactor} minRatio={liquidationRatio} />
        )}
      </div>

      {/* Action tabs */}
      <div className="p-4">
        <Tabs defaultValue="deposit" onValueChange={() => { setAmount(''); reset() }}>
          <TabsList className="grid w-full bg-dark-50/30 p-1 rounded-xl mb-4" style={{ gridTemplateColumns: `repeat(${ACTION_TABS.filter(t => t !== 'close' || hasPosition).length}, 1fr)` }}>
            {ACTION_TABS.filter(t => t !== 'close' || hasPosition).map(t => (
              <TabsTrigger
                key={t}
                value={t}
                className={`py-1.5 rounded-lg text-xs font-medium transition-colors capitalize whitespace-nowrap px-1 ${
                  t === 'close'
                    ? 'data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400 data-[state=inactive]:text-red-400/60 data-[state=inactive]:hover:text-red-400'
                    : 'data-[state=active]:bg-goodgreen data-[state=active]:text-white data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-white'
                } data-[state=active]:shadow-none`}
              >
                {t === 'mint' ? 'Mint' : t === 'repay' ? 'Repay' : t === 'deposit' ? 'Deposit' : t === 'withdraw' ? 'Withdraw' : 'Close'}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Tab Content */}
          {ACTION_TABS.filter(t => t !== 'close' || hasPosition).map(currentTab => (
            <TabsContent key={currentTab} value={currentTab} className="mt-0">
              {currentTab === 'close' ? (
                <div className="mb-3 p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-xs text-gray-400 space-y-1">
                  <p className="font-medium text-red-400">Close Vault</p>
                  <p>Repays all outstanding debt ({fmt(vault?.actualDebtFloat ?? 0, 2)} gUSD) and returns your collateral ({fmt(vault?.collateralFloat ?? 0, 4)} {cfg.label}) in a single transaction.</p>
                  <p className="text-gray-500">Requires sufficient gUSD balance. Current balance: {fmt(gusdBalance, 2)} gUSD.</p>
                </div>
              ) : (
                <>
                  {/* Amount input */}
                  <div className="relative mb-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amount}
                      onChange={e => setAmount(sanitizeNumericInput(e.target.value))}
                      className="w-full bg-dark-50/50 border border-dark-50 rounded-xl px-4 py-3 pr-20 text-white text-base placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-goodgreen/40"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <button
                        onClick={() => handleMax(currentTab)}
                        className="text-xs text-goodgreen hover:text-goodgreen/80 font-medium"
                      >
                        MAX
                      </button>
                      <span className="text-xs text-gray-400">
                        {currentTab === 'mint' || currentTab === 'repay' ? 'gUSD' : cfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Helper text */}
                  <div className="text-xs text-gray-500 mb-3">
                    {currentTab === 'deposit'  && `Wallet: ${fmt(maxDeposit, 4)} ${cfg.label}`}
                    {currentTab === 'withdraw' && `Max: ${fmt(maxWithdraw, 4)} ${cfg.label}`}
                    {currentTab === 'mint'     && `Max safe: ${fmt(maxMint, 2)} gUSD`}
                    {currentTab === 'repay'    && `Outstanding: ${fmt(maxRepay, 2)} gUSD`}
                  </div>
                </>
              )}

              {/* Submit */}
              {address ? (
                <button
                  onClick={() => {
                    if (phase === 'done' || phase === 'error') {
                      reset()
                    } else {
                      handleSubmit(currentTab)
                    }
                  }}
                  disabled={busy || (currentTab !== 'close' && !amount && phase === 'idle')}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.99] ${
                    phase === 'done'
                      ? 'bg-goodgreen/20 text-goodgreen border border-goodgreen/30'
                      : phase === 'error'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : currentTab === 'close'
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed'
                      : 'bg-goodgreen text-white hover:bg-goodgreen/90 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  {getPhaseLabel(currentTab)[phase]}
                </button>
              ) : (
                <div className="flex justify-center">
                  <WalletButton />
                </div>
              )}

              {error && (
                <p className="mt-2 text-xs text-red-400 text-center">{error}</p>
              )}
            </TabsContent>
          ))}
        </Tabs>

      </div>
    </div>
  )
}

// ─── Position summary (all vaults) ───────────────────────────────────────────

function PositionSummary({ address, prices }: { address: `0x${string}` | undefined; prices: Record<string, number> }) {
  const ethVault = useVault(ILK_ETH,  address, 18, getPrice(prices, 'WETH'), 1.5)
  const gdVault  = useVault(ILK_GD,   address, 18, getPrice(prices, 'G$'),   2.0)
  const udcVault = useVault(ILK_USDC, address, 6,  getPrice(prices, 'USDC'), 1.01)

  const summary = useMemo(() => {
    const wethPrice = getPrice(prices, 'WETH')
    const gdPrice   = getPrice(prices, 'G$')
    const usdcPrice = getPrice(prices, 'USDC')
    const vaults = [
      { v: ethVault.data,  price: wethPrice },
      { v: gdVault.data,   price: gdPrice },
      { v: udcVault.data,  price: usdcPrice },
    ]
    let totalCollateralUSD = 0
    let totalDebt = 0
    let hasAny = false

    for (const { v, price } of vaults) {
      if (!v) continue
      totalCollateralUSD += v.collateralFloat * price
      totalDebt += v.actualDebtFloat
      if (v.hasPosition) hasAny = true
    }

    const cr = totalDebt > 0 ? (totalCollateralUSD / totalDebt) * 100 : null

    return { totalCollateralUSD, totalDebt, cr, hasAny }
  }, [ethVault.data, gdVault.data, udcVault.data, prices])

  if (!address || !summary.hasAny) return null

  return (
    <div className="rounded-xl bg-dark-100 border border-dark-50/50 px-5 py-4 mb-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Your Position</h2>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Collateral Locked</div>
          <div className="text-lg font-bold text-white">{fmtUSD(summary.totalCollateralUSD)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">gUSD Minted</div>
          <div className="text-lg font-bold text-white">{fmt(summary.totalDebt, 2)} gUSD</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Avg Coll. Ratio</div>
          <div className={`text-lg font-bold ${summary.cr !== null ? (summary.cr >= 200 ? 'text-goodgreen' : summary.cr >= 150 ? 'text-yellow-400' : 'text-red-400') : 'text-gray-500'}`}>
            {summary.cr !== null ? `${summary.cr.toFixed(0)}%` : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Protocol stats bar ───────────────────────────────────────────────────────

function ProtocolStats() {
  const { totalSupplyFloat, isLoading } = useGUSDTotalSupply()
  const supplyDisplay = isLoading
    ? '…'
    : totalSupplyFloat > 0
      ? totalSupplyFloat.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' gUSD'
      : '—'

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[
        { label: 'Total gUSD Supply', value: supplyDisplay, sub: 'live from devnet' },
        { label: 'UBI Fees Routed',   value: '33%',         sub: 'of stability fees' },
        { label: 'Min. Ratio',        value: '101–200%',    sub: 'depends on collateral' },
      ].map(s => (
        <div key={s.label} className="rounded-xl bg-dark-100 border border-dark-50/50 px-4 py-3 text-center">
          <div className="text-lg font-bold text-white">{s.value}</div>
          <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
          <div className="text-[11px] text-gray-600 mt-0.5">{s.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StablePage() {
  const address = useConnectedAccount()
  const { prices } = usePriceFeeds(['WETH', 'G$', 'USDC'])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-goodgreen/10 border border-goodgreen/20 flex items-center justify-center">
            <span className="text-goodgreen font-bold text-sm">gUSD</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">GoodStable</h1>
            <p className="text-sm text-gray-400">Mint gUSD stablecoin by locking collateral</p>
          </div>
        </div>
        <p className="text-sm text-gray-500 max-w-xl">
          Lock WETH, G$, or USDC to mint gUSD — a decentralised stablecoin backed by overcollateralized vaults.
          33% of stability fees fund the UBI pool.
        </p>
      </div>

      <ProtocolStats />
      <PositionSummary address={address} prices={prices} />

      {/* Vault panels */}
      <div className="grid gap-4 md:grid-cols-3">
        <VaultPanel ilkKey={ILK_ETH} prices={prices} />
        <VaultPanel ilkKey={ILK_GD} prices={prices} />
        <VaultPanel ilkKey={ILK_USDC} prices={prices} />
      </div>

      {/* How it works */}
      <div className="mt-8 rounded-2xl bg-dark-100 border border-dark-50/50 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">How GoodStable works</h2>
        <ol className="space-y-2 text-sm text-gray-400">
          <li><span className="text-goodgreen font-medium">1.</span> Deposit collateral (WETH, G$, or USDC) into a vault.</li>
          <li><span className="text-goodgreen font-medium">2.</span> Mint gUSD up to the safe collateralisation limit.</li>
          <li><span className="text-goodgreen font-medium">3.</span> Use gUSD anywhere — swap, lend, or bridge across chains.</li>
          <li><span className="text-goodgreen font-medium">4.</span> Repay gUSD + accrued stability fee to unlock your collateral.</li>
          <li><span className="text-goodgreen font-medium">5.</span> Keep your health factor above 1.0 to avoid liquidation.</li>
          <li><span className="text-goodgreen font-medium">6.</span> Use <em>Close Vault</em> to repay all debt and withdraw all collateral in one step.</li>
        </ol>
      </div>
    </div>
  )
}
