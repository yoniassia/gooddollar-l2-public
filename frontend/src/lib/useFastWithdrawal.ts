import { useCallback, useState } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { parseUnits, type Address, type Hex, keccak256, encodePacked } from 'viem'

// ─── Contract Config ──────────────────────────────────────────────────────────

export const FAST_WITHDRAWAL_LP_ADDRESS =
  '0xefAB0Beb0A557E452b398035eA964948c750b2Fd' as const

export const FAST_WITHDRAWAL_LP_ABI = [
  // Read
  {
    name: 'feeBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'lpBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'lpETHBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalLiquidity',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalETHLiquidity',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'claimed',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  // Write — ERC20
  {
    name: 'depositLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address', name: 'token' }, { type: 'uint256', name: 'amount' }],
    outputs: [],
  },
  {
    name: 'withdrawLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address', name: 'token' }, { type: 'uint256', name: 'amount' }],
    outputs: [],
  },
  {
    name: 'claimFastWithdrawal',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'address', name: 'token' },
      { type: 'uint256', name: 'amount' },
      { type: 'address', name: 'to' },
      { type: 'bytes32', name: 'withdrawalHash' },
    ],
    outputs: [],
  },
  // Write — ETH
  {
    name: 'depositETHLiquidity',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'withdrawETHLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256', name: 'amount' }],
    outputs: [],
  },
  {
    name: 'claimFastETHWithdrawal',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'uint256', name: 'amount' },
      { type: 'address', name: 'to' },
      { type: 'bytes32', name: 'withdrawalHash' },
    ],
    outputs: [],
  },
  // Events
  {
    name: 'FastClaimed',
    type: 'event',
    inputs: [
      { type: 'bytes32', name: 'withdrawalHash', indexed: true },
      { type: 'address', name: 'user', indexed: true },
      { type: 'address', name: 'lp', indexed: true },
      { type: 'address', name: 'token' },
      { type: 'uint256', name: 'grossAmount' },
      { type: 'uint256', name: 'netAmount' },
      { type: 'uint256', name: 'fee' },
    ],
  },
] as const

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFastWithdrawal() {
  const { address } = useAccount()
  const [txHash, setTxHash] = useState<Hex | undefined>()

  // Read fee
  const { data: feeBps } = useReadContract({
    address: FAST_WITHDRAWAL_LP_ADDRESS,
    abi: FAST_WITHDRAWAL_LP_ABI,
    functionName: 'feeBps',
  })

  // Read total ETH liquidity
  const { data: totalETH } = useReadContract({
    address: FAST_WITHDRAWAL_LP_ADDRESS,
    abi: FAST_WITHDRAWAL_LP_ABI,
    functionName: 'totalETHLiquidity',
  })

  const { writeContractAsync } = useWriteContract()

  const { isLoading: confirming, isSuccess: confirmed } =
    useWaitForTransactionReceipt({ hash: txHash })

  // ── Actions ──

  const claimFastWithdrawal = useCallback(
    async (token: Address, amount: bigint, to: Address, withdrawalHash: Hex) => {
      const hash = await writeContractAsync({
        address: FAST_WITHDRAWAL_LP_ADDRESS,
        abi: FAST_WITHDRAWAL_LP_ABI,
        functionName: 'claimFastWithdrawal',
        args: [token, amount, to, withdrawalHash],
      })
      setTxHash(hash)
      return hash
    },
    [writeContractAsync],
  )

  const claimFastETHWithdrawal = useCallback(
    async (amount: bigint, to: Address, withdrawalHash: Hex) => {
      const hash = await writeContractAsync({
        address: FAST_WITHDRAWAL_LP_ADDRESS,
        abi: FAST_WITHDRAWAL_LP_ABI,
        functionName: 'claimFastETHWithdrawal',
        args: [amount, to, withdrawalHash],
      })
      setTxHash(hash)
      return hash
    },
    [writeContractAsync],
  )

  const depositLiquidity = useCallback(
    async (token: Address, amount: bigint) => {
      const hash = await writeContractAsync({
        address: FAST_WITHDRAWAL_LP_ADDRESS,
        abi: FAST_WITHDRAWAL_LP_ABI,
        functionName: 'depositLiquidity',
        args: [token, amount],
      })
      setTxHash(hash)
      return hash
    },
    [writeContractAsync],
  )

  const depositETHLiquidity = useCallback(
    async (amount: bigint) => {
      const hash = await writeContractAsync({
        address: FAST_WITHDRAWAL_LP_ADDRESS,
        abi: FAST_WITHDRAWAL_LP_ABI,
        functionName: 'depositETHLiquidity',
        value: amount,
      })
      setTxHash(hash)
      return hash
    },
    [writeContractAsync],
  )

  return {
    // State
    feeBps: feeBps ? Number(feeBps) : undefined,
    feePercent: feeBps ? Number(feeBps) / 100 : undefined, // e.g. 0.1 for 10 bps
    totalETHLiquidity: totalETH,
    confirming,
    confirmed,
    txHash,
    // Actions
    claimFastWithdrawal,
    claimFastETHWithdrawal,
    depositLiquidity,
    depositETHLiquidity,
  }
}
