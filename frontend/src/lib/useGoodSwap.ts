'use client'

import { useMemo, useCallback } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { CONTRACTS } from './chain'
import { GoodPoolABI, GoodDollarTokenABI } from './abi'

// ─── Pool registry ──────────────────────────────────────────────────────────

type PoolInfo = {
  address: Address
  tokenASymbol: string
  tokenBSymbol: string
  tokenAAddress: Address
  tokenBAddress: Address
  tokenADecimals: number
  tokenBDecimals: number
}

/**
 * Map of "SYMBOL_A/SYMBOL_B" → pool info.
 * Tokens are stored in canonical order (lower address = tokenA).
 */
const POOLS: Record<string, PoolInfo> = {
  'G$/WETH': {
    address: CONTRACTS.SwapPoolGdWeth,
    tokenASymbol: 'G$',
    tokenBSymbol: 'WETH',
    tokenAAddress: CONTRACTS.SwapGD,
    tokenBAddress: CONTRACTS.SwapWETH,
    tokenADecimals: 18,
    tokenBDecimals: 18,
  },
  'G$/USDC': {
    address: CONTRACTS.SwapPoolGdUsdc,
    tokenASymbol: 'G$',
    tokenBSymbol: 'USDC',
    tokenAAddress: CONTRACTS.SwapGD,
    tokenBAddress: CONTRACTS.SwapUSDC,
    tokenADecimals: 18,
    tokenBDecimals: 6,
  },
  'WETH/USDC': {
    address: CONTRACTS.SwapPoolWethUsdc,
    tokenASymbol: 'WETH',
    tokenBSymbol: 'USDC',
    tokenAAddress: CONTRACTS.SwapWETH,
    tokenBAddress: CONTRACTS.SwapUSDC,
    tokenADecimals: 18,
    tokenBDecimals: 6,
  },
}

/** Find the pool for a given token pair (order-independent). */
function findPool(symbolA: string, symbolB: string): PoolInfo | null {
  const key1 = `${symbolA}/${symbolB}`
  const key2 = `${symbolB}/${symbolA}`
  return POOLS[key1] ?? POOLS[key2] ?? null
}

/** Get the token address for the input side of the swap. */
function getTokenInAddress(pool: PoolInfo, inputSymbol: string): Address {
  return inputSymbol === pool.tokenASymbol ? pool.tokenAAddress : pool.tokenBAddress
}

function getTokenDecimals(pool: PoolInfo, symbol: string): number {
  return symbol === pool.tokenASymbol ? pool.tokenADecimals : pool.tokenBDecimals
}

// ─── Hook: useGoodSwapQuote ─────────────────────────────────────────────────

/**
 * Read-only quote: how much outputToken will I get for `amountIn` of inputToken?
 */
export function useGoodSwapQuote(
  inputSymbol: string,
  outputSymbol: string,
  amountIn: string,
) {
  const pool = useMemo(() => findPool(inputSymbol, outputSymbol), [inputSymbol, outputSymbol])

  const tokenIn = pool ? getTokenInAddress(pool, inputSymbol) : undefined
  const decimalsIn = pool ? getTokenDecimals(pool, inputSymbol) : 18
  const decimalsOut = pool ? getTokenDecimals(pool, outputSymbol) : 18

  const parsedAmount = useMemo(() => {
    try {
      const amt = parseFloat(amountIn)
      if (!amt || isNaN(amt) || amt <= 0) return undefined
      return parseUnits(amountIn, decimalsIn)
    } catch {
      return undefined
    }
  }, [amountIn, decimalsIn])

  const { data: rawAmountOut, isLoading, error } = useReadContract({
    address: pool?.address,
    abi: GoodPoolABI,
    functionName: 'getAmountOut',
    args: tokenIn && parsedAmount ? [tokenIn, parsedAmount] : undefined,
    query: { enabled: !!pool && !!tokenIn && !!parsedAmount },
  })

  const amountOut = useMemo(() => {
    if (!rawAmountOut) return ''
    return formatUnits(rawAmountOut as bigint, decimalsOut)
  }, [rawAmountOut, decimalsOut])

  return { amountOut, isLoading, error, pool }
}

// ─── Hook: useGoodSwapReserves ──────────────────────────────────────────────

/**
 * Read pool reserves for a given pair.
 */
export function useGoodSwapReserves(inputSymbol: string, outputSymbol: string) {
  const pool = useMemo(() => findPool(inputSymbol, outputSymbol), [inputSymbol, outputSymbol])

  const { data: reserveA } = useReadContract({
    address: pool?.address,
    abi: GoodPoolABI,
    functionName: 'reserveA',
    query: { enabled: !!pool },
  })

  const { data: reserveB } = useReadContract({
    address: pool?.address,
    abi: GoodPoolABI,
    functionName: 'reserveB',
    query: { enabled: !!pool },
  })

  return {
    reserveA: reserveA as bigint | undefined,
    reserveB: reserveB as bigint | undefined,
    pool,
  }
}

// ─── Hook: useGoodSwapExecute ───────────────────────────────────────────────

/**
 * Write hook: approve + swap on a GoodPool.
 *
 * Usage:
 *   const { approve, swap, isApproving, isSwapping, txHash } = useGoodSwapExecute()
 *   await approve(pool, tokenIn, amountIn)
 *   await swap(pool, tokenIn, amountIn, minOut)
 */
export function useGoodSwapExecute() {
  const { writeContractAsync: writeApprove, isPending: isApproving } = useWriteContract()
  const { writeContractAsync: writeSwap, isPending: isSwapping, data: txHash } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  const approve = useCallback(
    async (poolAddress: Address, tokenAddress: Address, amount: bigint) => {
      return writeApprove({
        address: tokenAddress,
        abi: GoodDollarTokenABI,
        functionName: 'approve',
        args: [poolAddress, amount],
      })
    },
    [writeApprove],
  )

  const swap = useCallback(
    async (poolAddress: Address, tokenIn: Address, amountIn: bigint, minOut: bigint) => {
      return writeSwap({
        address: poolAddress,
        abi: GoodPoolABI,
        functionName: 'swap',
        args: [tokenIn, amountIn, minOut],
      })
    },
    [writeSwap],
  )

  return {
    approve,
    swap,
    isApproving,
    isSwapping,
    isConfirming,
    isSuccess,
    txHash,
  }
}

// ─── Convenience: full swap flow ────────────────────────────────────────────

/**
 * Builds the full swap parameters for a token pair.
 */
export function buildSwapParams(
  inputSymbol: string,
  outputSymbol: string,
  amountIn: string,
  slippageBps: number = 50,
) {
  const pool = findPool(inputSymbol, outputSymbol)
  if (!pool) return null

  const tokenIn = getTokenInAddress(pool, inputSymbol)
  const decimalsIn = getTokenDecimals(pool, inputSymbol)

  const parsedAmountIn = parseUnits(amountIn, decimalsIn)

  return {
    poolAddress: pool.address,
    tokenIn,
    amountIn: parsedAmountIn,
    slippageBps,
  }
}

export { findPool, POOLS, type PoolInfo }
