'use client'

import { useMemo, useCallback } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { CONTRACTS } from './chain'
import { GoodPoolABI, GoodDollarTokenABI } from './abi'

// ─── Pool registry ────────────────────────────────────────────────────────────

export type PoolKey = 'G$/WETH' | 'G$/USDC' | 'WETH/USDC'

export interface PoolMeta {
  key: PoolKey
  address: Address
  tokenASymbol: string
  tokenBSymbol: string
  tokenAAddress: Address
  tokenBAddress: Address
  tokenADecimals: number
  tokenBDecimals: number
  feeBps: number       // swap fee basis points
  ubiBps: number       // UBI share of fee basis points
}

export const POOL_LIST: PoolMeta[] = [
  {
    key: 'G$/WETH',
    address: CONTRACTS.SwapPoolGdWeth,
    tokenASymbol: 'G$',
    tokenBSymbol: 'WETH',
    tokenAAddress: CONTRACTS.SwapGD,
    tokenBAddress: CONTRACTS.SwapWETH,
    tokenADecimals: 18,
    tokenBDecimals: 18,
    feeBps: 30,
    ubiBps: 10,
  },
  {
    key: 'G$/USDC',
    address: CONTRACTS.SwapPoolGdUsdc,
    tokenASymbol: 'G$',
    tokenBSymbol: 'USDC',
    tokenAAddress: CONTRACTS.SwapGD,
    tokenBAddress: CONTRACTS.SwapUSDC,
    tokenADecimals: 18,
    tokenBDecimals: 6,
    feeBps: 30,
    ubiBps: 10,
  },
  {
    key: 'WETH/USDC',
    address: CONTRACTS.SwapPoolWethUsdc,
    tokenASymbol: 'WETH',
    tokenBSymbol: 'USDC',
    tokenAAddress: CONTRACTS.SwapWETH,
    tokenBAddress: CONTRACTS.SwapUSDC,
    tokenADecimals: 18,
    tokenBDecimals: 6,
    feeBps: 30,
    ubiBps: 10,
  },
]

export function getPool(key: PoolKey): PoolMeta {
  const pool = POOL_LIST.find(p => p.key === key)
  if (!pool) throw new Error(`Unknown pool: ${key}`)
  return pool
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a human-readable amount string to bigint for a token with `decimals`. */
export function parsePoolAmount(value: string, decimals: number): bigint {
  if (!value || value === '' || value === '0') return BigInt(0)
  try {
    const n = parseFloat(value)
    if (isNaN(n) || n <= 0) return BigInt(0)
    return parseUnits(value, decimals)
  } catch {
    return BigInt(0)
  }
}

/** Format a bigint token amount to a human-readable string. */
export function formatPoolAmount(amount: bigint | undefined, decimals: number): number {
  if (amount === undefined || amount === BigInt(0)) return 0
  return parseFloat(formatUnits(amount, decimals))
}

// ─── Hook: usePoolReserves ────────────────────────────────────────────────────

/**
 * Read live reserve balances and total liquidity for a pool.
 */
export function usePoolReserves(key: PoolKey) {
  const pool = useMemo(() => getPool(key), [key])

  const { data: reserveA, isLoading: loadingA } = useReadContract({
    address: pool.address,
    abi: GoodPoolABI,
    functionName: 'reserveA',
  })

  const { data: reserveB, isLoading: loadingB } = useReadContract({
    address: pool.address,
    abi: GoodPoolABI,
    functionName: 'reserveB',
  })

  const { data: totalLiquidity, isLoading: loadingL } = useReadContract({
    address: pool.address,
    abi: GoodPoolABI,
    functionName: 'totalLiquidity',
  })

  const { data: spotPrice } = useReadContract({
    address: pool.address,
    abi: GoodPoolABI,
    functionName: 'spotPrice',
  })

  const reserveAFormatted = formatPoolAmount(reserveA as bigint | undefined, pool.tokenADecimals)
  const reserveBFormatted = formatPoolAmount(reserveB as bigint | undefined, pool.tokenBDecimals)
  const totalLiquidityFormatted = formatPoolAmount(totalLiquidity as bigint | undefined, 18)

  // spot price is stored as tokenB per tokenA with 18 decimals
  const spotPriceFormatted = spotPrice
    ? parseFloat(formatUnits(spotPrice as bigint, 18))
    : null

  return {
    reserveA: reserveA as bigint | undefined,
    reserveB: reserveB as bigint | undefined,
    totalLiquidity: totalLiquidity as bigint | undefined,
    reserveAFormatted,
    reserveBFormatted,
    totalLiquidityFormatted,
    spotPriceFormatted,
    isLoading: loadingA || loadingB || loadingL,
    pool,
  }
}

// ─── Hook: useUserLiquidity ───────────────────────────────────────────────────

/**
 * Read the LP balance for `userAddress` in a pool.
 */
export function useUserLiquidity(key: PoolKey, userAddress: Address | undefined) {
  const pool = useMemo(() => getPool(key), [key])

  const { data: userLp, isLoading } = useReadContract({
    address: pool.address,
    abi: GoodPoolABI,
    functionName: 'liquidity',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  })

  const { data: totalLp } = useReadContract({
    address: pool.address,
    abi: GoodPoolABI,
    functionName: 'totalLiquidity',
    query: { enabled: !!userAddress },
  })

  const userLpFormatted = formatPoolAmount(userLp as bigint | undefined, 18)
  const totalLpFormatted = formatPoolAmount(totalLp as bigint | undefined, 18)

  const sharePercent = totalLpFormatted > 0
    ? (userLpFormatted / totalLpFormatted) * 100
    : 0

  return {
    userLp: userLp as bigint | undefined,
    userLpFormatted,
    sharePercent,
    isLoading,
  }
}

// ─── Hook: useAddLiquidity ────────────────────────────────────────────────────

/**
 * Approve + addLiquidity flow for a pool.
 *
 * Usage:
 *   const { approveA, approveB, addLiquidity, ... } = useAddLiquidity('G$/WETH')
 *   await approveA(amountA)    // approve pool to spend tokenA
 *   await approveB(amountB)    // approve pool to spend tokenB
 *   await addLiquidity(amountA, amountB)
 */
export function useAddLiquidity(key: PoolKey) {
  const pool = useMemo(() => getPool(key), [key])

  const { writeContractAsync: writeApproveA, isPending: isApprovingA } = useWriteContract()
  const { writeContractAsync: writeApproveB, isPending: isApprovingB } = useWriteContract()
  const { writeContractAsync: writeAdd, isPending: isAdding, data: txHash } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const approveA = useCallback(
    (amount: bigint) =>
      writeApproveA({
        address: pool.tokenAAddress,
        abi: GoodDollarTokenABI,
        functionName: 'approve',
        args: [pool.address, amount],
      }),
    [writeApproveA, pool],
  )

  const approveB = useCallback(
    (amount: bigint) =>
      writeApproveB({
        address: pool.tokenBAddress,
        abi: GoodDollarTokenABI,
        functionName: 'approve',
        args: [pool.address, amount],
      }),
    [writeApproveB, pool],
  )

  const addLiquidity = useCallback(
    (amountA: bigint, amountB: bigint) =>
      writeAdd({
        address: pool.address,
        abi: GoodPoolABI,
        functionName: 'addLiquidity',
        args: [amountA, amountB],
      }),
    [writeAdd, pool],
  )

  return {
    approveA,
    approveB,
    addLiquidity,
    isApprovingA,
    isApprovingB,
    isAdding,
    isConfirming,
    isSuccess,
    txHash,
    pool,
  }
}

// ─── Hook: useRemoveLiquidity ─────────────────────────────────────────────────

/**
 * removeLiquidity flow for a pool.
 */
export function useRemoveLiquidity(key: PoolKey) {
  const pool = useMemo(() => getPool(key), [key])

  const { writeContractAsync: writeRemove, isPending: isRemoving, data: txHash } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const removeLiquidity = useCallback(
    (lpAmount: bigint) =>
      writeRemove({
        address: pool.address,
        abi: GoodPoolABI,
        functionName: 'removeLiquidity',
        args: [lpAmount],
      }),
    [writeRemove, pool],
  )

  return {
    removeLiquidity,
    isRemoving,
    isConfirming,
    isSuccess,
    txHash,
    pool,
  }
}

// ─── Hook: useTokenAllowance ──────────────────────────────────────────────────

/**
 * Check token allowance granted to a pool.
 */
export function useTokenAllowance(
  tokenAddress: Address,
  owner: Address | undefined,
  spender: Address,
) {
  const { data: allowance } = useReadContract({
    address: tokenAddress,
    abi: GoodDollarTokenABI,
    functionName: 'allowance',
    args: owner ? [owner, spender] : undefined,
    query: { enabled: !!owner },
  })

  return allowance as bigint | undefined
}
