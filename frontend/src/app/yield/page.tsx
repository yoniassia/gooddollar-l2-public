'use client'

import { useState, useMemo } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { InfoBanner } from '@/components/InfoBanner'
import { sanitizeNumericInput } from '@/lib/format'
import {
  useVaultCount,
  useVaultAddresses,
  useVaultDetails,
  useUserVaultPosition,
  useTokenBalance,
  useTokenAllowance,
  useYieldAction,
  parseTokenAmount,
  formatTokenAmount,
  formatEther,
  type VaultInfo,
} from '@/lib/useGoodYield'
import { useAccount } from 'wagmi'
import type { Address } from 'viem'

// ─── Strategy labels ──────────────────────────────────────────────────────────

const STRATEGY_LABELS: Record<string, string> = {}

function strategyLabel(addr: string): string {
  return STRATEGY_LABELS[addr.toLowerCase()] ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBPS(bps: bigint): string {
  return `${(Number(bps) / 100).toFixed(1)}%`
}

function fmtUBI(amount: bigint): string {
  const n = Number(formatEther(amount))
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  return n.toFixed(2)
}

function estimateAPY(vault: VaultInfo): string {
  // Rough APY based on total gain vs total assets + time since inception
  if (vault.totalAssets === 0n || vault.lastReport === 0n) return '—'
  const gain = Number(formatEther(vault.totalGainSinceInception))
  const assets = Number(formatEther(vault.totalAssets))
  if (assets <= 0) return '—'
  // Simplified: gain / assets * annualized
  const pct = (gain / assets) * 100
  return pct > 0 ? `~${pct.toFixed(1)}%` : '—'
}

// ─── Vault Card ───────────────────────────────────────────────────────────────

function VaultCard({
  vault,
  isSelected,
  onSelect,
}: {
  vault: VaultInfo
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl border transition-all ${
        isSelected
          ? 'border-goodgreen bg-goodgreen/10 ring-1 ring-goodgreen/30'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">{vault.name}</span>
          {vault.paused && (
            <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">
              PAUSED
            </span>
          )}
        </div>
        <span className="text-goodgreen font-mono text-sm">{estimateAPY(vault)} APY</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
        <div>
          <div className="text-gray-500">TVL</div>
          <div className="text-white font-mono">{vault.tvlFormatted} {vault.assetSymbol}</div>
        </div>
        <div>
          <div className="text-gray-500">Asset</div>
          <div className="text-white">{vault.assetSymbol}</div>
        </div>
        <div>
          <div className="text-gray-500">UBI Funded</div>
          <div className="text-goodgreen font-mono">{fmtUBI(vault.totalUBIFunded)}</div>
        </div>
      </div>

      {/* Utilization bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Utilization</span>
          <span>{vault.utilizationPct.toFixed(1)}%</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-goodgreen rounded-full transition-all"
            style={{ width: `${Math.min(100, vault.utilizationPct)}%` }}
          />
        </div>
      </div>
    </button>
  )
}

// ─── Deposit/Withdraw Panel ───────────────────────────────────────────────────

function VaultActionPanel({ vault }: { vault: VaultInfo }) {
  const [amount, setAmount] = useState('')
  const { address: userAddress } = useAccount()

  const position = useUserVaultPosition(vault.address)
  const tokenBalance = useTokenBalance(vault.assetAddress)
  const allowance = useTokenAllowance(vault.assetAddress, vault.address)
  const action = useYieldAction()

  const parsedAmount = parseTokenAmount(amount || '0')
  const walletBalance = (tokenBalance.data as bigint) ?? 0n

  const needsApproval = (currentTab: 'deposit' | 'withdraw') =>
    currentTab === 'deposit' &&
    parsedAmount > 0n &&
    ((allowance.data as bigint) ?? 0n) < parsedAmount

  const handleAction = (currentTab: 'deposit' | 'withdraw') => {
    if (!parsedAmount || parsedAmount === 0n) return
    if (currentTab === 'deposit') {
      if (needsApproval(currentTab)) {
        action.approve(vault.assetAddress, vault.address, parsedAmount)
      } else {
        action.deposit(vault.address, parsedAmount)
      }
    } else {
      action.withdraw(vault.address, parsedAmount)
    }
  }

  const maxAmount = (currentTab: 'deposit' | 'withdraw') => currentTab === 'deposit'
    ? formatTokenAmount(walletBalance)
    : position.formattedAssets

  return (
    <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10">
      {/* Position summary */}
      {position.shares > 0n && (
        <div className="mb-4 p-3 rounded-lg bg-goodgreen/10 border border-goodgreen/20">
          <div className="text-sm text-goodgreen mb-1">Your Position</div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Shares</span>
            <span className="font-mono text-white">{Number(position.formattedShares).toFixed(4)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Value</span>
            <span className="font-mono text-white">
              {Number(position.formattedAssets).toFixed(4)} {vault.assetSymbol}
            </span>
          </div>
        </div>
      )}

      {/* Tab switch */}
      <Tabs defaultValue="deposit" onValueChange={() => setAmount('')}>
        <TabsList className="grid w-full grid-cols-2 bg-white/5 p-1 rounded-lg mb-4">
          <TabsTrigger
            value="deposit"
            className="py-2 rounded-lg text-sm font-medium transition-all data-[state=active]:bg-goodgreen data-[state=active]:text-black data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-white data-[state=active]:shadow-none"
          >
            Deposit
          </TabsTrigger>
          <TabsTrigger
            value="withdraw"
            className="py-2 rounded-lg text-sm font-medium transition-all data-[state=active]:bg-orange-500 data-[state=active]:text-black data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-400 data-[state=inactive]:hover:text-white data-[state=active]:shadow-none"
          >
            Withdraw
          </TabsTrigger>
        </TabsList>

        {/* Tab Content */}
        {['deposit', 'withdraw'].map(currentTab => (
          <TabsContent key={currentTab} value={currentTab} className="mt-0">
            {/* Amount input */}
            <div className="relative mb-3">
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(sanitizeNumericInput(e.target.value))}
                placeholder="0.0"
                className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white font-mono text-lg focus:outline-none focus:border-goodgreen/50"
              />
              <button
                onClick={() => setAmount(maxAmount(currentTab as 'deposit' | 'withdraw'))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-goodgreen hover:text-goodgreen/80"
              >
                MAX
              </button>
            </div>

            <div className="flex justify-between text-xs text-gray-500 mb-4">
              <span>
                {currentTab === 'deposit' ? 'Wallet' : 'Deposited'}:{' '}
                <span className="text-gray-300 font-mono">
                  {currentTab === 'deposit'
                    ? Number(formatTokenAmount(walletBalance)).toFixed(4)
                    : Number(position.formattedAssets).toFixed(4)
                  } {vault.assetSymbol}
                </span>
              </span>
            </div>

            {/* Action button */}
            <button
              onClick={() => handleAction(currentTab as 'deposit' | 'withdraw')}
              disabled={!userAddress || parsedAmount === 0n || action.isPending}
              className={`w-full py-3 rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                currentTab === 'deposit'
                  ? 'bg-goodgreen text-black hover:bg-goodgreen/90'
                  : 'bg-orange-500 text-black hover:bg-orange-400'
              }`}
            >
              {action.isPending
                ? 'Confirming…'
                : !userAddress
                  ? 'Connect Wallet'
                  : needsApproval(currentTab as 'deposit' | 'withdraw')
                    ? `Approve ${vault.assetSymbol}`
                    : currentTab === 'deposit'
                      ? 'Deposit'
                      : 'Withdraw'}
            </button>
          </TabsContent>
        ))}
      </Tabs>

      {action.isSuccess && (
        <p className="text-xs text-goodgreen mt-2 text-center">
          ✅ Transaction submitted!
        </p>
      )}
      {action.isError && (
        <p className="text-xs text-red-400 mt-2 text-center">
          ❌ {action.error?.message?.slice(0, 80)}
        </p>
      )}

      {/* Vault details */}
      <div className="mt-4 pt-4 border-t border-white/10 space-y-2 text-xs text-gray-400">
        <div className="flex justify-between">
          <span>Performance Fee</span>
          <span className="text-white">{fmtBPS(vault.performanceFeeBPS)} → UBI</span>
        </div>
        <div className="flex justify-between">
          <span>Management Fee</span>
          <span className="text-white">{fmtBPS(vault.managementFeeBPS)} annual</span>
        </div>
        <div className="flex justify-between">
          <span>Share Price</span>
          <span className="font-mono text-white">{vault.sharePrice.toFixed(6)}</span>
        </div>
        <div className="flex justify-between">
          <span>Strategy</span>
          <span className="font-mono text-gray-300">{strategyLabel(vault.strategyAddress)}</span>
        </div>
        <div className="flex justify-between">
          <span>Total Gain</span>
          <span className="text-goodgreen font-mono">{fmtUBI(vault.totalGainSinceInception)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Global Stats Bar ─────────────────────────────────────────────────────────

function GlobalStats({
  vaultCount,
  totalTVL,
  totalUBI,
}: {
  vaultCount: number
  totalTVL: bigint
  totalUBI: bigint
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
        <div className="text-xs text-gray-500">Vaults</div>
        <div className="text-xl font-bold text-white">{vaultCount}</div>
      </div>
      <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
        <div className="text-xs text-gray-500">Total TVL</div>
        <div className="text-xl font-bold text-white font-mono">{fmtUBI(totalTVL)}</div>
      </div>
      <div className="p-3 rounded-xl bg-goodgreen/10 border border-goodgreen/20 text-center">
        <div className="text-xs text-goodgreen">UBI Funded</div>
        <div className="text-xl font-bold text-goodgreen font-mono">{fmtUBI(totalUBI)}</div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function YieldPage() {
  const [selectedVault, setSelectedVault] = useState<number>(0)
  const { address: userAddress } = useAccount()

  // 1. Get vault count from factory
  const { data: rawVaultCount } = useVaultCount()
  const vaultCount = Number(rawVaultCount ?? 0)

  // 2. Get vault addresses
  const { data: rawAddresses } = useVaultAddresses(vaultCount)
  const vaultAddresses: Address[] = useMemo(() => {
    if (!rawAddresses) return []
    return rawAddresses
      .map((r) => r.result as Address)
      .filter((a): a is Address => !!a)
  }, [rawAddresses])

  // 3. Get vault details
  const { vaults, isLoading } = useVaultDetails(vaultAddresses)

  // 4. Aggregate stats from vaults
  const totalTVL = vaults.reduce((acc, v) => acc + v.totalAssets, 0n)
  const totalUBI = vaults.reduce((acc, v) => acc + v.totalUBIFunded, 0n)

  const selected = vaults[selectedVault] ?? null

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 min-h-screen text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🌾 GoodYield
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Auto-compounding vaults — deposit, earn, fund UBI
          </p>
        </div>
        <ConnectButton />
      </div>

      <InfoBanner
        storageKey="yield-info"
        title="ERC-4626 Yield Vaults"
        description="ERC-4626 vaults auto-compound yield from lending and stability pools. 20% of profits fund Universal Basic Income."
      />

      {/* Global stats */}
      <GlobalStats
        vaultCount={vaults.length}
        totalTVL={totalTVL}
        totalUBI={totalUBI}
      />

      {isLoading && vaults.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <div className="animate-pulse">Loading vaults…</div>
        </div>
      ) : vaults.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <p className="text-lg mb-2">No vaults deployed yet</p>
          <p className="text-sm">Vaults will appear here once created via VaultFactory</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Vault list */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">
              Available Vaults
            </h2>
            {vaults.map((vault, i) => (
              <VaultCard
                key={vault.address}
                vault={vault}
                isSelected={selectedVault === i}
                onSelect={() => setSelectedVault(i)}
              />
            ))}
          </div>

          {/* Action panel */}
          <div>
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">
              {selected ? selected.name : 'Select a Vault'}
            </h2>
            {selected ? (
              <VaultActionPanel vault={selected} />
            ) : (
              <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center text-gray-500">
                Select a vault to deposit or withdraw
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

