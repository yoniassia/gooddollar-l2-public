'use client'

// ============================================================
// usePredictTrade — hook for buying YES/NO outcome tokens
// ============================================================
// Flow:
//   1. User approves G$ spend on MarketFactory
//   2. User calls MarketFactory.buy(marketId, isYES, amount)
//
// On-chain market IDs are numeric (0, 1, 2, ...).
// The frontend uses string slugs; call with the on-chain id
// parsed from the market data.

import { useCallback, useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits } from 'viem'
import { CONTRACTS } from './chain'
import { GoodDollarTokenABI, MarketFactoryABI } from './abi'

export type TradePhase = 'idle' | 'approving' | 'buying' | 'confirmed' | 'error'

export interface UsePredictTradeResult {
  isConnected: boolean
  address: `0x${string}` | undefined
  phase: TradePhase
  error: string | null
  buy: (onChainMarketId: bigint, isYES: boolean, amountG: string) => Promise<void>
  reset: () => void
}

export function usePredictTrade(): UsePredictTradeResult {
  const { isConnected, address } = useAccount()
  const [phase, setPhase] = useState<TradePhase>('idle')
  const [error, setError] = useState<string | null>(null)

  const { writeContractAsync } = useWriteContract()

  const reset = useCallback(() => {
    setPhase('idle')
    setError(null)
  }, [])

  const buy = useCallback(async (
    onChainMarketId: bigint,
    isYES: boolean,
    amountG: string,
  ) => {
    if (!isConnected || !address) {
      setError('Wallet not connected')
      return
    }

    const amountWei = parseUnits(amountG, 18)

    try {
      // Step 1: Approve G$ spend on MarketFactory
      setPhase('approving')
      const approveTxHash = await writeContractAsync({
        address: CONTRACTS.GoodDollarToken,
        abi: GoodDollarTokenABI,
        functionName: 'approve',
        args: [CONTRACTS.MarketFactory, amountWei],
      })

      // Step 2: Buy YES or NO tokens
      setPhase('buying')
      await writeContractAsync({
        address: CONTRACTS.MarketFactory,
        abi: MarketFactoryABI,
        functionName: 'buy',
        args: [onChainMarketId, isYES, amountWei],
      })

      setPhase('confirmed')
    } catch (err: any) {
      setError(err?.shortMessage ?? err?.message ?? 'Transaction failed')
      setPhase('error')
    }
  }, [isConnected, address, writeContractAsync])

  return { isConnected, address, phase, error, buy, reset }
}
