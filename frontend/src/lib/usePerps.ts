'use client'

/**
 * usePerps — wagmi hooks for GoodPerps PerpEngine on-chain interactions.
 *
 * Trade flow:
 *   1. Approve G$ to MarginVault
 *   2. MarginVault.deposit(margin)
 *   3. PerpEngine.openPosition(marketId, size, isLong, margin)
 *
 * PerpEngine and MarginVault are deployed on devnet (chain 42069).
 */

import { useCallback, useState } from 'react'
import { useReadContract, useAccount, useWriteContract } from 'wagmi'
import { PerpEngineABI, MarginVaultABI, ERC20ABI } from './abi'
import { CONTRACTS } from './chain'

const ENGINE = CONTRACTS.PerpEngine
const VAULT = CONTRACTS.MarginVault

// ─── Read: open position ──────────────────────────────────────────────────────

export interface OnChainPosition {
  size: bigint
  entryPrice: bigint
  isLong: boolean
  collateral: bigint
  sizeFloat: number
  entryPriceFloat: number
  collateralFloat: number
}

export function usePosition(marketId: bigint): {
  position: OnChainPosition | null
  isLoading: boolean
} {
  const { address } = useAccount()
  const result = useReadContract({
    address: ENGINE ?? undefined,
    abi: PerpEngineABI,
    functionName: 'positions',
    args: ENGINE && address ? [address, marketId] : undefined,
    query: { enabled: !!(ENGINE && address), refetchInterval: 10_000 },
  })

  if (!result.data) return { position: null, isLoading: result.isLoading }

  const [size, entryPrice, isLong, collateral] = result.data

  return {
    position: {
      size,
      entryPrice,
      isLong,
      collateral,
      sizeFloat: Number(size) / 1e18,
      entryPriceFloat: Number(entryPrice) / 1e8,
      collateralFloat: Number(collateral) / 1e18,
    },
    isLoading: result.isLoading,
  }
}

// ─── Read: market count ───────────────────────────────────────────────────────

export function usePerpMarketCount(): { count: bigint; isLoading: boolean } {
  const result = useReadContract({
    address: ENGINE ?? undefined,
    abi: PerpEngineABI,
    functionName: 'marketCount',
    query: { enabled: !!ENGINE, refetchInterval: 60_000 },
  })
  return {
    count: (result.data as bigint | undefined) ?? BigInt(0),
    isLoading: result.isLoading,
  }
}

// ─── Write: open position ─────────────────────────────────────────────────────

export type PerpActionPhase = 'idle' | 'approving' | 'pending' | 'done' | 'error'

export function useOpenPosition() {
  const [phase, setPhase] = useState<PerpActionPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()
  const { isConnected } = useAccount()

  const reset = useCallback(() => { setPhase('idle'); setError(null) }, [])

  const openPosition = useCallback(async (
    marketId: bigint,
    margin: bigint,       // G$ collateral to deposit as margin
    size: bigint,         // notional position size (margin * leverage)
    isLong: boolean,
  ) => {
    if (!isConnected) { setError('Wallet not connected'); return }
    if (!ENGINE || !VAULT) { setError('PerpEngine not deployed yet'); return }

    try {
      // 1. Approve G$ to MarginVault
      setPhase('approving')
      await writeContractAsync({
        address: CONTRACTS.GoodDollarToken,
        abi: ERC20ABI,
        functionName: 'approve',
        args: [VAULT, margin],
      })

      // 2. Deposit margin into MarginVault
      setPhase('pending')
      await writeContractAsync({
        address: VAULT,
        abi: MarginVaultABI,
        functionName: 'deposit',
        args: [margin],
      })

      // 3. Open position on PerpEngine
      await writeContractAsync({
        address: ENGINE,
        abi: PerpEngineABI,
        functionName: 'openPosition',
        args: [marketId, size, isLong, margin],
      })
      setPhase('done')
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setError(e?.shortMessage ?? e?.message ?? 'Transaction failed')
      setPhase('error')
    }
  }, [isConnected, writeContractAsync])

  return { openPosition, phase, error, reset, isConnected, isDeployed: !!ENGINE }
}

// ─── Write: close position ────────────────────────────────────────────────────

export function useClosePosition() {
  const [phase, setPhase] = useState<PerpActionPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()
  const { isConnected } = useAccount()

  const reset = useCallback(() => { setPhase('idle'); setError(null) }, [])

  const closePosition = useCallback(async (marketId: bigint) => {
    if (!isConnected) { setError('Wallet not connected'); return }
    if (!ENGINE) { setError('PerpEngine not deployed yet'); return }

    try {
      setPhase('pending')
      await writeContractAsync({
        address: ENGINE,
        abi: PerpEngineABI,
        functionName: 'closePosition',
        args: [marketId],
      })
      setPhase('done')
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setError(e?.shortMessage ?? e?.message ?? 'Transaction failed')
      setPhase('error')
    }
  }, [isConnected, writeContractAsync])

  return { closePosition, phase, error, reset, isConnected, isDeployed: !!ENGINE }
}
