'use client'

/**
 * useStocks — wagmi hooks for GoodStocks on-chain interactions.
 *
 * GoodStocks uses:
 *   - CollateralVault: deposit G$ collateral → mint synthetic stocks → redeem
 *   - SyntheticAssetFactory: list of available synthetic assets
 *
 * CollateralVault and SyntheticAssetFactory are deployed to devnet (chain 42069).
 * Addresses are set in CONTRACTS in chain.ts.
 * Initial synthetic assets (sAAPL, sTSLA etc.) must be listed via listAsset()
 * before users can mint positions.
 */

import { useCallback, useState } from 'react'
import { useReadContract, useAccount, useWriteContract } from 'wagmi'
import { readContract } from '@wagmi/core'
import { CollateralVaultABI, SyntheticAssetFactoryABI, ERC20ABI } from './abi'
import { CONTRACTS } from './chain'
import { config } from './wagmi'

const VAULT = CONTRACTS.CollateralVault
const FACTORY = CONTRACTS.SyntheticAssetFactory

// ─── Read: user position for a stock ─────────────────────────────────────────

export interface OnChainStockPosition {
  collateralAmount: bigint
  debtAmount: bigint
  collateralFloat: number
  debtFloat: number
  collateralRatio: number
}

export function useStockPosition(ticker: string): {
  position: OnChainStockPosition | null
  isLoading: boolean
} {
  const { address } = useAccount()
  const posResult = useReadContract({
    address: VAULT ?? undefined,
    abi: CollateralVaultABI,
    functionName: 'getPosition',
    args: VAULT && address ? [address, ticker] : undefined,
    query: { enabled: !!(VAULT && address && ticker), refetchInterval: 15_000 },
  })

  const ratioResult = useReadContract({
    address: VAULT ?? undefined,
    abi: CollateralVaultABI,
    functionName: 'getCollateralRatio',
    args: VAULT && address ? [address, ticker] : undefined,
    query: { enabled: !!(VAULT && address && ticker), refetchInterval: 15_000 },
  })

  if (!posResult.data) return { position: null, isLoading: posResult.isLoading }

  const [collateralAmount, debtAmount] = posResult.data
  const ratio = (ratioResult.data as bigint | undefined) ?? BigInt(0)

  return {
    position: {
      collateralAmount,
      debtAmount,
      collateralFloat: Number(collateralAmount) / 1e18,
      debtFloat: Number(debtAmount) / 1e18,
      collateralRatio: Number(ratio) / 10_000,
    },
    isLoading: posResult.isLoading,
  }
}

// ─── Read: number of listed assets ───────────────────────────────────────────

export function useListedCount(): { count: bigint; isLoading: boolean } {
  const result = useReadContract({
    address: FACTORY ?? undefined,
    abi: SyntheticAssetFactoryABI,
    functionName: 'listedCount',
    query: { enabled: !!FACTORY, refetchInterval: 60_000 },
  })
  return {
    count: (result.data as bigint | undefined) ?? BigInt(0),
    isLoading: result.isLoading,
  }
}

// ─── Write: deposit collateral + mint synthetic ───────────────────────────────

export type StocksActionPhase = 'idle' | 'approving' | 'pending' | 'done' | 'error'

export function useMintSynthetic() {
  const [phase, setPhase] = useState<StocksActionPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()
  const { isConnected, address } = useAccount()

  const reset = useCallback(() => { setPhase('idle'); setError(null) }, [])

  const mint = useCallback(async (
    ticker: string,
    collateralAmount: bigint,
    mintAmount: bigint,
  ) => {
    if (!isConnected || !address) { setError('Wallet not connected'); return }
    if (!VAULT) { setError('CollateralVault not deployed yet'); return }

    try {
      // Read the exact fee before approving so the approval covers collateral + fee.
      // This prevents viem's internal eth_call simulation of depositAndMint from
      // reverting with InsufficientAllowance (GOO-183).
      const [, fee] = await readContract(config, {
        address: VAULT,
        abi: CollateralVaultABI,
        functionName: 'getMintRequirements',
        args: [address, ticker, mintAmount, collateralAmount],
      })

      setPhase('approving')
      await writeContractAsync({
        address: CONTRACTS.GoodDollarToken,
        abi: ERC20ABI,
        functionName: 'approve',
        args: [VAULT, collateralAmount + fee],
      })

      setPhase('pending')
      await writeContractAsync({
        address: VAULT,
        abi: CollateralVaultABI,
        functionName: 'depositAndMint',
        args: [ticker, collateralAmount, mintAmount],
      })
      setPhase('done')
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setError(e?.shortMessage ?? e?.message ?? 'Transaction failed')
      setPhase('error')
    }
  }, [isConnected, address, writeContractAsync])

  return { mint, phase, error, reset, isConnected, isDeployed: !!VAULT }
}

// ─── Write: burn synthetic + withdraw collateral ──────────────────────────────

export function useRedeemSynthetic() {
  const [phase, setPhase] = useState<StocksActionPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()
  const { isConnected } = useAccount()

  const reset = useCallback(() => { setPhase('idle'); setError(null) }, [])

  const redeem = useCallback(async (
    ticker: string,
    burnAmount: bigint,
    withdrawAmount: bigint,
  ) => {
    if (!isConnected) { setError('Wallet not connected'); return }
    if (!VAULT) { setError('CollateralVault not deployed yet'); return }

    try {
      setPhase('pending')
      await writeContractAsync({
        address: VAULT,
        abi: CollateralVaultABI,
        functionName: 'burn',
        args: [ticker, burnAmount],
      })

      await writeContractAsync({
        address: VAULT,
        abi: CollateralVaultABI,
        functionName: 'withdrawCollateral',
        args: [ticker, withdrawAmount],
      })
      setPhase('done')
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setError(e?.shortMessage ?? e?.message ?? 'Transaction failed')
      setPhase('error')
    }
  }, [isConnected, writeContractAsync])

  return { redeem, phase, error, reset, isConnected, isDeployed: !!VAULT }
}
