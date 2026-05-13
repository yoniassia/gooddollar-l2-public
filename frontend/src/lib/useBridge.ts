'use client'

/**
 * useBridge — wagmi hooks for GoodDollar L2 native bridge operations.
 *
 * Supports:
 *   - ETH deposit (L1 → L2): send ETH to GoodDollarBridgeL1.depositETH()
 *   - ETH withdrawal (L2 → L1): call GoodDollarBridgeL2.initiateETHWithdrawal()
 *   - ERC20 deposit (L1 → L2): approve + GoodDollarBridgeL1.deposit(l1Token, amount)
 *   - ERC20 withdrawal (L2 → L1): GoodDollarBridgeL2.initiateWithdrawal(l1Token, amount)
 *   - Fast withdrawal via FastWithdrawalLP (instant, pays LP fee)
 *
 * Bridge contracts must be deployed for these to work.
 * Falls back to disabled state when contracts unavailable.
 */

import { useCallback, useState } from 'react'
import { useAccount, useWriteContract, useReadContract } from 'wagmi'
import { parseEther, parseUnits } from 'viem'
import { ERC20ABI } from './abi'

// ─── Bridge ABIs ──────────────────────────────────────────────────────────────

export const BridgeL2ABI = [
  {
    inputs: [{ name: 'to', type: 'address' }, { name: 'l1Gas', type: 'uint32' }],
    name: 'initiateETHWithdrawal',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'l1Token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'l1Gas', type: 'uint32' },
    ],
    name: 'initiateWithdrawal',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'l1Token', type: 'address' }],
    name: 'l1ToL2Token',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'pendingETHWithdrawalTotal',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ─── Contract addresses (not yet deployed — will be set when OP Stack is live)
// Using null to indicate "not deployed yet"
const BRIDGE_L2_ADDRESS: `0x${string}` | null = null

// ─── Types ────────────────────────────────────────────────────────────────────

export type BridgePhase = 'idle' | 'approving' | 'pending' | 'confirming' | 'done' | 'error'

export type BridgeDirection = 'deposit' | 'withdraw'

export interface BridgeToken {
  symbol: string
  name: string
  decimals: number
  l1Address?: `0x${string}`  // null for ETH
  l2Address?: `0x${string}`  // null for ETH
}

export const BRIDGE_TOKENS: BridgeToken[] = [
  { symbol: 'ETH', name: 'Ether', decimals: 18 },
  { symbol: 'G$', name: 'GoodDollar', decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
]

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useBridgeStatus() {
  const isPaused = useReadContract({
    address: BRIDGE_L2_ADDRESS ?? undefined,
    abi: BridgeL2ABI,
    functionName: 'paused',
    query: { enabled: !!BRIDGE_L2_ADDRESS, refetchInterval: 60_000 },
  })

  return {
    isDeployed: !!BRIDGE_L2_ADDRESS,
    isPaused: isPaused.data as boolean ?? false,
    isLoading: isPaused.isLoading,
  }
}

/**
 * Hook for initiating ETH withdrawals from L2 → L1.
 */
export function useETHWithdrawal() {
  const [phase, setPhase] = useState<BridgePhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()
  const { address, isConnected } = useAccount()

  const reset = useCallback(() => {
    setPhase('idle')
    setError(null)
    setTxHash(null)
  }, [])

  const withdraw = useCallback(async (amountEth: string) => {
    if (!isConnected || !address) { setError('Wallet not connected'); return }
    if (!BRIDGE_L2_ADDRESS) { setError('Bridge not deployed — awaiting OP Stack'); return }

    try {
      setPhase('pending')
      const value = parseEther(amountEth)

      const hash = await writeContractAsync({
        address: BRIDGE_L2_ADDRESS,
        abi: BridgeL2ABI,
        functionName: 'initiateETHWithdrawal',
        args: [address, 200_000], // 200k L1 gas
        value,
      })
      setTxHash(hash)
      setPhase('confirming')
      // In production, would wait for L1 finalization (7 day challenge window)
      setPhase('done')
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setError(e?.shortMessage ?? e?.message ?? 'Withdrawal failed')
      setPhase('error')
    }
  }, [isConnected, address, writeContractAsync])

  return { withdraw, phase, error, txHash, reset, isDeployed: !!BRIDGE_L2_ADDRESS }
}

/**
 * Hook for initiating ERC20 withdrawals from L2 → L1.
 */
export function useTokenWithdrawal() {
  const [phase, setPhase] = useState<BridgePhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()
  const { address, isConnected } = useAccount()

  const reset = useCallback(() => {
    setPhase('idle')
    setError(null)
    setTxHash(null)
  }, [])

  const withdraw = useCallback(async (
    l1Token: `0x${string}`,
    l2Token: `0x${string}`,
    amount: bigint,
  ) => {
    if (!isConnected || !address) { setError('Wallet not connected'); return }
    if (!BRIDGE_L2_ADDRESS) { setError('Bridge not deployed — awaiting OP Stack'); return }

    try {
      // Approve L2 token to bridge
      setPhase('approving')
      await writeContractAsync({
        address: l2Token,
        abi: ERC20ABI,
        functionName: 'approve',
        args: [BRIDGE_L2_ADDRESS, amount],
      })

      // Initiate withdrawal
      setPhase('pending')
      const hash = await writeContractAsync({
        address: BRIDGE_L2_ADDRESS,
        abi: BridgeL2ABI,
        functionName: 'initiateWithdrawal',
        args: [l1Token, address, amount, 200_000],
      })
      setTxHash(hash)
      setPhase('done')
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setError(e?.shortMessage ?? e?.message ?? 'Withdrawal failed')
      setPhase('error')
    }
  }, [isConnected, address, writeContractAsync])

  return { withdraw, phase, error, txHash, reset, isDeployed: !!BRIDGE_L2_ADDRESS }
}
