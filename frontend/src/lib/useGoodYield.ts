/**
 * useGoodYield — React hooks for GoodYield auto-compounding vaults
 *
 * Reads VaultFactory for vault discovery, then reads individual GoodVault
 * contracts for balances, TVL, APY estimates, and deposit/withdraw actions.
 */

import { useReadContract, useReadContracts, useWriteContract, useAccount } from 'wagmi'
import { parseEther, formatEther, type Address } from 'viem'
import { CONTRACTS, VaultFactoryABI, GoodVaultABI, ERC20ABI } from './devnet'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaultInfo {
  address: Address
  name: string
  symbol: string
  assetAddress: Address
  assetSymbol: string
  totalAssets: bigint
  totalSupply: bigint
  depositCap: bigint
  performanceFeeBPS: bigint
  managementFeeBPS: bigint
  totalGainSinceInception: bigint
  totalUBIFunded: bigint
  totalDebt: bigint
  paused: boolean
  strategyAddress: Address
  lastReport: bigint
  // Computed
  sharePrice: number  // assets per share
  tvlFormatted: string
  utilizationPct: number
}

export interface UserVaultPosition {
  vaultAddress: Address
  shares: bigint
  assetsValue: bigint
  formattedShares: string
  formattedAssets: string
}

// ─── Known asset symbols ──────────────────────────────────────────────────────

const ASSET_SYMBOL_MAP: Record<string, string> = {
  [CONTRACTS.MockUSDC.toLowerCase()]: 'USDC',
  [CONTRACTS.MockWETH.toLowerCase()]: 'WETH',
  [CONTRACTS.GoodDollarToken.toLowerCase()]: 'G$',
  [CONTRACTS.gUSD?.toLowerCase?.() ?? '']: 'gUSD',
}

function resolveAssetSymbol(addr: string): string {
  return ASSET_SYMBOL_MAP[addr.toLowerCase()] ?? 'TOKEN'
}

// ─── Factory hooks ────────────────────────────────────────────────────────────

export function useVaultCount() {
  return useReadContract({
    address: CONTRACTS.VaultFactory,
    abi: VaultFactoryABI,
    functionName: 'vaultCount',
  })
}

export function useFactoryTVL() {
  return useReadContract({
    address: CONTRACTS.VaultFactory,
    abi: VaultFactoryABI,
    functionName: 'totalTVL',
  })
}

export function useFactoryUBIFunded() {
  return useReadContract({
    address: CONTRACTS.VaultFactory,
    abi: VaultFactoryABI,
    functionName: 'totalUBIFunded',
  })
}

// ─── Vault address list ───────────────────────────────────────────────────────

export function useVaultAddresses(count: number) {
  const contracts = Array.from({ length: count }, (_, i) => ({
    address: CONTRACTS.VaultFactory as Address,
    abi: VaultFactoryABI,
    functionName: 'allVaults' as const,
    args: [BigInt(i)],
  }))

  return useReadContracts({ contracts })
}

// ─── Vault metadata (batch read) ──────────────────────────────────────────────

export function useVaultDetails(vaultAddresses: Address[]) {
  const contracts = vaultAddresses.flatMap((addr) => [
    { address: addr, abi: GoodVaultABI, functionName: 'name' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'symbol' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'asset' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'totalAssets' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'totalSupply' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'depositCap' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'performanceFeeBPS' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'managementFeeBPS' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'totalGainSinceInception' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'totalUBIFunded' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'totalDebt' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'paused' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'strategy' as const },
    { address: addr, abi: GoodVaultABI, functionName: 'lastReport' as const },
  ])

  const result = useReadContracts({ contracts })

  const FIELDS_PER_VAULT = 14
  const vaults: VaultInfo[] = []

  if (result.data) {
    for (let i = 0; i < vaultAddresses.length; i++) {
      const base = i * FIELDS_PER_VAULT
      const name = (result.data[base]?.result as string) ?? '?'
      const symbol = (result.data[base + 1]?.result as string) ?? '?'
      const assetAddress = (result.data[base + 2]?.result as Address) ?? '0x0'
      const totalAssets = (result.data[base + 3]?.result as bigint) ?? 0n
      const totalSupply = (result.data[base + 4]?.result as bigint) ?? 0n
      const depositCap = (result.data[base + 5]?.result as bigint) ?? 0n
      const performanceFeeBPS = (result.data[base + 6]?.result as bigint) ?? 0n
      const managementFeeBPS = (result.data[base + 7]?.result as bigint) ?? 0n
      const totalGainSinceInception = (result.data[base + 8]?.result as bigint) ?? 0n
      const totalUBIFunded = (result.data[base + 9]?.result as bigint) ?? 0n
      const totalDebt = (result.data[base + 10]?.result as bigint) ?? 0n
      const paused = (result.data[base + 11]?.result as boolean) ?? false
      const strategyAddress = (result.data[base + 12]?.result as Address) ?? '0x0'
      const lastReport = (result.data[base + 13]?.result as bigint) ?? 0n

      const sharePrice = totalSupply > 0n
        ? Number(totalAssets) / Number(totalSupply)
        : 1.0

      const tvlNum = Number(formatEther(totalAssets))
      const tvlFormatted = tvlNum >= 1_000_000
        ? `${(tvlNum / 1_000_000).toFixed(2)}M`
        : tvlNum >= 1_000
          ? `${(tvlNum / 1_000).toFixed(2)}K`
          : tvlNum.toFixed(4)

      const utilizationPct = depositCap > 0n
        ? Number((totalAssets * 10000n) / depositCap) / 100
        : 0

      vaults.push({
        address: vaultAddresses[i],
        name,
        symbol,
        assetAddress,
        assetSymbol: resolveAssetSymbol(assetAddress),
        totalAssets,
        totalSupply,
        depositCap,
        performanceFeeBPS,
        managementFeeBPS,
        totalGainSinceInception,
        totalUBIFunded,
        totalDebt,
        paused,
        strategyAddress,
        lastReport,
        sharePrice,
        tvlFormatted,
        utilizationPct,
      })
    }
  }

  return { ...result, vaults }
}

// ─── User position in a vault ─────────────────────────────────────────────────

export function useUserVaultPosition(vaultAddress: Address | undefined) {
  const { address: userAddress } = useAccount()

  const sharesResult = useReadContract({
    address: vaultAddress,
    abi: GoodVaultABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!vaultAddress && !!userAddress },
  })

  const assetsResult = useReadContract({
    address: vaultAddress,
    abi: GoodVaultABI,
    functionName: 'convertToAssets',
    args: sharesResult.data ? [sharesResult.data as bigint] : undefined,
    query: { enabled: !!sharesResult.data && (sharesResult.data as bigint) > 0n },
  })

  const shares = (sharesResult.data as bigint) ?? 0n
  const assetsValue = (assetsResult.data as bigint) ?? 0n

  return {
    shares,
    assetsValue,
    formattedShares: formatEther(shares),
    formattedAssets: formatEther(assetsValue),
    isLoading: sharesResult.isLoading || assetsResult.isLoading,
  }
}

// ─── User token balance (for deposit) ─────────────────────────────────────────

export function useTokenBalance(tokenAddress: Address | undefined) {
  const { address: userAddress } = useAccount()

  return useReadContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!tokenAddress && !!userAddress },
  })
}

// ─── Token allowance ──────────────────────────────────────────────────────────

export function useTokenAllowance(tokenAddress: Address | undefined, spender: Address | undefined) {
  const { address: userAddress } = useAccount()

  return useReadContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: userAddress && spender ? [userAddress, spender] : undefined,
    query: { enabled: !!tokenAddress && !!userAddress && !!spender },
  })
}

// ─── Write actions ────────────────────────────────────────────────────────────

export function useYieldAction() {
  const { writeContract, isPending, isSuccess, isError, error, data } = useWriteContract()
  const { address: userAddress } = useAccount()

  const approve = (token: Address, spender: Address, amount: bigint) => {
    writeContract({
      address: token,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [spender, amount],
    })
  }

  const deposit = (vault: Address, assets: bigint) => {
    if (!userAddress) return
    writeContract({
      address: vault,
      abi: GoodVaultABI,
      functionName: 'deposit',
      args: [assets, userAddress],
    })
  }

  const withdraw = (vault: Address, assets: bigint) => {
    if (!userAddress) return
    writeContract({
      address: vault,
      abi: GoodVaultABI,
      functionName: 'withdraw',
      args: [assets, userAddress, userAddress],
    })
  }

  const redeem = (vault: Address, shares: bigint) => {
    if (!userAddress) return
    writeContract({
      address: vault,
      abi: GoodVaultABI,
      functionName: 'redeem',
      args: [shares, userAddress, userAddress],
    })
  }

  return { approve, deposit, withdraw, redeem, isPending, isSuccess, isError, error, txHash: data }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseTokenAmount(amount: string, decimals = 18): bigint {
  try {
    if (decimals === 18) return parseEther(amount)
    return BigInt(Math.floor(Number(amount) * 10 ** decimals))
  } catch {
    return 0n
  }
}

export function formatTokenAmount(amount: bigint, decimals = 18): string {
  if (decimals === 18) return formatEther(amount)
  return (Number(amount) / 10 ** decimals).toFixed(decimals > 6 ? 6 : decimals)
}

export { formatEther, parseEther }
