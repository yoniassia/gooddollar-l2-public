'use client'

/**
 * useMultiChainBridge — React hook for the MultiChainBridge router contract.
 *
 * Provides:
 *  - bridgeTokens() / bridgeETH() — initiate cross-chain bridge
 *  - getRouteInfo() — determine which route will be used
 *  - getUserRequests() — fetch user's bridge history
 *  - supportedChains — list of supported destination chains
 */

import { useState, useCallback } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { parseUnits } from 'viem'

// ─── ABI (minimal) ───────────────────────────────────────────────────────────

const MULTI_CHAIN_BRIDGE_ABI = [
  {
    name: 'bridgeTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'destChainId', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'minOutput', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'useFastWithdrawal', type: 'bool' },
    ],
    outputs: [{ name: 'requestId', type: 'uint256' }],
  },
  {
    name: 'bridgeETH',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'destChainId', type: 'uint256' },
      { name: 'receiver', type: 'address' },
      { name: 'minOutput', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'useFastWithdrawal', type: 'bool' },
    ],
    outputs: [{ name: 'requestId', type: 'uint256' }],
  },
  {
    name: 'getRouteInfo',
    type: 'function',
    stateMutability: 'pure',
    inputs: [
      { name: 'destChainId', type: 'uint256' },
      { name: 'useFastWithdrawal', type: 'bool' },
    ],
    outputs: [
      { name: 'routeType', type: 'uint8' },
      { name: 'description', type: 'string' },
    ],
  },
  {
    name: 'getUserRequests',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'getRequest',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'requestId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'user', type: 'address' },
          { name: 'srcToken', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'destChainId', type: 'uint256' },
          { name: 'destToken', type: 'address' },
          { name: 'destReceiver', type: 'address' },
          { name: 'routeType', type: 'uint8' },
          { name: 'timestamp', type: 'uint256' },
          { name: 'completed', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'supportedChains',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'routingFeeBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ─── Constants ────────────────────────────────────────────────────────────────

// Will be set from deployment. Placeholder for now.
const MULTI_CHAIN_BRIDGE_ADDRESS = process.env.NEXT_PUBLIC_MULTI_CHAIN_BRIDGE_ADDRESS as `0x${string}` | undefined

export const BRIDGE_CHAINS = [
  { id: 1,     name: 'Ethereum',   shortName: 'ETH',   icon: '⟠' },
  { id: 42161, name: 'Arbitrum',   shortName: 'ARB',   icon: '🔵' },
  { id: 10,    name: 'Optimism',   shortName: 'OP',    icon: '🔴' },
  { id: 137,   name: 'Polygon',    shortName: 'MATIC', icon: '🟣' },
  { id: 8453,  name: 'Base',       shortName: 'BASE',  icon: '🔵' },
  { id: 56,    name: 'BNB Chain',  shortName: 'BNB',   icon: '🟡' },
  { id: 43114, name: 'Avalanche',  shortName: 'AVAX',  icon: '🔺' },
] as const

export type BridgeChainId = typeof BRIDGE_CHAINS[number]['id']

export enum RouteType {
  NativeBridge = 0,
  LiFiCrossChain = 1,
  FastWithdrawal = 2,
}

export const ROUTE_TYPE_LABELS: Record<RouteType, string> = {
  [RouteType.NativeBridge]: 'OP Stack Native Bridge',
  [RouteType.LiFiCrossChain]: 'Li.Fi Cross-Chain',
  [RouteType.FastWithdrawal]: 'Fast Withdrawal (LP)',
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseMultiChainBridgeResult {
  // Route info
  routeType: RouteType | null
  routeDescription: string | null
  routingFeeBps: number | null

  // Actions
  bridgeTokens: (params: {
    token: `0x${string}`
    amount: bigint
    destChainId: number
    receiver: `0x${string}`
    minOutput: bigint
    useFastWithdrawal: boolean
  }) => void
  bridgeETH: (params: {
    destChainId: number
    receiver: `0x${string}`
    minOutput: bigint
    value: bigint
    useFastWithdrawal: boolean
  }) => void

  // State
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error: string | null
  txHash: `0x${string}` | undefined

  // User history
  userRequestIds: readonly bigint[] | undefined
}

export function useMultiChainBridge(
  destChainId: number,
  useFastWithdrawal: boolean = false
): UseMultiChainBridgeResult {
  const { address } = useAccount()
  const [error, setError] = useState<string | null>(null)

  const contractAddress = MULTI_CHAIN_BRIDGE_ADDRESS

  // Route info
  const { data: routeInfo } = useReadContract({
    address: contractAddress,
    abi: MULTI_CHAIN_BRIDGE_ABI,
    functionName: 'getRouteInfo',
    args: [BigInt(destChainId), useFastWithdrawal],
    query: { enabled: !!contractAddress },
  })

  // Routing fee
  const { data: feeBps } = useReadContract({
    address: contractAddress,
    abi: MULTI_CHAIN_BRIDGE_ABI,
    functionName: 'routingFeeBps',
    query: { enabled: !!contractAddress },
  })

  // User requests
  const { data: userRequestIds } = useReadContract({
    address: contractAddress,
    abi: MULTI_CHAIN_BRIDGE_ABI,
    functionName: 'getUserRequests',
    args: address ? [address] : undefined,
    query: { enabled: !!contractAddress && !!address },
  })

  // Write: bridge tokens
  const {
    writeContract: writeBridgeTokens,
    data: tokensTxHash,
    isPending: isTokensPending,
    error: tokensError,
  } = useWriteContract()

  // Write: bridge ETH
  const {
    writeContract: writeBridgeETH,
    data: ethTxHash,
    isPending: isETHPending,
    error: ethError,
  } = useWriteContract()

  const txHash = tokensTxHash || ethTxHash

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  const bridgeTokens = useCallback((params: {
    token: `0x${string}`
    amount: bigint
    destChainId: number
    receiver: `0x${string}`
    minOutput: bigint
    useFastWithdrawal: boolean
  }) => {
    if (!contractAddress) {
      setError('MultiChainBridge not deployed')
      return
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
    writeBridgeTokens({
      address: contractAddress,
      abi: MULTI_CHAIN_BRIDGE_ABI,
      functionName: 'bridgeTokens',
      args: [
        params.token,
        params.amount,
        BigInt(params.destChainId),
        params.receiver,
        params.minOutput,
        deadline,
        params.useFastWithdrawal,
      ],
    })
  }, [contractAddress, writeBridgeTokens])

  const bridgeETH = useCallback((params: {
    destChainId: number
    receiver: `0x${string}`
    minOutput: bigint
    value: bigint
    useFastWithdrawal: boolean
  }) => {
    if (!contractAddress) {
      setError('MultiChainBridge not deployed')
      return
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
    writeBridgeETH({
      address: contractAddress,
      abi: MULTI_CHAIN_BRIDGE_ABI,
      functionName: 'bridgeETH',
      args: [
        BigInt(params.destChainId),
        params.receiver,
        params.minOutput,
        deadline,
        params.useFastWithdrawal,
      ],
      value: params.value,
    })
  }, [contractAddress, writeBridgeETH])

  return {
    routeType: routeInfo ? Number(routeInfo[0]) as RouteType : null,
    routeDescription: routeInfo ? routeInfo[1] : null,
    routingFeeBps: feeBps != null ? Number(feeBps) : null,
    bridgeTokens,
    bridgeETH,
    isPending: isTokensPending || isETHPending,
    isConfirming,
    isSuccess,
    error: error || (tokensError?.message ?? ethError?.message ?? null),
    txHash,
    userRequestIds,
  }
}
