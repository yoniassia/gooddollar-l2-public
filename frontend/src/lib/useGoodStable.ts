'use client'

/**
 * useGoodStable — wagmi hooks for GoodStable CDP vault interaction.
 *
 * Provides:
 *   - useVault(ilk, address): read vault state (collateral, debt, health factor)
 *   - useCollateralConfig(ilk): read collateral configuration from CollateralRegistry
 *   - useGUSDBalance(address): read gUSD token balance
 *   - useStableAction: approve + depositCollateral / withdrawCollateral / mintGUSD / repayGUSD
 *
 * The three supported ilks are:
 *   ETH  — MockWETH18, 150% liquidation ratio, ~2% APY stability fee
 *   GD   — MockGD18,   200% liquidation ratio, ~3% APY stability fee
 *   USDC — MockUSDC6,  101% liquidation ratio, ~0.5% APY stability fee
 *
 * Actual debt = normalizedDebt * chi / RAY (chi from VaultManager.accumulators).
 * Health factor = (collateralValue * WAD) / (actualDebt * liquidationRatio)
 */

import { useCallback, useState } from 'react'
import { useReadContract, useWriteContract, useAccount, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, maxUint256, formatUnits } from 'viem'
import { VaultManagerABI, CollateralRegistryABI, ERC20ABI } from './abi'
import { CONTRACTS } from './chain'

const VAULT_MGR = CONTRACTS.VaultManager
const REGISTRY = CONTRACTS.CollateralRegistry
const RAY = BigInt('1000000000000000000000000000') // 1e27
const WAD = BigInt('1000000000000000000') // 1e18

// ─── Ilk definitions ──────────────────────────────────────────────────────────

export const ILK_ETH = '0x4554480000000000000000000000000000000000000000000000000000000000' as `0x${string}`
export const ILK_GD  = '0x4744000000000000000000000000000000000000000000000000000000000000' as `0x${string}`
export const ILK_USDC = '0x5553444300000000000000000000000000000000000000000000000000000000' as `0x${string}`

export const ILKS = [
  { key: ILK_ETH,  label: 'WETH', decimals: 18, minRatio: 150, tokenAddress: CONTRACTS.StableMockWETH },
  { key: ILK_GD,   label: 'G$',   decimals: 18, minRatio: 200, tokenAddress: CONTRACTS.StableMockGD },
  { key: ILK_USDC, label: 'USDC', decimals: 6,  minRatio: 101, tokenAddress: CONTRACTS.StableMockUSDC },
] as const

export type IlkKey = typeof ILKS[number]['key']
export type IlkLabel = typeof ILKS[number]['label']

// ─── Read: vault state ────────────────────────────────────────────────────────

export interface VaultState {
  collateral: bigint
  normalizedDebt: bigint
  actualDebt: bigint      // normalizedDebt * chi / RAY (gUSD owed)
  chi: bigint
  collateralFloat: number
  actualDebtFloat: number
  healthFactor: number    // infinite when no debt
  isHealthy: boolean
  hasPosition: boolean    // true when vault has collateral or debt
}

export function useVault(
  ilk: `0x${string}` | undefined,
  owner: `0x${string}` | undefined,
  collateralDecimals: number,
  collateralPriceUSD: number,
  liquidationRatio: number, // e.g. 1.5
) {
  const vaultResult = useReadContract({
    address: VAULT_MGR,
    abi: VaultManagerABI,
    functionName: 'vaults',
    args: ilk && owner ? [ilk, owner] : undefined,
    query: { enabled: !!ilk && !!owner, refetchInterval: 15_000 },
  })

  const accResult = useReadContract({
    address: VAULT_MGR,
    abi: VaultManagerABI,
    functionName: 'accumulators',
    args: ilk ? [ilk] : undefined,
    query: { enabled: !!ilk, refetchInterval: 15_000 },
  })

  if (!vaultResult.data) {
    return { data: null, isLoading: vaultResult.isLoading || accResult.isLoading }
  }

  const [collateral, normalizedDebt] = vaultResult.data
  const chi = accResult.data ? accResult.data[0] : RAY
  const effectiveChi = chi === BigInt(0) ? RAY : chi

  const actualDebt = normalizedDebt === BigInt(0) ? BigInt(0) : (normalizedDebt * effectiveChi) / RAY

  const collateralFloat = Number(formatUnits(collateral, collateralDecimals))
  const actualDebtFloat = Number(formatUnits(actualDebt, 18))

  const collateralValueUSD = collateralFloat * collateralPriceUSD
  const healthFactor = actualDebtFloat === 0
    ? Infinity
    : collateralValueUSD / (actualDebtFloat * liquidationRatio)

  return {
    data: {
      collateral,
      normalizedDebt,
      actualDebt,
      chi: effectiveChi,
      collateralFloat,
      actualDebtFloat,
      healthFactor,
      isHealthy: healthFactor >= 1,
      hasPosition: collateral > BigInt(0) || normalizedDebt > BigInt(0),
    } satisfies VaultState,
    isLoading: false,
  }
}

// ─── Read: collateral config ──────────────────────────────────────────────────

export function useCollateralConfig(ilk: `0x${string}` | undefined) {
  const result = useReadContract({
    address: REGISTRY,
    abi: CollateralRegistryABI,
    functionName: 'getConfig',
    args: ilk ? [ilk] : undefined,
    query: { enabled: !!ilk, refetchInterval: 60_000 },
  })
  return { data: result.data ?? null, isLoading: result.isLoading }
}

// ─── Read: gUSD balance ───────────────────────────────────────────────────────

export function useGUSDBalance(address: `0x${string}` | undefined) {
  const result = useReadContract({
    address: CONTRACTS.gUSD,
    abi: ERC20ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  })
  return {
    balance: result.data ?? BigInt(0),
    balanceFloat: result.data ? Number(formatUnits(result.data, 18)) : 0,
    isLoading: result.isLoading,
  }
}

// ─── Read: total gUSD supply ──────────────────────────────────────────────────

export function useGUSDTotalSupply() {
  const result = useReadContract({
    address: CONTRACTS.gUSD,
    abi: ERC20ABI,
    functionName: 'totalSupply',
    query: { enabled: !!CONTRACTS.gUSD, refetchInterval: 30_000 },
  })
  return {
    totalSupply: result.data ?? BigInt(0),
    totalSupplyFloat: result.data ? Number(formatUnits(result.data, 18)) : 0,
    isLoading: result.isLoading,
  }
}

// ─── Read: collateral token balance ──────────────────────────────────────────

export function useCollateralBalance(
  tokenAddress: `0x${string}`,
  decimals: number,
  owner: `0x${string}` | undefined,
) {
  const result = useReadContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'balanceOf',
    args: owner ? [owner] : undefined,
    query: { enabled: !!owner, refetchInterval: 10_000 },
  })
  return {
    balance: result.data ?? BigInt(0),
    balanceFloat: result.data ? Number(formatUnits(result.data, decimals)) : 0,
    isLoading: result.isLoading,
  }
}

// ─── Write: vault actions ─────────────────────────────────────────────────────

export type StableActionKind = 'deposit' | 'withdraw' | 'mint' | 'repay' | 'close'

export type StableTxPhase = 'idle' | 'approving' | 'submitting' | 'confirming' | 'done' | 'error'

export function useStableAction() {
  const { writeContractAsync } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [phase, setPhase] = useState<StableTxPhase>('idle')
  const [error, setError] = useState<string | undefined>()

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  if (isConfirming && phase === 'submitting') setPhase('confirming')
  if (isConfirmed && phase === 'confirming') setPhase('done')

  const execute = useCallback(async (
    kind: StableActionKind,
    ilk: `0x${string}`,
    amount: string,
    tokenAddress: `0x${string}`,
    tokenDecimals: number,
  ) => {
    setError(undefined)
    setPhase('idle')
    try {
      // Close vault: approve gUSD (for burnFrom) then close atomically
      if (kind === 'close') {
        setPhase('approving')
        await writeContractAsync({
          address: CONTRACTS.gUSD,
          abi: ERC20ABI,
          functionName: 'approve',
          args: [VAULT_MGR, maxUint256],
        })
        setPhase('submitting')
        const hash = await writeContractAsync({
          address: VAULT_MGR,
          abi: VaultManagerABI,
          functionName: 'closeVault',
          args: [ilk],
        })
        setTxHash(hash)
        return
      }

      const parsed = parseUnits(amount, kind === 'repay' ? 18 : tokenDecimals)

      // Deposit and repay need an ERC-20 approval first
      if (kind === 'deposit' || kind === 'repay') {
        setPhase('approving')
        const spendToken = kind === 'deposit' ? tokenAddress : CONTRACTS.gUSD
        await writeContractAsync({
          address: spendToken,
          abi: ERC20ABI,
          functionName: 'approve',
          args: [VAULT_MGR, maxUint256],
        })
      }

      setPhase('submitting')
      const functionName = (
        kind === 'deposit'  ? 'depositCollateral' :
        kind === 'withdraw' ? 'withdrawCollateral' :
        kind === 'mint'     ? 'mintGUSD' :
        /* repay */           'repayGUSD'
      ) as 'depositCollateral' | 'withdrawCollateral' | 'mintGUSD' | 'repayGUSD'

      const hash = await writeContractAsync({
        address: VAULT_MGR,
        abi: VaultManagerABI,
        functionName,
        args: [ilk, kind === 'repay' ? parseUnits(amount, 18) : parsed],
      })
      setTxHash(hash)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('User rejected') ? 'Transaction rejected.' : msg.slice(0, 120))
      setPhase('error')
    }
  }, [writeContractAsync])

  const reset = useCallback(() => {
    setPhase('idle')
    setError(undefined)
    setTxHash(undefined)
  }, [])

  return { execute, phase, error, txHash, isConfirming, isConfirmed, reset }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function useConnectedAccount() {
  const { address } = useAccount()
  return address
}

export function maxMintable(
  collateralFloat: number,
  collateralPriceUSD: number,
  liquidationRatio: number,
  existingDebt: number,
  safetyBuffer = 0.9, // mint up to 90% of maximum to stay safely collateralised
): number {
  const maxDebt = (collateralFloat * collateralPriceUSD) / liquidationRatio
  return Math.max(0, maxDebt * safetyBuffer - existingDebt)
}
