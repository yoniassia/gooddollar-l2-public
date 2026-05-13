'use client'

import { useState, useCallback } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract } from 'wagmi'
import { CONTRACTS } from './chain'

const AgentRegistryWriteABI = [
  {
    type: 'function',
    name: 'registerAgent',
    inputs: [
      { name: 'agent', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'avatarURI', type: 'string' },
      { name: 'strategy', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isRegistered',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

const REGISTRY = CONTRACTS.AgentRegistry

export type RegistrationStatus = 'idle' | 'confirming' | 'pending' | 'success' | 'error'

export interface UseAgentRegisterReturn {
  register: (agentAddress: `0x${string}`, name: string, avatarURI: string, strategy: string) => void
  status: RegistrationStatus
  error: string | null
  txHash: `0x${string}` | undefined
  isAlreadyRegistered: boolean
  isConnected: boolean
  address: `0x${string}` | undefined
}

export function useAgentRegister(agentAddress?: `0x${string}`): UseAgentRegisterReturn {
  const { address, isConnected } = useAccount()
  const [error, setError] = useState<string | null>(null)

  const { writeContract, data: txHash, isPending: isWritePending, error: writeError } = useWriteContract()
  const { isLoading: isTxPending, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  // Check if agent is already registered
  const { data: isAlreadyRegistered } = useReadContract({
    address: REGISTRY,
    abi: AgentRegistryWriteABI,
    functionName: 'isRegistered',
    args: agentAddress ? [agentAddress] : undefined,
    query: { enabled: !!agentAddress },
  })

  const register = useCallback(
    (agentAddr: `0x${string}`, name: string, avatarURI: string, strategy: string) => {
      setError(null)
      if (!isConnected) {
        setError('Please connect your wallet first')
        return
      }
      if (!name.trim()) {
        setError('Agent name is required')
        return
      }
      writeContract({
        address: REGISTRY,
        abi: AgentRegistryWriteABI,
        functionName: 'registerAgent',
        args: [agentAddr, name, avatarURI, strategy],
      })
    },
    [isConnected, writeContract]
  )

  let status: RegistrationStatus = 'idle'
  if (isWritePending) status = 'confirming'
  else if (isTxPending) status = 'pending'
  else if (isSuccess) status = 'success'
  else if (writeError || error) status = 'error'

  return {
    register,
    status,
    error: writeError?.message || error,
    txHash,
    isAlreadyRegistered: !!isAlreadyRegistered,
    isConnected,
    address,
  }
}
