'use client'

/**
 * PortfolioOnChain — shows live on-chain positions when wallet is connected to chain 42069.
 *
 * Reads from:
 *   - GoodDollarToken.balanceOf  (G$ balance)
 *   - useGUSDBalance             (gUSD balance from GoodStable)
 *   - useUserAccountData         (GoodLend aggregate: collateral, debt, health factor)
 *   - useVault × 3               (GoodStable CDP vaults: ETH, G$, USDC)
 */

import { useAccount } from 'wagmi'
import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { GoodDollarTokenABI, ERC20ABI } from '@/lib/abi'
import { CONTRACTS } from '@/lib/chain'
import { useGUSDBalance, useVault, ILKS, ILK_ETH, ILK_GD, ILK_USDC } from '@/lib/useGoodStable'
import { useUserAccountData } from '@/lib/useGoodLend'
import { usePriceFeeds, getPrice } from '@/lib/usePriceFeeds'
import Link from 'next/link'

const CHAIN_ID = 42069
const ILKS_META = [
  { key: ILK_ETH,  label: 'WETH', decimals: 18, minRatio: 150, tokenAddress: CONTRACTS.StableMockWETH },
  { key: ILK_GD,   label: 'G$',   decimals: 18, minRatio: 200, tokenAddress: CONTRACTS.StableMockGD },
  { key: ILK_USDC, label: 'USDC', decimals: 6,  minRatio: 101, tokenAddress: CONTRACTS.StableMockUSDC },
] as const

function fmtN(n: number, dp = 4) {
  if (!isFinite(n) || isNaN(n) || n === 0) return '0'
  if (n < 0.0001) return n.toExponential(2)
  return n.toFixed(dp)
}

function hfColor(hf: number) {
  if (!isFinite(hf)) return 'text-goodgreen'
  if (hf >= 2.0) return 'text-goodgreen'
  if (hf >= 1.5) return 'text-yellow-400'
  if (hf >= 1.1) return 'text-orange-400'
  return 'text-red-400'
}

// ─── G$ + gUSD balances row ───────────────────────────────────────────────────

function TokenBalances({ address }: { address: `0x${string}` }) {
  const gdResult = useReadContract({
    address: CONTRACTS.GoodDollarToken,
    abi: GoodDollarTokenABI,
    functionName: 'balanceOf',
    args: [address],
    query: { refetchInterval: 15_000 },
  })
  const gdBalance = gdResult.data ? Number(formatUnits(gdResult.data, 18)) : 0

  const { balanceFloat: gusdBalance } = useGUSDBalance(address)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      <div className="bg-dark-50/30 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">G$ Balance</div>
          <div className="text-sm font-semibold text-white mt-0.5">{fmtN(gdBalance, 2)} G$</div>
        </div>
        <div className="w-8 h-8 rounded-full bg-goodgreen/20 flex items-center justify-center text-goodgreen text-xs font-bold">G$</div>
      </div>
      <div className="bg-dark-50/30 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">gUSD Balance</div>
          <div className="text-sm font-semibold text-white mt-0.5">{fmtN(gusdBalance, 2)} gUSD</div>
        </div>
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">$</div>
      </div>
    </div>
  )
}

// ─── GoodLend position ────────────────────────────────────────────────────────

function LendPosition({ address }: { address: `0x${string}` }) {
  const { data, isLoading } = useUserAccountData(address)

  const hasPosition = data && (data.totalCollateralFloat > 0 || data.totalDebtFloat > 0)

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">GoodLend</span>
        <Link href="/lend" className="text-xs text-goodgreen hover:text-goodgreen/80 transition-colors">Manage →</Link>
      </div>
      {isLoading ? (
        <div className="text-xs text-gray-500 py-2">Loading…</div>
      ) : !hasPosition ? (
        <div className="text-xs text-gray-500 py-2 text-center">No GoodLend positions</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-dark-50/30 rounded-xl px-3 py-2.5">
            <div className="text-[10px] text-gray-400">Supplied</div>
            <div className="text-sm font-medium text-white">${fmtN(data!.totalCollateralFloat, 2)}</div>
          </div>
          <div className="bg-dark-50/30 rounded-xl px-3 py-2.5">
            <div className="text-[10px] text-gray-400">Borrowed</div>
            <div className="text-sm font-medium text-white">${fmtN(data!.totalDebtFloat, 2)}</div>
          </div>
          <div className="bg-dark-50/30 rounded-xl px-3 py-2.5">
            <div className="text-[10px] text-gray-400">Health</div>
            <div className={`text-sm font-medium ${hfColor(data!.healthFactorFloat)}`}>
              {isFinite(data!.healthFactorFloat) ? data!.healthFactorFloat.toFixed(2) : '∞'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── GoodStable vault positions ───────────────────────────────────────────────

function StableVaultRow({ ilkMeta, address, prices }: { ilkMeta: typeof ILKS_META[number]; address: `0x${string}`; prices: Record<string, number> }) {
  const price = getPrice(prices, ilkMeta.label)
  const { data, isLoading } = useVault(
    ilkMeta.key, address, ilkMeta.decimals, price, ilkMeta.minRatio / 100,
  )

  const hasPosition = data && (data.collateralFloat > 0 || data.actualDebtFloat > 0)
  if (!hasPosition && !isLoading) return null

  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-xl hover:bg-dark-50/30 transition-colors">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-goodgreen/20 flex items-center justify-center text-goodgreen text-[9px] font-bold">
          {ilkMeta.label.slice(0, 2)}
        </div>
        <span className="text-sm text-white">{ilkMeta.label}</span>
      </div>
      <div className="flex items-center gap-4 text-right">
        <div>
          <div className="text-[10px] text-gray-500">Collateral</div>
          <div className="text-xs text-white">{isLoading ? '…' : `${fmtN(data?.collateralFloat ?? 0, 3)} ${ilkMeta.label}`}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500">Debt</div>
          <div className="text-xs text-white">{isLoading ? '…' : `${fmtN(data?.actualDebtFloat ?? 0, 2)} gUSD`}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500">Health</div>
          <div className={`text-xs font-medium ${hfColor(data?.healthFactor ?? Infinity)}`}>
            {isLoading ? '…' : isFinite(data?.healthFactor ?? Infinity) ? (data?.healthFactor ?? 0).toFixed(2) : '∞'}
          </div>
        </div>
      </div>
    </div>
  )
}

function StablePositions({ address, prices }: { address: `0x${string}`; prices: Record<string, number> }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">GoodStable</span>
        <Link href="/stable" className="text-xs text-goodgreen hover:text-goodgreen/80 transition-colors">Manage →</Link>
      </div>
      <div className="space-y-0.5">
        {ILKS_META.map(ilk => (
          <StableVaultRow key={ilk.key} ilkMeta={ilk} address={address} prices={prices} />
        ))}
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function PortfolioOnChain() {
  const { address, chainId } = useAccount()
  const { prices } = usePriceFeeds(['WETH', 'G$', 'USDC'])

  if (!address || chainId !== CHAIN_ID) return null

  return (
    <div className="bg-dark-100 rounded-2xl border border-goodgreen/20 p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-goodgreen animate-pulse" />
        <h2 className="text-sm font-semibold text-white">On-Chain Positions</h2>
        <span className="text-xs text-gray-500">· devnet chain 42069</span>
      </div>

      <TokenBalances address={address} />
      <LendPosition address={address} />
      <StablePositions address={address} prices={prices} />
    </div>
  )
}
